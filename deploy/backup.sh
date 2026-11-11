#!/bin/sh
# SQLiteの整合したスナップショットを取り、30日より古いものを消す。cron/systemd timerから実行する。
set -eu
umask 077
DB="${DB_PATH:-/var/lib/i-pass/i-pass.db}"
DEST="${BACKUP_DIR:-/var/backups/i-pass}"
mkdir -p -m 700 "$DEST"
chmod 700 "$DEST"
OUT="$DEST/i-pass-$(date +%Y%m%d).db"
sqlite3 "$DB" ".backup '$OUT'"
chmod 600 "$OUT"
find "$DEST" -name 'i-pass-*.db' -mtime +30 -delete
