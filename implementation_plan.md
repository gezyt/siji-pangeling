# Implementation Plan — Tanya Jawab AI di Siji Pangeling

Status: **DIBANGUN 2026-11-09** atas perintah Pak Gun ("gasss, mulailah ngoding semuanya ya, terus push").
Fase 1–3 selesai dan teruji lokal (11 uji `bun test` lolos + uji end-to-end
server asli melawan stub 9router). **Fase 0 (instalasi 9router di VPS)
masih menunggu Pak Gun** — skripnya sudah disiapkan
(`scripts/install-9router.sh`, unit `systemd/9router.service`), langkah
manual dashboard tertulis di komentar skrip itu.
Repo: `gezyt/siji-pangeling` · Live: `siji.pangeling.web.id` · Stack berjalan: Bun + SQLite (FTS5) + Caddy + systemd, port 3001.

## 0a. Catatan implementasi (beda dari draf, karena temuan saat menguji)

- **Retrieval bukan AND mentah:** FTS5 menggabungkan beberapa kata kunci
  dengan AND, sehingga pertanyaan "apa yang Al-Qur'an katakan tentang
  sabar?" tidak menemukan apa pun bila satu katanya tidak ada. Solusi:
  tiap kata kunci dicari sendiri lalu digabung (OR), diurutkan menurut
  jumlah kata kunci yang cocok (`cariGabung` di `src/tanya.ts`).
- **"Qur'an" dibuang dari kata kunci:** "Al-Qur'an" ternormalisasi jadi
  "qur" dan malah menarik surah Quraisy ke atas (2:153 kalah). Kata itu
  menyebut topik, bukan isi — masuk daftar buang, bersama "tentang",
  "katakan", "menurut", dan sejenisnya. Uji E2E membuktikan 2:153 kini
  sumber pertama untuk pertanyaan sabar.
- **Rate limit in-memory** (satu proses Bun) sesuai plan; restart service
  mengosongkannya.
- **Model default** di kode: `deepseek/deepseek-chat` — samakan dengan
  nama persis di `/v1/models` 9router saat instalasi (env
  `SIJI_TANYA_MODEL`).

## 0. Keputusan yang sudah diambil

- Provider: **9router** (multiprovider, satu endpoint OpenAI-compatible, banyak model).
  Fakta yang terverifikasi dari dokumentasi 9router (repo `decolua/9router`, MIT):
  9router adalah **gateway yang dijalankan sendiri** (proses Node.js), bukan
  layanan cloud. Ia membuka endpoint OpenAI-compatible di `http://localhost:20128/v1`
  dan meneruskan ke 40+ provider di belakangnya (API-key: OpenAI, Anthropic,
  DeepSeek, GLM, Kimi, Gemini, OpenRouter, dll; OAuth: Claude Code, Codex,
  Cursor, Kiro, dll; free tier: OpenCode Free, Kiro, dll). Satu key 9router,
  nama model memilih providernya, ada auto-fallback dan batas token per key.
  9router juga melayani embeddings lewat `/v1/embeddings`.
- Poin 1–5 dari penjelasan sebelumnya **disetujui Pak Gun**.
- Masih terbuka (default yang saya usulkan ada di §6, silakan dikoreksi):
  anggaran/batas pemakaian, penjelasan umum di luar kutipan, redaksi disclaimer.
- Keputusan Pak Gun 2026-11-09 13:57 WIB: ia paham 9router harus jalan
  sebagai service sendiri di VPS berdampingan dengan Siji, dan **rute
  OAuth Claude Code/Codex/Cursor/Kiro BOLEH dipakai** — ia yang mengatur
  dan mengelola akun/kuota itu sendiri. Catatan kepatuhan di §2A
  disesuaikan dengan keputusan ini.

## 1. Cara kerja (satu kalimat)

Pengunjung bertanya → sistem mencari sumber relevan di database Siji
(ayat, hadits, siroh, artikel) → AI merangkai jawaban **hanya dari sumber
itu**, lengkap dengan kutipan → jawaban + kartu sumber tampil di halaman.
AI adalah perangkai jawaban, bukan sumber kebenarannya.

```
Pengunjung → tab "Tanya Jawab" → POST /api/tanya
  → retrieval FTS5 (v1) / embedding (v2, ditunda)
  → prompt sistem + sumber terpilih → 9router (localhost:20128/v1)
  → model (dipilih di 9router) → jawaban + daftar sumber → halaman
```

