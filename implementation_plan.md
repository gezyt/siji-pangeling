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

## 6b. Lanjutan 2026-11-10 pagi — 4 pertanyaan gagal, perbaikan retrieval

Empat pertanyaan dijawab "tidak ditemukan" ("Hadits tentang niat",
"Siapa saja mustahik zakat?", "Siapa yang paling dicintai Allah?",
"Apa makhluk yang paling besar?"). Diagnosis terverifikasi — bukan
AI-nya, melainkan retrieval FTS5: (1) "mustahik" tidak pernah muncul
di terjemahan ayat (0 cocok); QS. 9:60 ada di posisi 8 untuk kata
"zakat", lolos dari 5 besar; (2) "dicintai" ≠ "mencintai" (FTS hanya
cocok awalan kata) sehingga QS. 3:31 tak terlihat; "dicintai" hanya
cocok 12:8 dan 2:177; (3) QS. 40:57 ada di posisi 61 untuk "besar"
dan tidak mengandung kata "makhluk"; hadits Kursi-Arsy (cincin di
padang pasir) memang tidak ada di koleksi; (4) hadits niat (HR.
Bukhari No. 1) ADA di database dan terambil bila redaksinya cocok —
jadi Q1 murni soal kata kunci + cache lama. Keempat penolakan itu
tersimpan di cache 7 hari, jadi perbaikan retrieval saja tidak
mengubah jawabannya sampai cache dihapus.

Perbaikan (disetujui Pak Gun 2026-11-10, draf jawaban baku dinyatakan
benar):

- **Stemming sederhana** (`stemKata()` di `src/tanya.ts`): satu awalan
  + satu akhiran, sisa minimal supaya kata pendek ("iman", "kursi",
  "nabi") tidak rusak; asimilasi nasal sengaja tidak ditangani
  (stem tetap sub string kata aslinya, jadi fallback LIKE tetap
  menemukannya). "dicintai"/"mencintai" -> "cinta",
  "terbesar" -> "besar", "beramal" -> "amal", "perjalanan" -> "jalan".
  Diterapkan di `kataKunci()` (dipakai retrieval DAN pencocokan baku)
  dan di `kataDariPemicu()`. Dua kata umum ditambah ke stoplist:
  "semua", "kemudian".
- **Peta konsep** (`PETA_KONSEP` di `src/tanya.ts`, sengaja kecil —
  hanya celah yang sudah terbukti): mustahik -> fakir, miskin, amil,
  mualaf, sahaya, berhutang; makhluk -> penciptaan, arsy. Diterapkan
  di `cariSumber()` lewat `perluasKataKunci()`.
- **4 jawaban baku baru** di `scripts/seed-jawaban-baku.ts` (total 7):
  niat (Bukhari No. 1 + 2:225), mustahik (9:60), dicintai Allah
  (3:31 + 61:4), makhluk terbesar (40:57 + Bukhari No. 7431).
  Catatan seed lokal: hadits Bukhari No. 1 dan No. 7431 dilewati
  dengan peringatan (DB lokal tanpa hadits) — di VPS keduanya ada
  dan akan ikut tersimpan, seperti 3 hadits ikhlas sebelumnya.
- **Hapus cache** (`hapusTanyaCache()` di `src/db.ts` +
  `scripts/hapus-cache-tanya.ts`, perintah `bun run hapus-cache-tanya`):
  menghapus entri cache untuk keempat pertanyaan itu plus dua redaksi
  lain yang jawabannya ikut membaik ("hadits tentang niat beramal",
  "kursi dibandingkan dengan arsy..."); tanpa restart.
- **Uji:** 25/25 `bun test` lolos (7 uji baru: stemming, 3 uji
  retrieval — 9:60 pertama untuk mustahik, 3:31 pertama untuk
  dicintai, 40:57 masuk 5 besar untuk makhluk — pencocokan 4 baku
  baru termasuk varian redaksi, hapus cache; tanpa regresi). E2E
  server asli vs stub 9router (DB salinan yang sudah di-seed):
  keempat pertanyaan dijawab baku (`dariBaku: true`, stub 0 hit),
  varian "makhluk apa yang terbesar?" dan "siapa yang dicintai
  Allah?" juga baku, dan jalur AI untuk "golongan fakir miskin amil"
  mengembalikan 9:60 sebagai sumber pertama.
- **Yang ditunda:** pencarian semantik (embeddings, Fase 4) — lihat
  hasil lapis ini dulu.

