#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Setup Node environment via nvm if available
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  \. "$NVM_DIR/nvm.sh"
  nvm use --delete-prefix v20.20.2 >/dev/null 2>&1 || true
fi

# Ensure local PostgreSQL is running if installed
export LD_LIBRARY_PATH="/home/niranjan/.local/pgsql/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
if [ -x "/home/niranjan/.local/pgsql/usr/lib/postgresql/16/bin/pg_ctl" ]; then
  if ! /home/niranjan/.local/pgsql/usr/lib/postgresql/16/bin/pg_ctl -D /home/niranjan/.local/pgsql_data status >/dev/null 2>&1; then
    echo "Starting local PostgreSQL database..."
    /home/niranjan/.local/pgsql/usr/lib/postgresql/16/bin/pg_ctl -D /home/niranjan/.local/pgsql_data -l /home/niranjan/.local/pgsql_data/server.log -o "-k /tmp -p 5432" start
  fi
fi

echo "=========================================="
echo "  ODECEEE · The Odyssey"
echo "  Live at: http://localhost:8080"
echo "  Admin login: http://localhost:8080/admin/login"
echo "=========================================="

cd "$DIR/artifacts/api-server"
exec node --env-file-if-exists=.env --enable-source-maps ./dist/index.mjs
