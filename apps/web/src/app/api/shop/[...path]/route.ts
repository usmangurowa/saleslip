import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/env";

/**
 * Same-origin proxy to the public WiFi shop on `apps/server`.
 *
 * `/buy` creates orders and `/receipt/[orderId]` polls order status, but the
 * browser must never talk to Paystack or RouterOS directly. `apps/server` is
 * the only runtime with those responsibilities, so this forwards
 * server-to-server and always negotiates JSON — no CORS to configure, no HTML
 * payloads leaking back to the client.
 *
 * This is intentionally public (unlike the admin-gated wifi-router proxy):
 * the storefront is meant to be reachable without a session.
 */
const proxy = async (
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) => {
  const { path } = await params;

  const serverUrl = env.SERVER_URL.replace(/\/+$/, "");
  const target = new URL(`${serverUrl}/${path.join("/")}`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  headers.set("accept", "application/json");
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

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
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Server unreachable",
      },
      { status: 503 },
    );
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
};

export const GET = proxy;
export const POST = proxy;
