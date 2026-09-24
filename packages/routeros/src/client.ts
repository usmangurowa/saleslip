import { createHash } from "node:crypto";
import { connect as netConnect } from "node:net";
import type { Socket } from "node:net";

import type { RouterOsConfig, RouterOsRow, RouterOsTransport } from "./types";
import { RouterOsCommandError, RouterOsUnavailableError } from "./errors";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * RouterOS API client speaking the wire protocol directly (v6.43+ login).
 *
 * The previous `node-routeros` library crashes on RouterOS 7.x `!empty`
 * sentences: it throws from inside the socket data handler, which no try/catch
 * in our code can reach. This connector treats `!empty` as the no-op it is.
 *
 * Commands are serialized through a promise queue, so each reply is matched to
 * the single in-flight command instead of using `.tag=` words.
 */

// --- word framing -----------------------------------------------------------

const encodeWord = (text: string): Buffer => {
  const payload = Buffer.from(text, "utf8");
  const length = payload.length;
  let header: number[];
  if (length < 0x80) {
    header = [length];
  } else if (length < 0x4000) {
    header = [0x80 | (length >> 8), length & 0xff];
  } else if (length < 0x200000) {
    header = [0xc0 | (length >> 16), (length >> 8) & 0xff, length & 0xff];
  } else if (length < 0x10000000) {
    header = [
      0xe0 | (length >>> 24),
      (length >>> 16) & 0xff,
      (length >>> 8) & 0xff,
      length & 0xff,
    ];
  } else {
    header = [
      0xf0,
      (length >>> 24) & 0xff,
      (length >>> 16) & 0xff,
      (length >>> 8) & 0xff,
      length & 0xff,
    ];
  }
  return Buffer.concat([Buffer.from(header), payload]);
};

const encodeSentence = (words: string[]): Buffer =>
  Buffer.concat([...words.map(encodeWord), Buffer.from([0])]);

/** Returns [offset after the length bytes, word length] or null when truncated. */
const decodeLength = (
  buffer: Buffer,
  offset: number,
): readonly [number, number] | null => {
  if (offset >= buffer.length) return null;
  const first = buffer.readUInt8(offset);
  const start = offset + 1;
  if (first < 0x80) return [start, first];
  if ((first & 0xe0) === 0x80) {
    if (start >= buffer.length) return null;
    return [start + 1, ((first & 0x3f) << 8) | buffer.readUInt8(start)];
  }
  if ((first & 0xf0) === 0xc0) {
    if (start + 1 >= buffer.length) return null;
    return [
      start + 2,
      ((first & 0x1f) << 16) |
        (buffer.readUInt8(start) << 8) |
        buffer.readUInt8(start + 1),
    ];
  }
  if ((first & 0xf8) === 0xe0) {
    if (start + 2 >= buffer.length) return null;
    return [
      start + 3,
      ((first & 0x0f) << 24) |
        (buffer.readUInt8(start) << 16) |
        (buffer.readUInt8(start + 1) << 8) |
        buffer.readUInt8(start + 2),
    ];
  }
  if (first === 0xf0) {
    if (start + 3 >= buffer.length) return null;
    return [
      start + 4,
      (buffer.readUInt8(start) << 24) |
        (buffer.readUInt8(start + 1) << 16) |
        (buffer.readUInt8(start + 2) << 8) |
        buffer.readUInt8(start + 3),
    ];
  }
  throw new RouterOsUnavailableError("malformed length prefix from router");
};

const tryReadSentence = (
  buffer: Buffer,
): readonly [words: string[], rest: Buffer] | null => {
  const words: string[] = [];
  let offset = 0;
  for (;;) {
    const decoded = decodeLength(buffer, offset);
    if (!decoded) return null;
    const [next, length] = decoded;
    if (length === 0) return [words, buffer.subarray(next)];
    if (next + length > buffer.length) return null;
    words.push(buffer.subarray(next, next + length).toString("utf8"));
    offset = next + length;
  }
};

// --- reply helpers -----------------------------------------------------------

