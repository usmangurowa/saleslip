import { serve } from "@hono/node-server";

import { resolveTrustedOrigins } from "@turbo/auth/trusted-origins";

import { createServerApp } from "./app.js";
import { auth } from "./auth.js";
import { env } from "./env.js";
import { createWifiApp } from "./wifi/app.js";
import { createWifiRuntime } from "./wifi/bootstrap.js";

const wifi = createWifiRuntime(env);

const app = createServerApp(auth, {
  allowedOrigins: resolveTrustedOrigins(env.SERVER_URL, env.APP_URL, "expo://"),
  wifi: createWifiApp(wifi.deps),
  wifiRouter: {
    hotspot: wifi.deps.hotspot,
    hotspotServer: wifi.deps.config.hotspotServer,
  },
});

serve({ fetch: app.fetch, port: env.SERVER_PORT }, (info) => {
  wifi.deps.logger.info("server listening", { port: info.port });
  // Registers the Telegram webhook, starts the router watchdog and picks up
  // orders left waiting on the router by a previous process.
  void wifi.start();
});
