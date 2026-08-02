#!/usr/bin/env bash
# Guardrail sin dependencias nuevas: falla si aparece console.log/error/warn/
# info/debug fuera de lib/observability/logger.ts (el único lugar donde
# está permitido, porque es lo que envuelve el logger real de
# firebase-functions). Ver docs/backend-observability.md.
set -euo pipefail
cd "$(dirname "$0")/.."

MATCHES=$(grep -rnE "console\.(log|error|warn|info|debug)\(" src --include="*.ts" \
  | grep -v "src/lib/observability/logger.ts" || true)

if [ -n "$MATCHES" ]; then
  echo "Se encontró console.* fuera de lib/observability/logger.ts — usar el logger estructurado en su lugar:"
  echo "$MATCHES"
  exit 1
fi

echo "OK: sin console.* fuera de lib/observability/logger.ts"