## 2. Komponen

### A. 9router di VPS (baru, di luar repo Siji)

- Instalasi native (Node 20+ + systemd, sesuai preferensi Pak Gun —
  tanpa Docker), service sendiri, port `20128` **localhost-only**
  (hanya Siji yang boleh memanggil; tidak dibuka ke publik).
- Dashboard 9router dipakai untuk: menghubungkan provider, membuat satu
  key khusus Siji, dan menyetel batas token key itu.
- Provider yang dihubungkan (default yang saya usulkan):
  **DeepSeek (API key, bayar-per-pakai, model ekonomis)** sebagai utama,
  dan **Gemini free tier** sebagai fallback otomatis bila DeepSeek gagal.
  Model persisnya dipilih saat instalasi dari daftar `/v1/models` 9router.
- **Rute OAuth (keputusan Pak Gun 2026-11-09):** rute OAuth langganan
  coding (Claude Code, Codex, Cursor, Kiro, dsb.) **boleh dipakai** —
  Pak Gun yang mengatur dan mengelola akun/kuota itu sendiri. Rute
  API-key bayar-per-pakai (mis. DeepSeek) tetap disiapkan sebagai
  alternatif/fallback bila rute OAuth tidak tersedia.
- Yang disimpan di VPS (env, tidak pernah masuk repo):
  `SIJI_9ROUTER_URL` (default `http://127.0.0.1:20128/v1`),
  `SIJI_9ROUTER_KEY`, `SIJI_TANYA_MODEL`.

### B. Retrieval v1 — FTS5 yang sudah ada (tanpa biaya tambahan)

- Pakai fungsi cari yang sudah ada: `cariAyat`, `cariHadits`, `cariSiroh`,
  `cariArtikel` (FTS5 di `ayat_fts`, `hadits_fts`, `siroh_fts`,
  `konten_fts`). Pertanyaan dipecah jadi kata kunci (buang kata tanya
  umum: apa, bagaimana, apakah, …), lalu dicari di keempat modul.
- Ambil default: **5 ayat + 3 hadits + 2 siroh/artikel** teratas.
  Tiap sumber dibawa lengkap dengan identitas kutipannya
  (`2:255 — Al-Baqarah`, `HR. Bukhari No. …`, judul siroh/artikel).
- Bila tidak ada satu pun sumber yang relevan → endpoint langsung
  menjawab "tidak ditemukan", **tanpa memanggil AI** (hemat biaya dan
  mencegah karangan).

### C. Endpoint baru `POST /api/tanya` (di `src/index.ts`)

- Masukan: `{ pertanyaan: string }` (maks 500 karakter).
- Pengaman: rate limit **20 tanya/IP/hari + 5 tanya/IP/menit**
  (default yang saya usulkan), timeout pemanggilan AI 30 detik,
  jawaban dibatasi **maks ~600 token**.
- Cache: tabel baru `tanya_cache` (hash pertanyaan → jawaban + sumber,
  berlaku 7 hari). Pertanyaan yang sama tidak memanggil AI dua kali.
- Keluaran: `{ jawaban, sumber: [{ modul, kutipan, teks, rujukan }] }`.
- Log: hanya hash pertanyaan + jumlah token + waktu — tanpa isi
  pertanyaan mentah yang disimpan permanen di luar cache, tanpa IP mentah.

### D. Prompt sistem (draf — untuk diaudit kata per kata)

> Kamu adalah penjawab di situs Siji Pangeling. Jawablah HANYA berdasarkan
> sumber-sumber di bawah ini. Setiap pernyataan faktual harus disertai
> kutipan sumbernya dengan format persis seperti yang diberikan
> (mis. QS. Al-Baqarah 2:153, HR. Bukhari No. 1). Jangan menambah nomor
> ayat, nomor hadits, atau isi yang tidak ada di sumber. Bila sumber tidak
> cukup untuk menjawab, katakan "Tidak ditemukan jawaban di koleksi Siji
> Pangeling untuk pertanyaan ini." Jangan mengeluarkan fatwa atau putusan
> hukum; untuk soal hukum, arahkan untuk bertanya ke ustadz atau ahli.
> Jawablah dalam Bahasa Indonesia, nada tenang dan sederhana, maksimal
> 250 kata.

- Suhu AI: **0,2** (stabil, tidak kreatif mengarang).

### E. Frontend — tab baru "Tanya Jawab" (di `public/index.html`)

