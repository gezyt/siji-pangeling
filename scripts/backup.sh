#!/bin/sh
# Backup Siji Pangeling: salinan SQLite yang aman selagi server jalan.
#
# JANGAN salin app.db mentah selagi server jalan (ada WAL): pakai
# perintah .backup sqlite3, yang menghasilkan berkas konsisten.
# Dipakai manual, oleh scripts/deploy.sh, dan oleh timer systemd
# harian (systemd/siji-backup.timer).
#
# Konfigurasi lewat environment (nilai default di bawah):
#   SIJI_DB          : path DB (default: <root repo>/data/app.db)
#   SIJI_BACKUP_DIR  : folder backup (default: /opt/pangeling/backup
#                      bila folder itu ada, kalau tidak ./backup)
#   SIJI_RETENSI_HARI: berapa hari backup dipertahankan (default 7)
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${SIJI_DB:-$ROOT/data/app.db}"

if [ -n "${SIJI_BACKUP_DIR:-}" ]; then
  DIR="$SIJI_BACKUP_DIR"
elif [ -d /opt/pangeling/backup ]; then
  DIR=/opt/pangeling/backup
else
  DIR="$ROOT/backup"
fi
RETENSI="${SIJI_RETENSI_HARI:-7}"

if [ ! -f "$DB" ]; then
  echo "backup: DB tidak ditemukan: $DB" >&2
  exit 1
fi

mkdir -p "$DIR"
NAMA="app-$(date +%F).db"
TUJUAN="$DIR/$NAMA"

sqlite3 "$DB" ".backup '$TUJUAN'"

# Verifikasi: berkas hasil backup harus bisa dibuka dan hitungannya
# sama dengan DB sumber (tabel konten sebagai patokan kasar).
SUMBER="$(sqlite3 "$DB" "SELECT COUNT(*) FROM konten;" 2>/dev/null || echo "?")"
HASIL="$(sqlite3 "$TUJUAN" "SELECT COUNT(*) FROM konten;" 2>/dev/null || echo "?")"
if [ "$SUMBER" != "$HASIL" ]; then
  echo "backup: hitungan tidak cocok (sumber=$SUMBER, backup=$HASIL), backup disimpan tapi WAJIB diperiksa" >&2
  exit 1
fi

# Retensi: hapus backup harian yang lebih tua dari batas. Hanya berkas
# berpola app-YYYY-MM-DD.db yang dihapus, berkas lain dibiarkan.
find "$DIR" -maxdepth 1 -name 'app-*.db' -type f -mtime "+$((RETENSI - 1))" -delete 2>/dev/null || true

echo "backup: $TUJUAN (konten=$HASIL, retensi ${RETENSI} hari)"
