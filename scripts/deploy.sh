#!/bin/sh
# Deploy Siji Pangeling dari GitHub, satu perintah di VPS.
#
# Sengaja BUKAN auto-deploy webhook: gerbang deploy tetap di tangan
# Pak Gun — skrip ini hanya dijalankan bila ia memerintahkannya,
# dan ia tetap yang memutuskan kapan situs diperbarui. Skrip ini
# membuat langkah manual yang selama ini dilakukan (backup, pull,
# restart, cek) menjadi satu perintah yang bisa diulang dengan
# hasil yang sama.
#
# Langkah:
#   1. Batal bila working tree kotor (perubahan Pak Gun yang belum
#      di-commit tidak boleh ikut tertimpa / hilang karena pull).
#   2. Backup DB dulu lewat scripts/backup.sh.
#   3. git pull origin main (di VPS, origin = https GitHub).
#   4. Restart service siji (lewat sudo bila skrip bukan root).
#   5. Verifikasi: /health dan /api/modul harus menjawab.
#
# Pakai di VPS:
#   cd /opt/pangeling/siji && ./scripts/deploy.sh
#
# Opsi (hanya untuk uji lokal, BUKAN untuk deploy VPS):
#   --no-restart : lewati restart service
#   --no-verify  : lewati cek /health dan /api/modul
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NO_RESTART=0
NO_VERIFY=0
for a in "$@"; do
  case "$a" in
    --no-restart) NO_RESTART=1 ;;
    --no-verify) NO_VERIFY=1 ;;
    *) echo "deploy: opsi tidak dikenal: $a" >&2; exit 2 ;;
  esac
done

if [ -n "$(git status --porcelain)" ]; then
  echo "deploy: DIBATALKAN — working tree kotor. Commit atau simpan dulu perubahan lokal sebelum deploy:" >&2
  git status --short >&2
  exit 1
fi

echo "deploy: backup DB dulu…"
"$ROOT/scripts/backup.sh"

SEBELUM="$(git rev-parse --short HEAD)"
echo "deploy: pull origin main (sebelum: $SEBELUM)…"
git pull origin main
SESUDAH="$(git rev-parse --short HEAD)"
echo "deploy: $SEBELUM -> $SESUDAH"

if [ "$NO_RESTART" -eq 0 ]; then
  if [ "$(id -u)" -eq 0 ]; then
    systemctl restart siji
  else
    sudo systemctl restart siji
  fi
  sleep 2
  echo "deploy: service siji di-restart"
else
  echo "deploy: restart dilewati (--no-restart, mode uji)"
fi

if [ "$NO_VERIFY" -eq 0 ]; then
  PORT="${PORT:-3001}"
  HEALTH="$(curl -s "http://127.0.0.1:$PORT/health" || true)"
  case "$HEALTH" in
    *'"ok": true'*) echo "deploy: /health OK" ;;
    *) echo "deploy: GAGAL — /health tidak menjawab ok" >&2; exit 1 ;;
  esac
  echo "deploy: /api/modul:"
  curl -s "http://127.0.0.1:$PORT/api/modul"
  echo
else
  echo "deploy: verifikasi dilewati (--no-verify, mode uji)"
fi

echo "deploy: SELESAI ($SESUDAH)"