- Modul kelima di samping Al-Qur'an, Hadits, Siroh, Artikel.
- Isi tab: kolom pertanyaan + tombol Tanya, contoh pertanyaan
  (mis. "Apa yang Al-Qur'an katakan tentang sabar?"), area jawaban,
  dan di bawahnya kartu-kartu sumber yang bisa diklik untuk membuka
  ayat/hadits/siroh/artikel aslinya di tab masing-masing.
- Status memuat + pesan galat yang jelas bila AI tidak menjawab.

### F. Disclaimer (draf — untuk diaudit kata per kata)

> Jawaban disusun dari ayat Al-Qur'an, hadits, siroh, dan artikel yang ada
> di Siji Pangeling, lengkap dengan sumbernya. Ini bukan fatwa. Untuk soal
> hukum dan keputusan pribadi, tanyakan langsung ke ustadz atau ahli yang
> tepercaya.

### G. Biaya

- Biaya = pemakaian di provider yang dihubungkan lewat 9router (9router
  sendiri gratis/open-source; yang berbayar adalah provider di belakangnya).
- Kendali biaya: model ekonomis sebagai utama, batas token per key di
  dashboard 9router, cache pertanyaan, rate limit, dan jawaban maks 600
  token. Perkiraan rupiah yang pasti baru bisa dihitung setelah model dan
  harga provider dipilih saat instalasi — plan ini sengaja tidak
  mengarang angka.
- Bila key kehabisan kuota: endpoint menjawab pesan ramah
  ("Layanan tanya jawab sedang mencapai batas harian, coba lagi besok.")
  dan halaman pencarian biasa tetap jalan.

## 3. Yang TIDAK dilakukan

- Tidak mengubah isi ayat/hadits/siroh/artikel yang sudah ada.
- Tidak menyimpan pertanyaan pengguna secara permanen (selain cache 7 hari).
- Tidak ada login/registrasi untuk bertanya.
- Tidak ada panggilan AI dari browser pengunjung — semua lewat server Siji
  (key tidak pernah keluar dari VPS).

## 4. Fase pengerjaan

| Fase | Isi | Verifikasi |
|---|---|---|
| 0 | 9router di VPS: instal, service systemd, hubungkan DeepSeek + Gemini, buat key Siji, uji `curl /v1/models` dan satu chat | endpoint menjawab dari VPS |
| 1 | Retrieval v1 + `POST /api/tanya` + prompt + cache + rate limit | `bun test` endpoint (kasus §5) |
| 2 | Tab "Tanya Jawab" di frontend | uji klik di browser lokal |
| 3 | Uji 15 pertanyaan (§5) + deploy VPS + cek live | jawaban + kutipan benar semua |
| 4 (opsional, ditunda) | Embedding semantik v2 via 9router `/v1/embeddings` + tabel vektor | bandingkan relevansi vs v1 |

## 5. Daftar uji (sebelum dinyatakan selesai)

1. "Apa yang Al-Qur'an katakan tentang sabar?" → jawaban mengutip ayat sabar yang benar.
2. "Ayat kursi surah apa ayat berapa?" → 2:255, kutipan benar.
3. "Hadits tentang niat" → mengutip hadits niat yang benar.
4. "Kapan hijrah terjadi?" → mengutip siroh.
5. "Apakah bumi itu datar?" → tidak ditemukan / jawaban dari sumber yang ada, tanpa karangan.
6. Pertanyaan di luar topik (mis. resep masakan) → ditolak sopan / tidak ditemukan.
7. Pertanyaan dengan nomor ayat yang salah → tidak membenarkan nomor yang salah.
8. Pertanyaan sama dua kali → jawaban kedua dari cache (tanpa panggil AI).
9. Tanya ke-21 dalam sehari dari IP yang sama → ditolak rate limit dengan pesan ramah.
10. 9router dimatikan → endpoint menjawab pesan galat ramah, halaman lain tetap jalan.
11. Pertanyaan kosong / 501 karakter → ditolak validasi.
12. Pertanyaan provokatif soal fikih → jawaban mengarah ke ustadz, tanpa fatwa.

## 6. Keputusan terbuka — default yang saya usulkan (silakan koreksi)

1. **Model utama:** model ekonomis lewat 9router (default: DeepSeek
   model chat ekonomis; fallback: Gemini Flash free tier). Nama persis
   dipilih saat instalasi dari `/v1/models`.
