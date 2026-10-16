# API Routes Snapshot

> Generated file. Do not edit by hand.
> Run `pnpm ai:contracts` to refresh this generated file.

## Routes

| Method | Path | Source | Auth middleware |
| --- | --- | --- | --- |
| GET | `/auth/secret` | `packages/api/src/router/auth.ts` | yes |
| GET | `/auth/session` | `packages/api/src/router/auth.ts` | no |
| GET | `/health` | `packages/api/src/index.ts` | no |
| GET | `/wifi/batches` | `packages/api/src/router/wifi.ts` | no |
| GET | `/wifi/customers` | `packages/api/src/router/wifi.ts` | no |
| GET | `/wifi/orders` | `packages/api/src/router/wifi.ts` | no |
| GET | `/wifi/plans` | `packages/api/src/router/wifi.ts` | no |
| GET | `/wifi/stats` | `packages/api/src/router/wifi.ts` | no |
| GET | `/wifi/vouchers` | `packages/api/src/router/wifi.ts` | no |
| PATCH | `/wifi/plans/:id` | `packages/api/src/router/wifi.ts` | no |
| POST | `/ai/chat` | `packages/api/src/router/ai.ts` | yes |
| POST | `/wifi/plans` | `packages/api/src/router/wifi.ts` | no |

## Typed client source

- `packages/api/src/index.ts` exports `AppType` and `hcWithType`.
- Web and mobile clients should infer from `AppType` instead of hand-written route types.
