/**
 * Prints `/system/resource` from the configured router. Run from the deployed
 * container (local dev cannot reach the WireGuard tunnel):
 *   pnpm --filter @turbo/server routeros:check
 */
import { createHotspotService, createRouterOsClient } from "@turbo/routeros";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) {
    console.error(`missing ${name}`);
    process.exit(2);
  }
  return value;
};

const client = createRouterOsClient({
  host: required("ROUTER_HOST"),
  port: Number(process.env.ROUTER_PORT ?? 8728),
  user: required("ROUTER_API_USER"),
  password: required("ROUTER_API_PASSWORD"),
  timeoutMs: 10_000,
});

const hotspot = createHotspotService(client);
try {
  const resource = await hotspot.systemResource();
  console.log(JSON.stringify(resource, null, 2));
  const active = await hotspot.listActive();
  console.log(`active hotspot sessions: ${active.length}`);
} catch (error) {
  console.error(
    "router check failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await client.close();
}