const paramValue = (words: string[], key: string): string | undefined => {
  const prefix = `=${key}=`;
  const word = words.find((candidate) => candidate.startsWith(prefix));
  return word === undefined ? undefined : word.slice(prefix.length);
};

const trapMessage = (words: string[]): string =>
  paramValue(words, "message") ?? "unknown router error";

const parseRow = (words: string[]): RouterOsRow => {
  const row: Record<string, string> = {};
  for (const word of words) {
    if (!word.startsWith("=")) continue;
    const separator = word.indexOf("=", 1);
    if (separator === -1) continue;
    row[word.slice(1, separator)] = word.slice(separator + 1);
  }
  return row;
};

/** MD5 challenge response for pre-6.43 routers: `00` + md5(\\0 + password + challenge). */
const challengeResponse = (password: string, challenge: string): string => {
  const digest = createHash("md5")
    .update(
      Buffer.concat([
        Buffer.from([0]),
        Buffer.from(password, "utf8"),
        Buffer.from(challenge, "hex"),
      ]),
    )
    .digest("hex");
  return `00${digest}`;
};

const withTimeout = async <T>(
  operation: Promise<T>,
  ms: number,
  label: string,
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new RouterOsUnavailableError(`${label} timed out`)),
      ms,
    );
    timer.unref();
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

// --- connection --------------------------------------------------------------

type SentenceHandler = (words: string[]) => void;
type CloseHandler = (error: Error | null) => void;

class RouterOsConnection {
  private buffer = Buffer.alloc(0);
  private terminated = false;
  sentenceHandler: SentenceHandler | null = null;
  closeHandler: CloseHandler | null = null;

  constructor(readonly socket: Socket) {
    socket.on("data", (chunk: Buffer) => this.receive(chunk));
    socket.on("error", (error: Error) => this.terminate(error));
    socket.on("close", () => this.terminate(null));
  }

  get isTerminated(): boolean {
    return this.terminated;
  }

  send(words: string[]): void {
    if (this.terminated) {
      throw new RouterOsUnavailableError("router connection is closed");
    }
    this.socket.write(encodeSentence(words), (error) => {
      if (error) this.terminate(error);
    });
  }

  destroy(): void {
    this.terminate(null);
    this.socket.destroy();
  }

  private receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const parsed = tryReadSentence(this.buffer);
      if (!parsed) return;
      const [words, rest] = parsed;
      this.buffer = Buffer.from(rest);
      this.sentenceHandler?.(words);
    }
  }

  private terminate(error: Error | null): void {
    if (this.terminated) return;
    this.terminated = true;
    const handler = this.closeHandler;
    this.sentenceHandler = null;
    this.closeHandler = null;
    handler?.(error);
  }
}

// --- client -------------------------------------------------------------------

