export { createRouterOsClient } from "./client";
export {
  RouterOsCommandError,
  RouterOsUnavailableError,
  isRouterOsUnavailable,
} from "./errors";
export {
  createHotspotService,
  parseActiveSession,
  parseHotspotUser,
  parseSystemResource,
  toHotspotUserParams,
} from "./hotspot";
export type { HotspotService } from "./hotspot";
export type {
  HotspotActiveSession,
  HotspotUser,
  HotspotUserInput,
  RouterOsConfig,
  RouterOsRow,
  RouterOsTransport,
  SystemResource,
} from "./types";
