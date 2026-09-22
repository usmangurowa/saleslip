#!/usr/bin/env sh
# Container entrypoint for @turbo/server.
#
# Runs as root just long enough to add the route to the MikroTik router's
# WireGuard subnet, then drops to the unprivileged `node` user for the app.
#
# Coolify cannot attach a service to another container's network namespace
# (`network_mode: service:`), so the router is reached the same way the
# Mikhmon container does it: a static route through the wg-easy container on
# the shared compose network. Needs `cap_add: [NET_ADMIN]` on the service.
#
#   WG_GATEWAY_HOST   hostname or IP of the wg-easy container (default wg-easy)
#   WG_ROUTE_CIDR     subnet to route through it (default 10.8.0.0/24)
#
# Route failures are logged and ignored: the app still boots (and reports the
# router as down on /health) when the tunnel is not available.

set -eu

WG_GATEWAY_HOST="${WG_GATEWAY_HOST:-}"
WG_ROUTE_CIDR="${WG_ROUTE_CIDR:-10.8.0.0/24}"

if [ -n "$WG_GATEWAY_HOST" ]; then
  gateway="$(getent hosts "$WG_GATEWAY_HOST" 2>/dev/null | awk '{ print $1; exit }' || true)"
  if [ -z "$gateway" ]; then
    echo "entrypoint: cannot resolve WG_GATEWAY_HOST=$WG_GATEWAY_HOST; skipping route" >&2
  elif ip route replace "$WG_ROUTE_CIDR" via "$gateway" 2>/dev/null; then
    echo "entrypoint: routed $WG_ROUTE_CIDR via $gateway ($WG_GATEWAY_HOST)" >&2
  else
    echo "entrypoint: failed to add route $WG_ROUTE_CIDR via $gateway (missing NET_ADMIN?)" >&2
  fi
fi

if [ "$(id -u)" = "0" ]; then
  exec su-exec node "$@"
fi
exec "$@"