## 6c. Lanjutan 2026-11-10 siang — penolakan berparafrasa + korupsi (P0)

Foto Pak Gun pagi ini menunjukkan bug lama kambuh dengan rupa baru:
"carikan hadits tentang korupsi" dijawab AI "Tidak ditemukan hadits
tentang korupsi di koleksi..." — parafrasa, bukan kalimat baku —
sehingga `jawabanMenolak()` (cocok kalimat persis) lolos dan 10
sumber tak relevan ikut tampil + tersimpan di cache 7 hari.

- **Deteksi penolakan toleran parafrasa** (`jawabanMenolak()` di
  `src/tanya.ts`, dan pengaman yang sama di `public/index.html`):
  cukup jawabannya DIAWALI "tidak ditemukan" (toleran huruf besar/
  kecil, spasi, tanda kutip di depan). "Tidak ditemukan" di TENGAH
  jawaban tetap dianggap jawaban. Prompt sistem
  (`prompts/sistem-tanya.md` + `PROMPT_DEFAULT` di kode) diperketat:
  bila sumber tidak cukup, AI harus menjawab PERSIS dengan kalimat
  baku, "tanpa mengubah, menambah, atau memparafrasa satu kata pun".
- **Korupsi ≠ mencuri.** Mencuri = mengambil sembunyi-sembunyi
  (5:38); korupsi = penyalahgunaan amanah — suap, makan harta batil,
  ghulul/khianat. Unsur-unsurnya ADA di koleksi (terverifikasi:
  2:188 makan harta batil + menyuap hakim, 4:29, 3:161 berkhianat,
  5:38, 4:58 amanat, HR. Muslim No. 213 "bila dipercaya ia
  berkhianat"); kata "korupsi" sendiri 0 cocok sehingga tidak
  terambil. Perbaikan: "korupsi" masuk peta konsep (→ mencuri, suap,
  khianat, harta, batil, amanah, amanat) + jawaban baku ke-8
  (pemicu "korupsi", sumber 2:188, 5:38, 3:161, 4:58, Muslim No. 213)
  dengan redaksi yang disetujui Pak Gun. Catatan: "suap" tidak
  menemukan "menyuap" (2:188) lewat LIKE — "menyuap" tidak mengandung
  "suap" (asimilasi meny- + suap); 2:188 tetap terambil lewat
  "batil" dan "harta".
- **Peringkat: jumlah kata kunci didahulukan** (`cariGabung()` di
  `src/tanya.ts` — dulu skor kelangkaan dulu). Bukti perlunya:
  dengan urutan lama, "amanah" (hanya 2 ayat) mengangkat QS. 64:12
  (tentang Rasul menyampaikan risalah — bukan soal korupsi) ke
  peringkat 1 untuk pertanyaan korupsi, sementara QS. 2:188
  (cocok "harta" + "batil") terbenam di posisi 44. Dengan urutan
  baru, 5 besar untuk "carikan hadits tentang korupsi" di DB asli:
  57:7, 8:27, 3:161, 2:188, 4:161. Stemming juga diperbaiki: "-i"
  di akhir kata serapan ("korupsi", "polisi", "fungsi") bukan
  akhiran, jadi "korupsi" tidak lagi ter-stem jadi "korups" (yang
  membuat kunci peta konsepnya tidak cocok).
- **Hapus cache:** "carikan hadits tentang korupsi" ditambah ke
  `scripts/hapus-cache-tanya.ts`.
- **Uji:** 28/28 `bun test` lolos (3 uji baru: penolakan parafrasa,
  perluasan korupsi, baku korupsi, retrieval korupsi — keempat ayat
  unsurnya masuk 5 besar; tanpa regresi). E2E server asli vs stub
  9router (DB salinan yang sudah di-seed): "carikan hadits tentang
  korupsi" dijawab baku (`dariBaku: true`, sumber 2:188, 5:38, 3:161,
  4:58 — Muslim No. 213 dilewati di DB lokal, ada di VPS); stub yang
  menolak dengan parafrasa ("Tidak ditemukan jawaban tentang cinta
  ...") menghasilkan `sumber: []` — bukti jalur penolakan bekerja
  ujung-ke-ujung. Keterbatasan yang ditemui saat E2E (di luar cakupan
  lapis ini): stemming "terbang" -> "bang" dan "penemu" -> "emu"
  membuat pertanyaan buatan "hadits tentang pesawat terbang" dan
  "siapa penemu listrik menurut hadits?" menemukan ayat-ayat "bangun"
  dan "menemukan" — keduanya stem salah yang kebetulan cocok sebagai
  substring. Perlu perbaikan stemming (mis. daftar pengecualian kata
  dasar berawalan "ter"/"pen") bila pertanyaan semacam ini nyata
  masuk; untuk sekarang tidak dikerjakan.

## 6d. Lanjutan 2026-11-10 siang — kredibilitas & berbagi (P1)

Atas audit 6,4/10 dan lampu hijau Pak Gun ("lanjut aja codingnya"):

- **Meta berbagi:** Open Graph + Twitter Card di `index.html` dan
  `tentang.html` (judul, deskripsi, URL kanonis, `og:locale id_ID`).
  Tanpa `og:image` — logo masih P4.
- **Routing hash** (`bacaHash`/`tulisHash`/`terapkanHash` di
  `public/index.html`): `#ayat`, `#hadits`, `#siroh`, `#artikel`,
  `#tanya`; tautan dalam `#ayat/2/255`, `#hadits/Bukhari/1`,
  `#tanya?q=...` (hanya pra-isi, tidak auto-kirim — tautan yang
  dibagikan tidak boleh memicu panggilan AI). Ditulis via
  `history.replaceState` (tanpa entri riwayat, tanpa `hashchange`);
  `terapkanHash()` dipanggil di `muatAwal()` dan saat `hashchange`.
  `pilihModul(kunci, jagaState)` — saat diterapkan dari hash, state
  diisi dulu baru `pilihModul` dipanggil, supaya hanya satu `muat()`
  (dua muat berurutan bisa balapan dan menimpa hasil). Diuji:
  sintaks JS (`node --check`), 9/9 uji logika hash (parse + tulis,
  termasuk kitab ber-spasi dan hash tak dikenal -> tab ayat),
  halaman utama + `/tentang.html` 200 saat disajikan lokal.
- **Halaman Tentang** (`public/tentang.html`): pengelola (Gunanto,
  S.Pd., guru Matematika SMPN 1 Punggur), sumber tiap modul
  (ayat: Quran.com + Kemenag; hadits: 4 kitab edisi Indonesia
  dari hadith-api fawazahmed0; siroh: 26 peristiwa (timeline
  lengkap kelahiran–wafat);
  artikel: 5 tulisan pengelola; tafsir: 6.236 ayat, Tafsir Kemenag
  via equran.id, tingkat 'mendalam'),
  metodologi Tanya Jawab + "bukan fatwa" + jawaban kurasi,
  keterbatasan, kontak lewat blog. Tautan dari footer.
- **Tanya Jawab:** tombol Salin jawaban + Bagikan (WhatsApp) di
  bawah jawaban sungguhan (tidak tampil untuk penolakan); tautan
  bagikan = pertanyaan + jawaban (dipotong 400 karakter) + tautan
  balik `#tanya?q=...`.

## 6e. Lanjutan 2026-11-10 siang — perluasan hadits (P2, Abu Dawud + Tirmidzi)

Atas pilihan Pak Gun ("Bangun perluasan hadits"):

- **Impor** (`scripts/import-hadits.ts`): dua kitab ditambah ke
  `KITAB` — Sunan Abu Dawud 4406 hadits, Sunan at-Tirmidzi 3540
  hadits (terverifikasi impor lokal ke DB salinan; total VPS
  menjadi 19731 = 11785 + 4406 + 3540). Nama kitab memakai nama
  Indonesia yang umum ("Sunan at-Tirmidzi", bukan "Jami At
  Tirmidhi" dari sumber). Perintah default `bun run import:hadits`
  kini mengimpor keempat kitab (yang sudah ada dilewati).
- **Status jujur per kitab:** `status_sanad` kini diambil dari
  entri `KITAB`, bukan hardcode 'sahih' — 'sahih' hanya untuk
  Bukhari/Muslim; Sunan memakai 'belum-diverifikasi' (kitab Sunan
  berisi beragam grade, grade per hadits kosong di sumber).
  `bun check` turun 14 -> 12 galat (2 galat lama import-hadits
  ikut hilang karena guard `if (!entri)`).
- **Hadits laknat penyuap terverifikasi:** Abu Dawud No. 3580
  ("memberi uang sogokan") dan Tirmidzi No. 1337/1336
  ("melaknati penyuap dan yang disuap") tersimpan dengan benar.
  Retrieval: "hadits tentang suap" mengembalikan 1336, 3580,
  1858; "Rasulullah melaknat penyuap" mengembalikan 1337 pertama.
- **Peta konsep `suap -> sogokan`:** matan 3580 memakai kata
  "sogokan", bukan "suap" — hanya 1 hadits di koleksi yang
  memakai kata itu. Tanpa peta ini 3580 tidak terambil untuk
  pertanyaan suap.
- **Keterbatasan:** kata "suap" ambigu — "suapan" (sesuap
  makanan) ikut cocok di hadits makanan (Tirmidzi 1858, Abu
  Dawud 3846); hadits laknat tetap teratas karena
  "melaknati"/"penyuap" lebih langka. Perbaikan pencocokan
  batas kata ditunda.

## 6f. Lanjutan 2026-11-10 siang — impor tafsir dari equran.id (P2)

Atas pilihan Pak Gun ("Ya, bangun impor tafsir dari equran.id"):

- **Riset sumber (sebelum membangun):** Quran.com 0 tafsir
  Indonesia; AlQuranCloud 6 edisi tafsir semuanya Arab; Quranpedia
  2.198 buku tafsir, 0 Indonesia (Arab 2.153) — plus kebijakannya
  melarang impor massal. API resmi LPMQ Kemenag
  (quran-api.lpmqkemenag.id; domain lama quran-api.kemenag.go.id
  sudah tidak bisa dibuka/DNS) punya Tafsir Ringkas + Tahlili,
  tetapi akses berlapis: daftar akun, surat permohonan resmi ke
  Kepala LPMQ (lajnah@kemenag.go.id, cc quran.kemenag@gmail.com),
  tunggu token, isi survei — baru endpoint diberikan; tanpa
  dokumentasi endpoint publik. Kata "Wajiz" tidak muncul di
  halaman LPMQ, jadi belum terkonfirmasi Ringkas = Wajiz.
- **Sumber yang dipakai — equran.id API v2**
  (`https://equran.id/api/v2`, publik, gratis, tanpa API key,
  sumber data dinyatakan Kemenag RI; endpoint
  `GET /tafsir/{nomor}` per surah, `data.tafsir[]` =
  `{ayat, teks}`). Terverifikasi live sebelum membangun: surah 1
  (7/7), 2 (286/286, 2:255 teks Indonesia benar), 36 (83/83),
  114 (6/6). Alternatif kedua yang juga jalan:
  quran-api-id.vercel.app.
- **Impor** (`scripts/import-tafsir.ts`, `bun run import:tafsir`,
  `--surah=N`, `--reset`): fetch + validasi semua 114 surah dulu
  (jumlah entri = jumlahAyat, tiap ayat ada di tabel ayat, tiap
  teks non-kosong; satu surah gagal membatalkan seluruh impor),
  lalu insert dalam satu transaksi. Terverifikasi impor lokal ke
  DB salinan: 6.236 tafsir tingkat 'mendalam', sumber "Tafsir
  Kemenag (via equran.id)"; rata-rata isi 1.467 karakter (min 13,
  maks 19.245); 2:255 sepanjang 2.922 karakter. E2E server lokal:
  `/api/ayat?surah=2&ayat=255` mengembalikan 1 entri tafsir
  'mendalam' — tombol "Tafsir & per kata" di frontend sudah
  menampilkannya tanpa perubahan frontend.
- **Kejujuran tingkat:** equran.id tidak melabeli teksnya
  Wajiz/Tahlili; karena teksnya panjang berparagraf (gaya
  Tahlili), disimpan sebagai 'mendalam'. Sebagian kecil entri
  berupa rujukan silang mengikuti teks sumber (mis. "lihat ayat
  88" untuk 56:89-91), bukan kesalahan impor.
- **Bug yang ditemukan saat membangun:** skrip impor yang
  diimpor `bun test` ikut menjalankan alur CLI-nya (fetch 114
  surah) karena kode top-level jalan saat impor — diperbaiki
  dengan membungkus alur CLI dalam `main()` + penjaga
  `if (import.meta.main)`. DB lokal tidak tercemar (tafsir tetap
  0 baris setelah kejadian).
- **Uji:** 34/34 `bun test` (5 baru: `tests/import-tafsir.test.ts`
  untuk `bangunBarisTafsir` — lengkap, jumlah salah, teks kosong,
  ayat tak ada di peta, respons tanpa daftar); `bun check` tetap
  12 galat lama.

## 6g. Lanjutan 2026-11-10 siang — siroh lengkap 26 peristiwa (P2)

Atas pilihan Pak Gun ("Draf siroh dulu") lalu "Draf sudah benar,
bangun seed-nya":

- **Draf** (`~/workspace/your_files/draf-siroh-lengkap/DRAF-Siroh-Lengkap-26-Peristiwa.md`,
  di luar repo): 18 peristiwa baru (10 Makkah + 8 Madinah) dalam
  format seed, lengkap dengan catatan kejujuran tanggal yang perlu
  diperiksa Pak Gun — hari kelahiran 12 Rabiul Awal (masyhur,
  diperselisihkan), tahun Isra Mi'raj 620/621, usia Khadijah 40
  tahun (masyhur), Thaif digabung ke Tahun Kesedihan supaya tetap
  18 peristiwa. Disetujui tanpa koreksi.
- **Seed** (`scripts/seed-siroh-hijrah.ts` ditulis ulang): 26
  peristiwa (Makkah 1–10, Hijrah 11–18 teks verbatim dari seed
  awal, Madinah 19–26). Komentar header diperbarui (cakupan penuh
  + catatan tanggal yang diperselisihkan + peringatan `--reset`).
- **Peta Hijrah** (`public/index.html`): angka dalam kurung
  dinomori ulang mengikuti timeline baru — Makkah (11–13), Gua
  Tsur (14), jalur pesisir (15), Quba (16), Madinah (17–18).
  Nomor lingkaran rute (1–4) tidak berubah — itu nomor
  pemberhentian, bukan nomor peristiwa.
- **Perhatian deploy:** di VPS siroh sudah berisi 8 Hijrah, jadi
  `bun run seed:siroh` tanpa `--reset` akan DILEWATI (bukan
  ditambah). Setelah deploy, jalankan
  `bun run seed:siroh -- --reset` agar ke-26 peristiwa terisi.
- **Uji:** 29/29 `bun test` lolos (1 uji baru: pertanyaan suap
  menemukan 3580 + 1337/1336; tanpa regresi).
- **Deploy di VPS:** `./scripts/deploy.sh` lalu
  `bun run import:hadits` (mengimpor Abu Dawud + Tirmidzi;
  Bukhari/Muslim dilewati karena sudah ada; tanpa restart —
  server membaca DB per permintaan).

## 6h. Lanjutan 2026-11-10 siang — satu pencarian (P3)

Atas pilihan Pak Gun ("ya P3"):

- **Temuan awal:** backend `/api/cari-semua` sudah ada sejak lama
  (mengembalikan `{ayat, hadits, siroh, artikel}`) tapi frontend
  tidak pernah memakainya — tiap tab hanya mencari di modulnya
  sendiri, padahal tagline situs "pengingat dalam satu pencarian".
  Satu-satunya yang kurang di backend: hitungan total per modul
  (hasil cari per modul selama ini array tanpa total).
- **Backend** (`src/db.ts`): `hitungCariModul()` — gabungan id
  FTS MATCH + LIKE, didedup, cerminan persis `cariModul()` supaya
  angka = hasil yang bisa dimuat. `hitungCariSemua(q)` per modul;
  `cariSemua()` kini mengembalikan `total` juga (bentuk lama
  ditambah satu kunci, kompatibel). `src/index.ts` tidak berubah
  (meneruskan `cariSemua` apa adanya).
- **Frontend** (`public/index.html`): form `#formCariSemua` di
  paling atas + `#riwayatCari`; hasil gabungan dirender ke `#hasil`
  per kelompok (`.cari-kelompok`, judul + hitungan, 5 kartu pertama
  memakai renderer kartu yang sama, tombol `.lihat-semua` bila
  total > 5); modul kosong tetap tampil dengan pesan; keempatnya
  kosong → pesan jelas + tombol ke Tanya (isi kolom, tanpa
  kirim otomatis, sesuai aturan tautan Tanya). "Lihat semua" isi
  `state.q` dulu lalu `pilihModul(kunci, true)` supaya `muat()`
  memakai kata kunci itu — dan kosongkan surah/ayat supaya tidak
  membuka satu ayat. Riwayat localStorage maks 5, duplikat naik
  ke atas (case-insensitive), JSON rusak → `[]`; chip cari
  langsung mencari ulang, chip Tanya mengisi + mengirim seperti
  chip contoh. Teks kosong tab Al-Qur'an kini menyebut kotak
  pencarian modul dan kotak "Cari di semua modul".
- **Pelajaran uji:** `bun test` menjalankan semua berkas uji
  dalam satu proses berbagi modul — berkas kedua yang mengimpor
  `src/db` memakai DB yang sama dengan berkas pertama. Karena
  itu seed `tests/cari-semua.test.ts` memakai id 101+ dan kata
  kunci "kunyit" (tidak ada di seed `tanya.test.ts`); ditulis di
  header berkas uji supaya tidak terulang.
- **Uji:** 38/38 `bun test` (4 baru); `node --check` pada JS
  sebaris; 9/9 uji unit fungsi murni P3 (riwayat + ringkasan,
  stub localStorage); E2E server lokal + salinan DB asli:
  `/api/cari-semua?q=sabar&limit=5` → total ayat 91, 5 kartu,
  pertama 2:153; tanpa hasil → total semua 0. `bun check` tetap
  12 galat lama (db.ts 1 + index.ts 11).
- **Deploy di VPS:** `./scripts/deploy.sh` saja (tanpa impor/seed
  — P3 murni kode + endpoint yang sudah ada).

## 6i. Lanjutan 2026-11-10 siang — aksesibilitas & visual (P4)

Atas pilihan Pak Gun ("gas lanjutkan" setelah P3 di-push):

- **Kontras (temuan audit 10 Nov: teks redup #78716c 13,6px):**
  `--muted` `#78716c` → `#57534e` di `public/index.html` dan
  `public/tentang.html` (termasuk isi SVG peta "jalur pesisir").
  Rasio kontras dihitung dengan Python sebelum mengubah: lama
  4,56:1 di `#faf9f6` (lolos AA mepet), baru 7,25:1 (lolos AAA);
  di putih 7,63:1. Teks kecil .85rem → .9rem (±14,4px), tombol
  kecil .8rem → .85rem, tag .75rem → .8rem.
- **Keyboard + ARIA:** garis fokus (outline `#99f6e4`) diperluas
  ke semua elemen interaktif — sebelumnya tombol Salin, Detail,
  chip contoh/riwayat, dan kartu sumber tidak punya; tautan
  "Lewati ke konten" di paling atas halaman (tersembunyi sampai
  difokuskan, target `<main id="konten" tabindex="-1">`); tab
  mendapat `id="tab-{kunci}"` + `aria-controls="hasil"`, panel
  `#hasil` ber-`role="tabpanel"` + `aria-labelledby` yang diperbarui
  `pilihModul()` (dihapus saat tampilan cari-semua, yang bukan
  panel tab); tombol panah kiri/kanan memindahkan tab aktif dan
  fokus (pola tablist WAI-ARIA; Tab biasa tetap jalan).
- **Logo + favicon + og:image:** `public/logo.svg` — bulan sabit
  putih di atas teal (tanda yang sama dengan ☾ di judul),
  dipakai sebagai favicon dan gambar di judul kedua halaman.
  `public/og-image.png` 1200×630 dibuat dengan PIL (DejaVu Sans)
  — og:image harus PNG karena SVG tidak dibaca WhatsApp/Twitter;
  `og:image` (+ ukuran + alt) dan `twitter:card
  summary_large_image` ditambahkan di kedua halaman.
- **Uji:** 38/38 `bun test` (tanpa perubahan backend); `node
  --check` pada JS sebaris; E2E server lokal: halaman memuat
  tautan lewati, logo, og:image, `role="tabpanel"`;
  `/logo.svg` 200 `image/svg+xml`, `/og-image.png` 200
  `image/png` 26.718 byte; gambar pratinjau diperiksa visual
  (sabit + bintang + judul + dua baris subjudul, rapi). `bun
  check` tetap 12 galat lama.
- **Deploy di VPS:** `./scripts/deploy.sh` saja (tanpa impor/seed
  — P4 murni frontend + aset statis).

## 6j. Lanjutan 2026-11-10 siang — perbaikan audit eksternal (P5)

Audit ulang eksternal (skor 7,6/10, naik dari 6,4) — diverifikasi
live sebelum menjawab (angka 6 vs 91, tidak ada dark mode, tidak
ada mailto/form di Tentang). Rencana P5 disetujui Pak Gun
("Bangun semua P5"):

- **P5-A jebakan filter surah (prioritas tertinggi):** cari
  "sabar" dengan dropdown di Al-Baqarah mengembalikan 6 hasil
  tanpa label cakupan, padahal total 91. Perbaikan: baris hitungan
  menulis cakupan + total tanpa filter (diambil dari
  `/api/cari-semua?q=…&limit=1`, sekali per pencarian, dengan
  penjaga bila kata kunci/surah sudah berubah saat respons tiba)
  + tombol `.tautan` "Cari di semua surah" (delegasi klik di
  `#hitung`) + placeholder "Cari di {surah}…" via
  `perbaruiPlaceholder()` (dipanggil `pilihModul` dan saat surah
  berubah). Pesan kosong menyebut surahnya + tombol yang sama.
  Nama surah dari `daftarSurah` (diisi `muatAwal`), fallback
  "Surah N".
- **P5-B kata kunci ikut pindah tab:** `pilihModul` tidak lagi
  mengosongkan `state.q` (dan `$("q").value = state.q` setelahnya);
  surah/ayat tetap diosongkan karena spesifik tab Al-Qur'an.
  Hash `?q=` per tab tetap konsisten.
- **P5-C empty state:** ikon 🔍 + tombol "Tanyakan lewat Tanya
  Jawab" (cabang baru di handler klik `#hasil`; mengisi kolom
  Tanya, tidak mengirim otomatis) di pesan kosong tiap modul;
  pencarian global mendapat ikon yang sama. CSS `.kosong .btn`.
- **P5-D mode gelap:** `html.dark` di kedua halaman (variabel;
  `color-scheme: dark`); tombol `.tema-btn` di header; default
  `prefers-color-scheme`, pilihan manual `localStorage`
  (`siji-pangeling:tema`), skrip sebaris di `<head>` anti-kedip,
  ikut perubahan perangkat bila belum ada pilihan manual.
  `--teal-teks` dipisah dari `--teal-dark` (teks vs latar hover)
  agar keduanya tetap terbaca di kedua mode. Label "jalur
  pesisir" di peta memakai kelas `.label-pesisir` (fill lewat
  `var(--muted)`), bukan fill sebaris. Kontras gelap dihitung
  dengan Python: teks 16,7:1, redup 6,9:1, teks teal 10,3:1.
- **P5-E kontak:** Tentang mencantumkan `gunanto1010@gmail.com`
  (mailto) — alamat dari Pak Gun langsung 2026-11-10 12:13
  ("kontak boleh dipublish jika diperlukan"). Catatan: alamat
  `gunantomgmp@gmail.com` (akun Google di memori) sempat
  dipakai lalu diganti sebelum commit, karena Bapak menyebut
  alamat yang benar.
- **Uji:** 38/38 `bun test` (tanpa perubahan backend); `node
  --check` pada keempat blok `<script>` (utama + Tentang);
  kontras gelap dihitung; E2E server lokal: penanda tema,
  `html.dark`, `perbaruiPlaceholder`, tombol-tombol baru, dan
  mailto terlayani; `/api/cari-semua` tetap 91 untuk "sabar".
  `bun check` tetap 12 galat lama.
- **Deploy di VPS:** `./scripts/deploy.sh` saja (tanpa impor/seed
  — P5 murni frontend).

## 6k. Lanjutan 2026-11-10 siang — perbaikan audit putaran 3 (P6)

Audit putaran 3 (8,0/10, dari 7,6): P5 dikreditkan (Search 8,3;
Interaksi 7,4; Aksesibilitas 7,0; Visual 7,7). Dua catatan:

- **P6-A label "per kata" (Kepercayaan 8,0 → 7,9):** tombol
  detail ayat "Tafsir & per kata" menjanjikan terjemah per kata,
  padahal tabel `kata` kosong. Perbaikan: tombol (HTML + label
  tutup-kembali) jadi "Tafsir"; pesan kosong jadi "Terjemah per
  kata untuk ayat ini belum tersedia." (sebelumnya mengklaim
  tafsir pun belum tersedia — basi sejak P2). `<h4>Terjemah per
  kata</h4>` dibiarkan: hanya tampil bila `d.kata` ada.
