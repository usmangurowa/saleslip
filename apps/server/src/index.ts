import { serve } from "@hono/node-server";

import { resolveTrustedOrigins } from "@turbo/auth/trusted-origins";

import { createServerApp } from "./app.js";
import { auth } from "./auth.js";
import { env } from "./env.js";
import { createWifiApp } from "./wifi/app.js";
import { createWifiDeps } from "./wifi/bootstrap.js";

const wifiDeps = createWifiDeps(env);

const app = createServerApp(auth, {
  allowedOrigins: resolveTrustedOrigins(env.SERVER_URL, env.APP_URL, "expo://"),
  wifi: createWifiApp(wifiDeps),
});

serve({ fetch: app.fetch, port: env.SERVER_PORT }, (info) => {
  wifiDeps.logger.info("server listening", { port: info.port });
  // Pick up orders left waiting on the router by a previous process.
  void wifiDeps.fulfilment.sweep();
});