export const createRouterOsClient = (
  config: RouterOsConfig,
): RouterOsTransport => {
  const { host, port = 8728, user, password } = config;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = `${host}:${port}`;

  let connection: RouterOsConnection | null = null;
  let connecting: Promise<RouterOsConnection> | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  const drop = () => {
    const current = connection;
    connection = null;
    current?.destroy();
  };

  const waitForSocket = (socket: Socket): Promise<void> =>
    withTimeout(
      new Promise<void>((resolve, reject) => {
        socket.once("connect", () => resolve());
        socket.once("error", (error: Error) =>
          reject(
            new RouterOsUnavailableError(
              `connect to ${endpoint} failed`,
              error,
            ),
          ),
        );
      }),
      timeoutMs,
      `connect to ${endpoint}`,
    );

  const login = (conn: RouterOsConnection): Promise<void> =>
    withTimeout(
      new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (settle: () => void) => {
          if (settled) return;
          settled = true;
          conn.sentenceHandler = null;
          conn.closeHandler = null;
          settle();
        };
        const rejectTrap = (words: string[]) =>
          reject(
            new RouterOsUnavailableError(
              `connect to ${endpoint} failed: ${trapMessage(words)}`,
            ),
          );
        const sendChallengeResponse = (challenge: string) => {
          conn.sentenceHandler = (words) => {
            const type = words[0];
            if (type === "!done") finish(resolve);
            else if (type === "!trap") finish(() => rejectTrap(words));
          };
          conn.send([
            "/login",
            `=name=${user}`,
            `=response=${challengeResponse(password, challenge)}`,
          ]);
        };
        conn.closeHandler = (error) =>
          finish(() =>
            reject(
              new RouterOsUnavailableError(
                `connect to ${endpoint} failed`,
                error ?? undefined,
              ),
            ),
          );
        conn.sentenceHandler = (words) => {
          const type = words[0];
          if (type === "!done") {
            const challenge = paramValue(words, "ret");
            if (challenge === undefined) finish(resolve);
            else sendChallengeResponse(challenge);
          } else if (type === "!trap") {
            finish(() => rejectTrap(words));
          }
          // `!re` and other sentence types carry no login state; ignore them.
        };
        conn.send(["/login", `=name=${user}`, `=password=${password}`]);
      }),
      timeoutMs,
      `connect to ${endpoint}`,
    );

  const getConnection = (): Promise<RouterOsConnection> => {
    if (connection && !connection.isTerminated) {
      return Promise.resolve(connection);
    }
    if (connecting) return connecting;
    connecting = (async () => {
      const socket = netConnect({ host, port });
      const conn = new RouterOsConnection(socket);
      try {
        await waitForSocket(socket);
        await login(conn);
      } catch (error) {
        conn.destroy();
        throw error instanceof RouterOsUnavailableError
          ? error
          : new RouterOsUnavailableError(
              `connect to ${endpoint} failed`,
              error,
            );
      }
      connection = conn;
      conn.closeHandler = () => {
        if (connection === conn) connection = null;
      };
      return conn;
    })().finally(() => {
      connecting = null;
    });
    return connecting;
  };

  const runCommand = (
    conn: RouterOsConnection,
    command: string,
    params: string[],
  ): Promise<RouterOsRow[]> =>
    withTimeout(
      new Promise<RouterOsRow[]>((resolve, reject) => {
        let settled = false;
        const rows: RouterOsRow[] = [];
        const finish = (settle: () => void) => {
          if (settled) return;
          settled = true;
          conn.sentenceHandler = null;
          conn.closeHandler = null;
          settle();
        };
        conn.closeHandler = (error) =>
          finish(() =>
            reject(
              new RouterOsUnavailableError(
                `${command} failed`,
                error ?? undefined,
              ),
            ),
          );
        conn.sentenceHandler = (words) => {
          switch (words[0]) {
            case "!re":
              rows.push(parseRow(words));
              return;
            case "!done": {
              const ret = paramValue(words, "ret");
              if (ret !== undefined) rows.push({ ret });
              finish(() => resolve(rows));
              return;
            }
            case "!trap":
              finish(() =>
                reject(new RouterOsCommandError(command, trapMessage(words))),
              );
              return;
            case "!fatal":
              finish(() =>
                reject(
                  new RouterOsUnavailableError(
                    `${command} failed: ${trapMessage(words)}`,
                  ),
                ),
              );
              conn.destroy();
              return;
            case "!empty":
              // RouterOS 7.x marks empty results with !empty; the !done that
              // follows completes the command. It is a no-op.
              return;
            default:
              return;
          }
        };
        conn.send([command, ...params]);
      }),
      timeoutMs,
      command,
    );

  return {
    async write(command, params = []) {
      const run = queue.then(async () => {
        const conn = await getConnection();
        try {
          return await runCommand(conn, command, params);
        } catch (error) {
          if (error instanceof RouterOsCommandError) throw error;
          // Any transport-level failure invalidates the connection.
          drop();
          if (error instanceof RouterOsUnavailableError) throw error;
          throw new RouterOsUnavailableError(`${command} failed`, error);
        }
      });
      // Keep the queue usable after a failure.
      queue = run.catch(() => undefined);
      return run;
    },
    close() {
      drop();
      return Promise.resolve();
    },
  };
};