- **P6-B pemilih kitab (Arsitektur Informasi 7,8, datar):**
  dropdown `#kitabWrap` (kelas `.surah` yang sama, jadi tanpa CSS
  baru) di tab Hadits: "Semua kitab" + 4 kitab persis nama di
  kolom DB. `state.kitab` baru; `muat()` mengirim `?kitab=`
  (backend sudah mendukung); `pilihModul` menampilkan/
  mengosongkan seperti surah; placeholder + baris hitungan +
  pesan kosong mengikuti pola P5-A/P5-C (total tanpa filter dari
  `/api/cari-semua`, tombol "Cari di semua kitab" di `#hitung`
  dan di pesan kosong). Hash tidak diubah (filter surah pun tidak
  masuk hash; hanya deep link `#ayat/2/255` dan `#hadits/
  Bukhari/1` yang ada). Verifikasi riwayat: pemilih kitab tidak
  pernah ada di UI — "hilang" di audit tidak tepat, yang benar
  "belum pernah ada". Drive-by fix: handler "Lihat semua" kini
  menyelaraskan input filter (`surah`/`ayatNo`/`kitab`) — tanpa
  ini dropdown bisa menampilkan pilihan lama sementara pencarian
  sudah mencakup semua (celah P3).
- **Uji:** 38/38 `bun test`; `node --check` kedua blok script;
  E2E server lokal (penanda kitabWrap, tombol baru, "Tafsir");
  filter kitab diverifikasi live: 6858/4927/4406/3540 (total
  19.731); cari "sabar" + kitab Bukhari hanya mengembalikan
  Bukhari. `bun check` tetap 12 galat lama. Tanpa perubahan
  backend.