2. **Anggaran/batas:** batas token key Siji di dashboard 9router —
   angka pastinya Bapak tentukan setelah melihat harga provider;
   default yang saya usulkan: mulai kecil, evaluasi setelah 1 bulan
   pemakaian nyata (log token di §2C adalah bahannya).
3. **Penjelasan umum di luar kutipan:** BOLEH, maksimal 2 kalimat
   pengantar/penutup untuk merangkai kutipan — isi inti jawaban harus
   dari kutipan. Alternatif ketat: tanpa satu kalimat pun di luar kutipan.
4. **Disclaimer:** draf §2F di atas.
5. **Rate limit:** 20 tanya/IP/hari + 5/IP/menit (§2C).

## 6a. Lanjutan 2026-11-09 malam — prompt terpisah + jawaban baku

Keputusan Pak Gun: system prompt dipindah ke file terpisah dan saran
memory diikuti (mulai dari jawaban baku kurasi).

- **Prompt terpisah:** `prompts/sistem-tanya.md` dibaca server saat
  start (`muatPromptSistem()` di `src/tanya.ts`); komentar HTML di file
  dibuang; bila file hilang/kosong, dipakai `PROMPT_DEFAULT` di kode.
  Mengubah prompt = edit file + restart service siji. Skill.md ala agen
  TIDAK dipakai: bot ini satu panggilan API tanpa alat, jadi tidak bisa
  membaca skill.md — system prompt inilah "skill"-nya.
- **Jawaban baku (memory kurasi):** tabel `jawaban_baku` (pertanyaan
  unik, pemicu koma, jawaban, sumber JSON, aktif). Dicek SEBELUM cache
  dan SEBELUM AI; semua kata pemicu harus ada di pertanyaan (cocok
  longgar: pemicu "cinta" cocok dengan "dicintai"); bila beberapa entri
  cocok, yang pemicunya terbanyak menang. Seed awal (3 entri: sabar,
  ikhlas, ayat kursi) di `scripts/seed-jawaban-baku.ts` — teks ayat/hadits
  diambil dari database, upsert berdasarkan pertanyaan, tidak perlu
  restart. Jawaban baku ditandai "✦ Jawaban kurasi Pak Gun." di halaman
  dan `dariBaku: true` di API.
- **Yang ditunda (sesuai saran):** memory pertanyaan mirip (butuh
  embedding — Fase 4) dan memory percakapan (riwayat per sesi).
- **Catatan seed lokal:** database lokal hanya berisi ayat (hadits/siroh/
  artikel kosong di clone ini; modul itu hanya ada di DB produksi VPS),
  jadi 3 hadits entri ikhlas dilewati saat seed lokal dengan peringatan —
  di VPS hadits itu ada dan akan ikut tersimpan.
- **Uji:** 18/18 `bun test` lolos; E2E server asli vs stub 9router —
  pertanyaan sabar dijawab baku tanpa memanggil AI (stub 0 hit), dan
  log stub membuktikan system prompt yang terkirim berasal dari file
  (`"Kamu adalah penjawab di situs Siji Pangeling. Jawablah HANYA..."`).

## 7. Perintah deploy (setelah build — jalankan di VPS)

```bash
# 1. Instal 9router (sekali saja; lalu langkah manual dashboard di
#    komentar scripts/install-9router.sh: hubungkan provider, buat key
#    Siji, catat nama model persis dari /v1/models):
cd /opt/pangeling/siji
./scripts/install-9router.sh

# 2. Tambahkan ke service siji (/etc/systemd/system/siji.service):
#    Environment=SIJI_9ROUTER_URL=http://127.0.0.1:20128/v1
#    Environment=SIJI_9ROUTER_KEY=<key dari dashboard 9router>
#    Environment=SIJI_TANYA_MODEL=<nama model dari /v1/models>
#    lalu: sudo systemctl daemon-reload

# 3. Deploy Siji seperti biasa:
./scripts/deploy.sh

# 4. Seed jawaban baku (sekali saja setelah deploy pertama yang memuatnya;
#    jalankan ulang setiap kali scripts/seed-jawaban-baku.ts diubah):
bun run seed:jawaban-baku

# 4. Uji live:
curl -X POST http://127.0.0.1:3001/api/tanya \
  -H 'content-type: application/json' \
  -d '{"pertanyaan":"apa yang Al-Qur'"'"'an katakan tentang sabar?"}'
```
