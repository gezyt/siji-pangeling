#!/bin/sh
# Instal 9router di VPS (Fase 0 Tanya Jawab AI Siji Pangeling).
#
# 9router adalah gateway AI multipenyedia (repo decolua/9router, MIT):
# satu endpoint OpenAI-compatible yang meneruskan ke provider yang
# dihubungkan di dashboardnya (DeepSeek, Gemini, Claude Code, dsb.).
# Siji memanggilnya lewat http://127.0.0.1:20128/v1 — key 9router
# tidak pernah keluar dari VPS.
#
# Yang dilakukan skrip ini (sekali saja, di VPS sebagai user ubuntu):
#   1. Periksa Node.js 20+ (wajib; 9router berjalan di Node 20+).
#   2. Clone repo 9router ke /opt/9router, npm install, npm run build.
#   3. Pasang unit systemd dari repo Siji (systemd/9router.service),
#      enable + start.
#   4. Verifikasi port 20128 mendengarkan.
#
# Setelah skrip ini, LANGKAH MANUAL di dashboard (tidak bisa diotomasi):
#   a. Terowongan SSH dari laptop: ssh -L 20128:127.0.0.1:20128 ubuntu@<VPS>
#      lalu buka http://127.0.0.1:20128 di browser (dashboard 9router).
#   b. Hubungkan provider (mis. DeepSeek API key; rute OAuth Claude
#      Code/Codex/Cursor/Kiro juga bisa — Pak Gun yang mengaturnya).
#   c. Buat satu key khusus Siji di dashboard, beri batas token.
#   d. Catat nama model persis dari /v1/models (mis. deepseek/deepseek-chat).
#   e. Tambahkan ke service siji (/etc/systemd/system/siji.service):
#        Environment=SIJI_9ROUTER_URL=http://127.0.0.1:20128/v1
#        Environment=SIJI_9ROUTER_KEY=<key dari dashboard>
#        Environment=SIJI_TANYA_MODEL=<nama model dari /v1/models>
#      lalu: sudo systemctl daemon-reload && sudo systemctl restart siji
#   f. Uji: curl -X POST http://127.0.0.1:3001/api/tanya \
#        -H 'content-type: application/json' \
#        -d '{"pertanyaan":"apa yang Al-Qur'an katakan tentang sabar?"}'
#
# Pakai di VPS:
#   cd /opt/pangeling/siji && ./scripts/install-9router.sh
set -eu

if ! command -v node >/dev/null 2>&1; then
  echo "install-9router: Node.js tidak ditemukan. Pasang Node.js 20+ dulu." >&2
  exit 1
fi
NODE_VER="$(node --version | sed 's/^v//; s/\..*//')"
if [ "$NODE_VER" -lt 20 ]; then
  echo "install-9router: Node.js $NODE_VER terlalu lama, butuh 20+." >&2
  exit 1
fi
echo "install-9router: Node.js $(node --version) OK"

if [ -d /opt/9router ]; then
  echo "install-9router: /opt/9router sudah ada — update manual (git pull + npm run build) bila perlu." >&2
  exit 1
fi

echo "install-9router: clone decolua/9router ke /opt/9router…"
sudo mkdir -p /opt/9router
sudo chown "$(id -u):$(id -g)" /opt/9router
git clone -q https://github.com/decolua/9router /opt/9router

echo "install-9router: npm install…"
cd /opt/9router
npm install --no-audit --no-fund

echo "install-9router: npm run build…"
npm run build

echo "install-9router: pasang unit systemd…"
sudo cp /opt/pangeling/siji/systemd/9router.service /etc/systemd/system/9router.service
sudo systemctl daemon-reload
sudo systemctl enable --now 9router
sleep 3

if ss -tln 2>/dev/null | grep -q ":20128 "; then
  echo "install-9router: OK — 9router mendengarkan di 127.0.0.1:20128"
else
  echo "install-9router: PERHATIAN — port 20128 belum mendengarkan. Cek: sudo systemctl status 9router --no-pager" >&2
  exit 1
fi

echo "install-9router: SELESAI. Lanjut langkah manual dashboard (lihat komentar di atas skrip ini)."