- **Deploy di VPS:** `./scripts/deploy.sh` saja (tanpa impor/seed
  — P6 murni frontend).

## 6l. Lanjutan 2026-11-10 siang — impor terjemah per kata (Quran.com)

- **Koreksi atas anggapan lama:** Pak Gun bertanya apakah terjemah
  per kata memang belum ada sumbernya. Ternyata ADA — saya hanya
  belum pernah mengecek sumber khusus per kata (riset P2 hanya
  meneliti sumber TAFSIR; tabel `kata` dibiarkan kosong karena di
  luar cakupan, bukan karena tidak ada sumber). Sumber: Quran.com
  API v4 (publik, gratis, tanpa API key), endpoint
  `verses/by_chapter/{n}?words=true&language=id&word_fields=
  text_uthmani,translation`. Terverifikasi live di 3 titik:
  1:1–7, 2:255 (50 kata), 114:1–6. AlQuranCloud gugur (tidak
  punya edisi per kata). Pak Gun memilih "Bangun impor terjemah
  per kata" (13:11).
- **Skrip** `scripts/import-kata.ts` (`bun run import:kata`,
  `--surah=N`, `--reset`), pola sama seperti `import-tafsir.ts`:
  ambil per surah (paginasi `per_page=50`), validasi semua dulu
  (jumlah ayat == jumlah di tabel ayat; tiap ayat ada di peta;
  tiap kata non-"end" punya Arab + arti Indonesia non-kosong;
  bahasa arti harus "indonesian"; tanpa posisi ganda), baru
  insert dalam satu transaksi. Entri `char_type_name: "end"`
  (nomor ayat) dilewati. `--surah=N` menghapus baris lama surah
  itu dulu (idempotent). Fungsi murni `bangunBarisKata()`,
  dijaga `if (import.meta.main)`.
