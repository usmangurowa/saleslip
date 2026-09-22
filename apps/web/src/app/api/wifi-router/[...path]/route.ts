import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/env";

/**
 * Same-origin proxy to the router-backed console on `apps/server`.
 *
 * The browser cannot call RouterOS: it has no WireGuard route to the hotspot
 * and no router credentials. `apps/server` has both, so it mounts the
 * router-backed routes at `/wifi-router`, and this handler forwards to it
 * server-to-server. Because the browser only ever talks to its own origin,
 * there is no CORS to configure and no third copy of the session cookie.
 *
 * The `cookie` header is forwarded verbatim — `apps/server` resolves the
 * Better Auth session from it exactly as this app does.
 */
const proxy = async (
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) => {
  const { path } = await params;
  const serverUrl = env.SERVER_URL.replace(/\/+$/, "");
  const target = new URL(`${serverUrl}/wifi-router/${path.join("/")}`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  for (const name of ["cookie", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let response: Response;
  try {
    response = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
    });
  } catch (error) {
    // The server runtime being down is a state the console renders, so it gets
    // a body like any other failure rather than a thrown fetch error.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server unreachable" },
      { status: 503 },
    );
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
};

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
