#!/usr/bin/env bash
# scripts/backup-db.sh — สำรอง PostgreSQL จาก container db เป็นไฟล์ .sql.gz
# รันบน host ที่รัน docker compose (VPS/เครื่องออฟฟิศ) — ไม่ต้องเปิด port 5432 ออกมา
#
# ตั้ง cron รันทุกคืน (ตี 2) เช่น:
#   0 2 * * * /srv/erp/scripts/backup-db.sh /var/backups/erp >> /var/log/erp-backup.log 2>&1
#
# ⚠️ เก็บไว้เครื่องเดียวกัน = ยังไม่ใช่ backup จริง — ต้อง sync ออกไปอีกที่หนึ่ง
# (rclone ไป Google Drive/S3 หรือ rsync ไปเครื่องอื่น) ดู DEPLOY.md
#
# กู้คืน: gunzip -c erp-YYYYMMDD-HHMMSS.sql.gz | docker compose exec -T db psql -U beconnected -d erp
set -euo pipefail

BACKUP_DIR="${1:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}" # เก็บย้อนหลังกี่วัน (override ได้ทาง env)
COMPOSE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/erp-$STAMP.sql.gz"

# --clean --if-exists → ไฟล์ restore ทับ DB เดิมได้เลยไม่ต้อง drop เอง
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T db \
  pg_dump -U beconnected -d erp --clean --if-exists | gzip > "$FILE"

# กันไฟล์ว่าง (เช่น container db ไม่ได้รันอยู่แล้ว pipe เงียบ)
if [ ! -s "$FILE" ]; then
  echo "backup FAILED: ได้ไฟล์ว่าง — เช็คว่า container db รันอยู่" >&2
  rm -f "$FILE"
  exit 1
fi

find "$BACKUP_DIR" -name "erp-*.sql.gz" -mtime +"$KEEP_DAYS" -delete

echo "backup OK: $FILE ($(du -h "$FILE" | cut -f1))"
