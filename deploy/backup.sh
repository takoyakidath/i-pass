#!/bin/sh
# SQLiteの整合したスナップショットを取り、30日より古いものを消す。cron/systemd timerから実行する。
set -eu
DB="${DB_PATH:-/var/lib/i-pass/i-pass.db}"
DEST="${BACKUP_DIR:-/var/backups/i-pass}"
mkdir -p "$DEST"
sqlite3 "$DB" ".backup '$DEST/i-pass-$(date +%Y%m%d).db'"
find "$DEST" -name 'i-pass-*.db' -mtime +30 -delete