- **Verbatim:** teks Arab berikut tanda waqaf yang menempel,
  arti berikut kekhasan sumber (±8.186 arti dengan "Nya"
  menempel, mis. "menimpaNya"; 255 "didalam/di antara/
  dibelakang"). Penerjemah tidak dinamai di respons API —
  atribusi "Quran.com (terjemah per kata bahasa Indonesia)",
  BUKAN Kemenag.
- **Uji:** 45/45 `bun test` (38 lama + 7 baru); impor penuh ke
  salinan DB nyata (~2 menit, 114 surah): 77.429 kata, 6.236/6.236
  ayat tercakup, 2:255 tepat 50 kata, 1:1 pertama بِسْمِ →
  "dengan nama"; E2E `/api/ayat?surah=2&ayat=255` → `kata: 50`.
  `bun check` tetap 12 galat lama. Tanpa perubahan frontend
  (detail sudah menampilkan `d.kata` bila ada).
- **Deploy di VPS:** `./scripts/deploy.sh`, lalu
  `bun run import:kata` sekali (tanpa restart). Setelah impor
  terverifikasi live, label tombol dikembalikan menjadi
  "Tafsir & per kata" (commit kecil terpisah — label tidak
  diubah di commit ini, supaya tidak ada jendela di mana label
  berjanji sementara data belum ada).

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

# 5. Hapus cache tanya (setelah perbaikan jawaban baku/retrieval, supaya
#    pertanyaan yang dulu ditolak dicari ulang; tanpa restart):
bun run hapus-cache-tanya

# 6. Uji live:
curl -X POST http://127.0.0.1:3001/api/tanya \
  -H 'content-type: application/json' \
  -d '{"pertanyaan":"apa yang Al-Qur'"'"'an katakan tentang sabar?"}'
```
