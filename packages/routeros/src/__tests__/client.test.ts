import { createHash } from "node:crypto";
import { createServer } from "node:net";
import type { Server, Socket } from "node:net";
import { expect, it } from "vitest";

import { createRouterOsClient } from "../client";
import { RouterOsUnavailableError } from "../errors";

const CONFIG = {
  host: "127.0.0.1",
  user: "mock-user",
  password: "mock-pass",
  timeoutMs: 2_000,
} as const;

/** Encode one RouterOS API word (length-prefixed, ASCII, < 128 bytes). */
const encodeWord = (text: string): Buffer =>
  Buffer.concat([
    Buffer.from([Buffer.byteLength(text)]),
    Buffer.from(text, "ascii"),
  ]);

const encodeSentence = (words: string[]): Buffer =>
  Buffer.concat([...words.map(encodeWord), Buffer.from([0])]);

interface MockRouter {
  port: number;
  received: string[][];
  close: () => Promise<void>;
}

/**
 * Minimal RouterOS API wire mock: parses incoming sentences and answers each
 * one with the sentences returned by `reply` (return nothing to stay silent).
 */
const startMockRouter = async (
  reply: (sentence: string[]) => Buffer[] | void,
): Promise<MockRouter> => {
  const sockets: Socket[] = [];
  const received: string[][] = [];

  const server: Server = createServer((socket) => {
    sockets.push(socket);
    let buffer = Buffer.alloc(0);

    const drain = () => {
      for (;;) {
        const words: string[] = [];
        let offset = 0;
        for (;;) {
          if (offset >= buffer.length) return;
          const length = buffer.readUInt8(offset);
          offset += 1;
          if (length === 0) break;
          if (offset + length > buffer.length) return;
          words.push(
            buffer.subarray(offset, offset + length).toString("ascii"),
          );
          offset += length;
        }
        buffer = buffer.subarray(offset);
        received.push(words);
        const answer = reply(words);
        for (const sentence of answer ?? []) socket.write(sentence);
      }
    };

    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      drain();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address !== "object")
    throw new Error("mock server has no port");

  return {
    port: address.port,
    received,
    close: () => {
      for (const socket of sockets) socket.destroy();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};

it("resolves to an empty list when the router answers !empty (RouterOS 7.x)", async () => {
  const router = await startMockRouter((words) => {
    if (words[0] === "/login") return [encodeSentence(["!done"])];
    return [encodeSentence(["!empty"]), encodeSentence(["!done"])];
  });

  try {
    const client = createRouterOsClient({ ...CONFIG, port: router.port });

    const rows = await client.write("/ip/hotspot/active/print");
    expect(rows).toEqual([]);

    await client.close();
  } finally {
    await router.close();
  }
});

it("surfaces the router's trap message on a failed login without leaking the password", async () => {
  const router = await startMockRouter((words) => {
    if (words[0] === "/login") {
      return [
        encodeSentence(["!trap", "=message=invalid user name or password"]),
        encodeSentence(["!done"]),
      ];
    }
  });

  try {
    const client = createRouterOsClient({ ...CONFIG, port: router.port });

    const failure = client.write("/ip/hotspot/active/print");
    await expect(failure).rejects.toBeInstanceOf(RouterOsUnavailableError);
    await expect(failure).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining("invalid user name or password"),
      }),
    );
    await expect(failure).rejects.toThrow(
      expect.not.objectContaining({
        message: expect.stringContaining(CONFIG.password),
      }),
    );
  } finally {
    await router.close();
  }
});

it("answers the MD5 challenge when the router replies !done =ret=", async () => {
  const challenge = "0123456789abcdef0123456789abcdef";
  const expectedResponse = `00${createHash("md5")
    .update(
      Buffer.concat([
        Buffer.from([0]),
        Buffer.from(CONFIG.password, "utf8"),
        Buffer.from(challenge, "hex"),
      ]),
    )
    .digest("hex")}`;

  const router = await startMockRouter((words) => {
    if (words[0] === "/login") {
      if (words.some((word) => word.startsWith("=response="))) {
        return [encodeSentence(["!done"])];
      }
      return [encodeSentence(["!done", `=ret=${challenge}`])];
    }
    return [encodeSentence(["!done"])];
  });

  try {
    const client = createRouterOsClient({ ...CONFIG, port: router.port });

    await expect(client.write("/system/resource/print")).resolves.toEqual([]);
    expect(router.received).toContainEqual([
      "/login",
      `=name=${CONFIG.user}`,
      `=response=${expectedResponse}`,
    ]);
    // After the challenge arrives, the retry must use =response=, not a
    // second plaintext attempt.
    const logins = router.received.filter(
      (sentence) => sentence[0] === "/login",
    );
    expect(logins).toHaveLength(2);
    expect(logins[1]).toContain(`=response=${expectedResponse}`);

    await client.close();
  } finally {
    await router.close();
  }
});
