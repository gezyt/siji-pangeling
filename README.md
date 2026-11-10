# siji

Siji Pangeling — Tafsir · Hadits · Siroh (siji.pangeling.web.id).
Stack: Bun + SQLite (FTS5) + Caddy + systemd.

## Menjalankan

```bash
bun run start                  # server di 127.0.0.1:3001 (publik lewat Caddy)
PORT=3001 SIJI_DB=./data/app.db bun run start   # eksplisit, bila perlu
```

Server dan skrip impor memakai path relatif terhadap root repo
(`./data/app.db`, `./public`), bukan path hardcoded — clone bisa jalan
lokal apa adanya. Folder `data/` tidak ikut repo, jadi DB dibuat
otomatis saat pertama jalan (kosong sampai impor dijalankan).

## API

- `GET /health` — cek hidup
- `GET /api/jenis` — daftar jenis untuk filter
- `GET /api/konten?limit=20&offset=0&jenis=ayat` — terpaginasi, mengembalikan `{data, total, limit, offset}`
- `GET /api/cari?q=sabar&jenis=ayat&limit=20&offset=0` — ranking bm25 + substring (menemukan "bersyukur" dari kata "syukur")
- `POST /api/konten` — TERKUNCI: hanya jalan bila `SIJI_ADMIN_TOKEN` disetel di server dan pemanggil mengirim header `x-admin-token` yang sama. Tanpa token, POST mengembalikan 403. Jangan menaruh token di repo.
- `POST /api/tanya` — Tanya Jawab AI. Body `{pertanyaan}` (maks 500 karakter). Jawaban dirangkai AI HANYA dari ayat, hadits, siroh, dan artikel yang ditemukan di database (retrieval FTS5 + LIKE, 5 ayat + 3 hadits + 2 siroh + 2 artikel teratas; kata kunci di-stem Bahasa Indonesia dan diperluas lewat peta konsep — lihat `src/tanya.ts`: `stemKata`, `PETA_KONSEP`), lengkap dengan kutipan sumbernya. Bila tidak ada sumber yang relevan, menjawab "tidak ditemukan" tanpa memanggil AI. Batas: 5 tanya/IP/menit, 20 tanya/IP/hari; jawaban yang sama di-cache 7 hari. Mengembalikan `{jawaban, sumber, dariCache}`; `sumber` berisi `modul`, `rujukan` (mis. `QS. Al-Baqarah 2:153`), dan `teks`.

## Tanya Jawab AI (9router)

Jawaban dihasilkan lewat **9router** — gateway AI multipenyedia yang jalan sebagai service sendiri di VPS (lihat `implementation_plan.md`). Siji memanggil endpoint OpenAI-compatible-nya; key tidak pernah keluar dari server.

Konfigurasi (environment service siji, jangan masuk repo):

- `SIJI_9ROUTER_URL` — default `http://127.0.0.1:20128/v1`
- `SIJI_9ROUTER_KEY` — wajib; key khusus Siji dari dashboard 9router. Tanpa ini, `/api/tanya` menjawab 503.
- `SIJI_TANYA_MODEL` — default `deepseek/deepseek-chat`; samakan persis dengan nama model di `/v1/models` 9router.

Instruksi untuk AI (system prompt) ada di `prompts/sistem-tanya.md` — ubah
kata-katanya di file itu lalu restart service siji (deploy sudah
me-restart). Bila file hilang/rusak, server memakai instruksi cadangan
di `src/tanya.ts`.

Jawaban baku (memory kurasi): jawaban yang ditulis/disetujui Pak Gun
untuk pertanyaan yang sering masuk, disimpan di tabel `jawaban_baku`
dan diperiksa SEBELUM cache dan SEBELUM memanggil AI — tanpa biaya AI,
tanpa risiko AI salah merangkai. Tiap entri punya `pemicu` (kata kunci,
dipisah koma, semuanya harus ada di pertanyaan; makin banyak pemicunya,
makin spesifik) dan `sumber` (JSON, supaya kartu sumber di frontend
tetap bisa diklik). Isi awal (8 entri: sabar, ikhlas, ayat kursi, niat, mustahik,
dicintai Allah, makhluk terbesar, korupsi) lewat
`bun run seed:jawaban-baku` — menambah/mengubah entri = edit
`scripts/seed-jawaban-baku.ts` lalu jalankan ulang (upsert, tidak perlu
restart). Jawaban baku ditandai di halaman dengan "✦ Jawaban kurasi
Pak Gun." dan dikembalikan dengan `dariBaku: true`.

Hapus cache tanya: jawaban "tidak ditemukan" tersimpan 7 hari, jadi
setelah jawaban baku ditambah atau retrieval diperbaiki, pertanyaan
yang dulu ditolak harus dicari ulang — `bun run hapus-cache-tanya`
(menghapus entri untuk daftar pertanyaan di
`scripts/hapus-cache-tanya.ts`, plus pertanyaan tambahan yang
diberikan sebagai argumen; tidak perlu restart).

Instalasi 9router di VPS (sekali saja): `./scripts/install-9router.sh` (lalu langkah manual dashboard: hubungkan provider, buat key Siji, catat nama model — petunjuk lengkap di komentar skrip itu). Unit systemd: `systemd/9router.service`.

Uji: `bun test` (28 uji: kata kunci + stemming, retrieval + peta konsep, jawaban baku, hapus cache, rate limit, stub 9router).

## Skema per modul (fase 2)

Tabel generik `konten` DIPERTAHANKAN, jadi API lama di atas tetap
jalan. Di sampingnya ada tabel per modul, masing-masing dengan
FTS5 sendiri:

- `ayat` — surah_no, surah_nama, ayat_no, verse_key (unik,
  mis. `2:255`), arab, terjemahan, sumber, tag, konten_id.
  `id` ayat = `id` baris konten asalnya, supaya bisa dilacak balik.
- `tafsir` — ayat_id, tingkat (`ringkas`/`menengah`/`mendalam`),
  isi, sumber. Terisi 6.236 baris tingkat 'mendalam' (Tafsir
  Kemenag via equran.id, impor 2026-11-10; `bun run import:tafsir`).
- `kata` — ayat_id, urut, arab, arti. Terisi 77.429 baris (Quran.com
  API v4, impor 2026-11-10; `bun run import:kata`).
- `hadits` — kitab, no_hadits, perawi, matan_arab, matan_id,
  status_sanad (`sahih`/`hasan`/`dhaif`/`belum-diverifikasi`),
  kategori, sumber, tag. Masih kosong, menunggu sumber terverifikasi.
- `siroh` — tahun_hijriah, tahun_masehi, judul, peristiwa, tempat,
  hikmah, sumber, urutan (untuk timeline). Masih kosong.
- `artikel` — judul, isi, kategori, dalil, sumber, tag. Untuk Islam
  kontemporer (Q&A/artikel berdalil). Masih kosong.

API baca per modul (tanpa `?q=` mengembalikan
`{data, total, limit, offset}`; dengan `?q=` mengembalikan array
hasil cari, seperti `/api/cari` lama):

- `GET /api/modul` — hitungan tiap modul
- `GET /api/ayat?surah=2&limit=20&offset=0` — daftar per surah
- `GET /api/ayat?surah=2&ayat=255` — satu ayat + tafsir + kata
- `GET /api/ayat?q=sabar` — cari ayat (bisa ditambah `&surah=2`)
- `GET /api/hadits?kitab=&status_sanad=&q=`
- `GET /api/siroh?q=` — urutan timeline
- `GET /api/artikel?kategori=&q=`
- `GET /api/cari-semua?q=sabar&limit=20` — `{ayat, hadits, siroh, artikel}` + `total` (hitungan per modul, tanpa batas)

API tulis untuk modul baru BELUM dibuka; pengisian modul baru lewat
skrip impor / panel admin fase berikut, bukan lewat endpoint publik.

## Frontend per modul (fase 3)

### Satu pencarian (P3, 2026-11-10)

Kotak "Cari di semua modul" di paling atas halaman mencari ke empat
modul sekaligus lewat `GET /api/cari-semua` (endpoint sudah ada sejak
lama, baru dipakai frontend di P3). Hasil dikelompokkan per modul
dengan hitungan totalnya — 5 kartu pertama per modul, lalu tombol
"Lihat semua di {modul} ({total})" yang pindah ke tab modul itu
dengan kata kunci yang sama. Modul tanpa hasil tetap ditampilkan
dengan pesan "Tidak ada hasil di {modul}."; bila keempatnya kosong,
tampil pesan jelas + tombol "Tanyakan lewat Tanya Jawab" (mengisi
kolom Tanya, tidak mengirim otomatis). Riwayat 5 pencarian terakhir
dan 5 pertanyaan Tanya terakhir disimpan di localStorage (perangkat
pengunjung saja) dan tampil sebagai chip — chip cari langsung
mencari ulang, chip Tanya mengisi lalu mengirim seperti chip contoh.
Backend: `hitungCariSemua()` di `src/db.ts` menghitung gabungan id
FTS + LIKE (cerminan `cariModul`) supaya angka sama dengan hasil
yang bisa dimuat; `cariSemua()` kini mengembalikan `total` juga.

### Aksesibilitas & visual (P4, 2026-11-10)

- Teks redup `--muted` dari `#78716c` (kontras 4,56:1) menjadi
  `#57534e` (7,25:1 di latar `#faf9f6`, lolos AAA); teks kecil
  .85rem → .9rem (±14,4px), tombol kecil .8rem → .85rem, tag
  .75rem → .8rem. Berlaku di halaman utama dan Tentang.
- Fokus keyboard: garis fokus teal muda di SEMUA elemen interaktif
  (sebelumnya hanya input/tab/tombol utama — tombol Salin, Detail,
  chip contoh/riwayat, kartu sumber belum punya); tautan "Lewati
  ke konten" di paling atas (tersembunyi sampai difokuskan);
  tab punya `id` + `aria-controls`, panel `#hasil` ber-
  `role="tabpanel"` + `aria-labelledby` ke tab aktif; tombol panah
  kiri/kanan memindahkan tab (pola tablist WAI-ARIA).
- Logo: bulan sabit putih di atas teal (`public/logo.svg`,
  dipakai favicon + gambar di judul halaman utama dan Tentang);
  gambar berbagi `public/og-image.png` 1200×630 (dibuat dengan
  PIL — og:image SVG tidak dibaca WhatsApp/Twitter), jadi
  `og:image` + `twitter:card summary_large_image` di kedua halaman.

### Perbaikan audit eksternal (P5, 2026-11-10)

Audit ulang eksternal (7,6/10, naik dari 6,4) menemukan jebakan
filter surah yang sudah diverifikasi live: cari "sabar" dengan
dropdown di Al-Baqarah hanya mengembalikan 6 hasil padahal
totalnya 91, tanpa label cakupan. Perbaikannya:

- **Label cakupan filter surah (P5-A):** bila filter surah aktif,
  baris hitungan menulis *"Menampilkan 6 hasil untuk 'sabar' di
  Al-Baqarah (dari 91 di semua surah)"* (total tanpa filter dari
  `/api/cari-semua`, diambil sekali per pencarian) + tombol
  *"Cari di semua surah"*; placeholder kolom berubah jadi
  *"Cari di Al-Baqarah…"*. Pesan kosong pun menyebut surahnya.
- **Kata kunci ikut pindah tab (P5-B):** `pilihModul` tidak lagi
  mengosongkan kata kunci; pindah tab langsung mencari kata yang
  sama di modul baru. Surah/ayat (spesifik Al-Qur'an) tetap
  diosongkan saat pindah tab.
- **Empty state membantu (P5-C):** ikon 🔍 + tombol *"Tanyakan
  lewat Tanya Jawab"* (mengisi kolom Tanya, tidak mengirim
  otomatis) di pesan kosong tiap modul; pencarian global juga
  mendapat ikon yang sama.
- **Mode gelap (P5-D):** blok `html.dark` di kedua halaman
  (variabel warna; `--teal`/`--teal-dark` tidak diubah karena
  dipakai sebagai latar tombol dengan teks putih); tombol ☾/☀ di
  header; default mengikuti `prefers-color-scheme`, pilihan manual
  di localStorage (`siji-pangeling:tema`), skrip sebaris di
  `<head>` mencegah kedip saat muat; ikut perubahan perangkat bila
  belum ada pilihan manual. Kontras gelap dihitung: teks 16,7:1,
  redup 6,9:1, teks teal 10,3:1. Warna teks teal dipisah jadi
  `--teal-teks` (terang `#0b5e57`, gelap `#5eead4`) supaya hover
  tombol (latar gelap + teks putih) tetap terbaca.
- **Kontak (P5-E):** halaman Tentang kini mencantumkan email
  pengelola `gunanto1010@gmail.com` (boleh dipublikasikan,
  dikonfirmasi Pak Gun 2026-11-10) di samping tautan blog.

### Perbaikan audit eksternal putaran 3 (P6, 2026-11-10)

Audit putaran 3 (8,0/10, naik dari 7,6) memuji P5, tapi mencatat
satu langkah mundur kejujuran label dan satu ketimpangan filter:

- **Label "per kata" (P6-A):** tombol detail ayat "Tafsir & per
  kata" menjanjikan terjemah per kata, padahal tabel `kata` masih
  kosong — tombol kini hanya **"Tafsir"**. Pesan kosong yang basi
  ("tafsir … belum tersedia", padahal tafsir sudah ada sejak P2)
  diganti "Terjemah per kata untuk ayat ini belum tersedia."
  Judul `<h4>Terjemah per kata</h4>` dibiarkan: ia hanya tampil
  bila data `kata` ada (suatu saat diimpor). Mengimpor terjemah
  per kata 6.236 ayat adalah proyek data tersendiri, bukan P6.
- **Pemilih kitab (P6-B):** tab Hadits kini punya dropdown Kitab
  ("Semua kitab" + 4 kitab), cerminan pemilih surah — memakai
  `?kitab=` yang sudah didukung backend sejak lama. Placeholder
  ("Cari di Sahih al-Bukhari…"), baris hitungan ("…di Sahih
  al-Bukhari (dari N di semua kitab)" + tombol "Cari di semua
  kitab"), dan pesan kosong mengikuti pola P5-A/P5-C. Catatan:
  pemilih kitab tidak pernah ada di UI (dicek seluruh riwayat
  git) — audit menulis "hilang", yang tepat adalah "belum pernah
  ada". Sambil jalan diperbaiki satu celah lama: handler "Lihat
  semua" kini menyelaraskan juga input filter (sebelumnya
  dropdown bisa menampilkan pilihan lama sementara pencarian
  sudah mencakup semua).

### Tab Hadits seperti Al-Qur'an (P7, 2026-11-10)

Atas permintaan Pak Gun, tab Hadits diubah mengikuti pola tab
Al-Qur'an (yang sejak awal tidak menampilkan daftar otomatis):

- **Tidak ada daftar otomatis:** membuka tab Hadits kini hanya
  menampilkan petunjuk — cari kata atau buka hadits tertentu.
  Memilih kitab saja tetap menampilkan daftar kitab itu (seperti
  memilih surah saja menampilkan daftar ayatnya).
- **Satu kotak cari:** kotak yang sama mencari isi hadits (matan
  Arab/Indonesia) dan nama periwayat — indeks FTS sudah mencakup
  keempat kolom (`matan_arab`, `matan_id`, `kitab`, `perawi`),
  jadi tidak perlu kotak terpisah. Dropdown kitab tetap menjadi
  penyaring pencarian.
- **Buka hadits tertentu:** dropdown kitab + kolom "No. hadits" +
  tombol Buka, cerminan surah + "Ayat ke-" + Buka. Backend baru:
  `getHadits(kitab, no)` + `GET /api/hadits?kitab=..&no=..`
  (404 bila nomor itu tidak ada di kitab itu; `no_hadits`
  bertipe TEXT di skema).
- **Tautan dalam kini tepat:** `#hadits/Sahih%20al-Bukhari/1`
  membuka hadits itu persis (dulu hanya mencari kata "Bukhari
  1"). Nama pendek lama (`#hadits/Bukhari/1`) tetap dipetakan
  (`petaKitabHash`) supaya tautan lama tidak putus. Kartu sumber
  di Tanya Jawab juga membuka haditsnya persis bila nomornya ada.
- **Drive-by:** teks kosong tab Hadits yang basi ("Belum ada
  hadits… menunggu sumber terverifikasi") diganti "Tidak ada
  hadits di kitab ini." Uji: 45/45 `bun test`; E2E ke DB salinan
  dengan 3 hadits seed — buka tepat (Bukhari 1), 404 untuk nomor
  tak ada, cari periwayat "Abu Hurairah" 2 hasil, cari "sabar" +
  kitab Bukhari hanya Bukhari, daftar tanpa `?q=` tetap jalan.
  Uji klik di browser (termasuk hash) menunggu deploy.
- **Uji:** 38/38 `bun test` (tanpa perubahan backend); `node
  --check` kedua blok script; E2E server lokal (penanda
  kitabWrap, tombol-tombol baru, tombol "Tafsir"); filter kitab
  diverifikasi live: Bukhari 6.858, Muslim 4.927, Abu Dawud
  4.406, Tirmidzi 3.540 (total 19.731), cari "sabar" di Bukhari
  mengembalikan hanya hadits Bukhari.

Satu halaman `public/index.html` dengan tab per modul, bukan lagi
daftar generik dari tabel `konten`:

- Tab **Al-Qur'an** (default): daftar ayat terpaginasi, dropdown
  surah dari `GET /api/surah` (114 surah + jumlah ayat), cari dalam
  modul, tombol **Tafsir** di tiap kartu yang membuka detail dari
  `GET /api/ayat?surah=&ayat=` — tafsir kini terisi untuk semua
  6.236 ayat (tingkat 'mendalam', Tafsir Kemenag via equran.id);
  terjemah per kata 77.429 kata (Quran.com API v4,
  `bun run import:kata`) — label tombol kembali menjadi
  "Tafsir & per kata" setelah impor terverifikasi di VPS.
- Tab **Hadits**: kartu kitab, nomor, perawi, status sanad, matan
  Arab + terjemahan (19.731 hadits, 4 kitab). Seperti tab
  Al-Qur'an, tab ini tidak lagi menampilkan daftar otomatis:
  cari lewat satu kotak (isi hadits atau nama periwayat, dengan
  penyaring kitab), atau buka hadits tertentu dari kitab +
  nomornya.
- Tab **Siroh**: kartu timeline (tahun Hijriah/Masehi, tempat,
  peristiwa, hikmah). Saat ini kosong dengan penjelasan serupa.
- Tab **Artikel**: kartu judul, isi, dalil, kategori. Saat ini
  kosong dengan penjelasan serupa.
- Setiap tab menampilkan hitungan modul dari `GET /api/modul`
  (saat ini Al-Qur'an 6236, sisanya 0) dan tombol Salin per kartu,
  responsif HP seperti sebelumnya. API lama `/api/konten` dan
  `/api/cari` tetap jalan di backend, hanya tidak lagi dipakai
  frontend.

## Kredibilitas & berbagi (P1, 2026-11-10)

- **Meta berbagi** di `public/index.html` dan `public/tentang.html`:
  Open Graph + Twitter Card (judul, deskripsi, URL kanonis,
  `og:locale id_ID`); belum ada `og:image` (logo masih P4).
- **Routing hash:** tiap tab punya alamat (`#ayat`, `#hadits`,
  `#siroh`, `#artikel`, `#tanya`), plus tautan dalam ke ayat
  (`#ayat/2/255`), hadits (`#hadits/Bukhari/1`), dan pertanyaan
  Tanya (`#tanya?q=...` — hanya mengisi kolom, tidak mengirim
  otomatis). Ditulis dengan `history.replaceState` (tidak menambah
  entri riwayat, tidak memicu `hashchange`); `terapkanHash()` di
  `muatAwal()` dan listener `hashchange` untuk tombol kembali.
- **Halaman Tentang** (`public/tentang.html`, disajikan otomatis
  dari folder statis): pengelola, sumber tiap modul beserta
  keterbatasannya, metodologi Tanya Jawab, dan kontak lewat blog.
  Tautan dari footer halaman utama.
- **Tanya Jawab:** tombol **Salin jawaban** dan **Bagikan
  (WhatsApp)** di bawah jawaban sungguhan (tidak tampil untuk
  penolakan); tautan bagikan berisi pertanyaan + jawaban (dipotong
  400 karakter) + tautan balik `#tanya?q=...`.

## Backup otomatis + deploy dari GitHub (fase 4)

Sengaja BUKAN auto-deploy webhook: gerbang deploy tetap di tangan
Pak Gun — skrip deploy hanya jalan bila ia memerintahkannya.
Yang dibangun adalah satu perintah deploy yang bisa diulang,
plus backup harian otomatis.

- `scripts/backup.sh` — salinan SQLite yang aman selagi server
  jalan (perintah `.backup`, bukan salin `app.db` mentah karena
  ada WAL). Memverifikasi hitungan `konten` sumber vs backup,
  menyimpan `app-YYYY-MM-DD.db`, dan menghapus backup harian
  yang lebih tua dari 7 hari (hanya berkas berpola itu).
  Konfigurasi: `SIJI_DB`, `SIJI_BACKUP_DIR`
  (default `/opt/pangeling/backup` bila ada, kalau tidak
  `./backup`), `SIJI_RETENSI_HARI` (default 7).
- `systemd/siji-backup.service` + `systemd/siji-backup.timer` —
  menjalankan backup tiap hari (`OnCalendar=daily`,
  `Persistent=true`, jadi jadwal yang terlewat saat VPS mati
  tetap dikejar saat hidup lagi). Cara pasang di VPS ada di
  bawah.
- `scripts/deploy.sh` — urutan deploy: batal bila working tree
  kotor (perubahan Pak Gun yang belum di-commit tidak boleh
  tertimpa pull), backup dulu, `git pull origin main`, restart
  service `siji`, verifikasi `/health` dan `/api/modul`.
  Opsi `--no-restart` dan `--no-verify` hanya untuk uji lokal,
  bukan untuk deploy VPS.

Cara pasang di VPS (sekali saja, setelah pull commit ini):

```bash
cd /opt/pangeling/siji
./scripts/deploy.sh
sudo cp systemd/siji-backup.service systemd/siji-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now siji-backup.timer
systemctl list-timers siji-backup.timer --no-pager
```

Deploy berikutnya cukup `./scripts/deploy.sh` dari root repo —
backup, pull, restart, dan verifikasi jalan berurutan dalam satu
perintah.

## Impor hadits pilot: Bukhari + Muslim (fase 5)

Sumber yang dipilih Pak Gun setelah audit 2026-10-30:
fawazahmed0/hadith-api lewat jsDelivr (tanpa API key). Sutanlab
dicoret sementara karena API-nya gagal DNS saat diaudit;
Sunnah.com resmi butuh API key dan tidak ada terjemahan
Indonesia; UmmahAPI hanya Inggris/Arab dan lisensinya tidak
transparan.

Skrip: `scripts/import-hadits.ts` — Arab dari edisi `ara-*`,
Indonesia dari edisi `ind-*`, dicocokkan per hadithnumber.
Kategori = judul bab dari metadata sumber (bahasa Inggris apa
adanya); perawi dibiarkan NULL di pilot ini karena rantai
periwayat sudah utuh di dalam teks Indonesia dan memecahnya
otomatis berisiko salah atribusi.

Kejujuran status yang wajib dibaca sebelum memakai data ini:
- `grades` per hadits di sumber ini KOSONG. `status_sanad =
  sahih` di sini berarti status kitab Sahih al-Bukhari /
  Sahih Muslim, bukan grade per hadits, dan itu ditulis
  eksplisit di kolom `sumber` tiap baris.
- Penerjemah Indonesia tidak tercantum di sumber (author
  "Unknown"), jadi kolom `sumber` juga menulis itu.
- Tidak semua entri edisi punya terjemahan Indonesia: dari
  7589 entri Bukhari, 731 teks Indonesianya kosong di sumber;
  dari 7563 entri Muslim, 2636 kosong. Yang diimpor hanya
  entri berteks Indonesia tidak kosong: Bukhari 6858, Muslim
  4927, total 11785. 38 hadits yang diimpor tidak punya teks
  Arab di sumber (37 Muslim, 1 Bukhari), dan 261 hadits
  Bukhari tidak punya judul bab di sumber (kategori NULL).

```bash
bun run import:hadits                 # semua kitab, lewati kitab yang sudah ada
bun run import:hadits -- --kitab=abudawud
bun run import:hadits -- --reset      # hapus dulu kitab yang dipilih, impor ulang
SIJI_DB=/tmp/uji.db bun run import:hadits
```

Di VPS, impor dijalankan sekali dari root repo setelah deploy
kode ini (data tidak ikut repo, jadi impor di VPS terpisah
dari impor uji lokal), lalu restart service bila perlu.

## Perluasan hadits: Abu Dawud + Tirmidzi (2026-11-10)

Sumber yang sama (fawazahmed0/hadith-api). Yang diimpor:
Abu Dawud 4406, Tirmidzi 3540 — total hadits menjadi 19731
(11785 + 4406 + 3540). Hadits laknat penyuap terverifikasi ada:
Abu Dawud No. 3580 dan Tirmidzi No. 1337 (juga 1336).

Kejujuran status untuk kitab baru: `status_sanad` ditulis
per kitab — 'sahih' hanya untuk Bukhari/Muslim (status kitab
Sahih); Sunan Abu Dawud dan Sunan at-Tirmidzi memakai
'belum-diverifikasi' (kitab Sunan berisi hadits dengan beragam
grade, dan grade per hadits kosong di sumber). Menulis 'sahih'
untuk Sunan adalah klaim palsu. Nama kitab memakai nama
Indonesia yang umum ("Sunan at-Tirmidzi", bukan nama formal
sumber "Jami At Tirmidhi").

Satu celah kata yang ikut diperbaiki: matan Abu Dawud 3580
memakai kata "sogokan", bukan "suap" ("memberi uang sogokan"),
sehingga pertanyaan tentang suap tidak menemukannya. Peta
konsep di `src/tanya.ts` ditambah `suap -> sogokan` (hanya 1
hadits di koleksi yang memakai kata itu). Catatan: kata "suap"
juga ambigu — "suapan" (sesuap makanan) ikut cocok di hadits
tentang makanan (mis. Tirmidzi 1858, Abu Dawud 3846); hadits
laknat penyuap tetap di peringkat teratas karena kata
"melaknati"/"penyuap" lebih langka.

## Tafsir: impor dari equran.id (2026-11-10)

Tafsir per ayat akhirnya terisi — sebelumnya `GET /api/ayat`
mengembalikan `tafsir: []` untuk semua ayat. Sumbernya Tafsir
Kemenag lewat equran.id API v2 (publik, gratis, tanpa API key;
sumber data dinyatakan Kemenag RI). Alasan memilihnya: Quran.com
punya 0 tafsir Indonesia, AlQuranCloud dan Quranpedia hanya
berbahasa Arab, sedangkan API resmi LPMQ Kemenag aksesnya
berlapis (daftar akun, surat permohonan resmi, tunggu token,
isi survei) dan tanpa dokumentasi endpoint publik.

```bash
bun run import:tafsir                 # semua 114 surah
bun run import:tafsir -- --surah=2    # satu surah saja
bun run import:tafsir -- --reset      # hapus tafsir mendalam, impor ulang
SIJI_DB=/tmp/uji.db bun run import:tafsir
```

Yang diimpor: 6.236 tafsir (satu per ayat), tingkat 'mendalam',
sumber tiap baris "Tafsir Kemenag (via equran.id)". Validasi
ketat per surah: jumlah entri harus sama dengan jumlahAyat, tiap
ayat harus ada di tabel ayat, tiap teks harus non-kosong — satu
surah gagal membatalkan seluruh impor sebelum satu baris pun
ditulis. Panjang isi rata-rata 1.467 karakter (min 13, maks
19.245); 2:255 sepanjang 2.922 karakter. equran.id tidak
melabeli teksnya Wajiz/Tahlili; karena teksnya panjang
berparagraf (gaya Tahlili), disimpan sebagai 'mendalam'.
Sebagian kecil entri berupa rujukan silang mengikuti teks sumber
(mis. "lihat ayat 88" untuk 56:89-91), bukan kesalahan impor.
Di VPS, jalankan `bun run import:tafsir` sekali setelah deploy
(tanpa restart — server membaca DB per permintaan).

## Terjemah per kata: 77.429 kata dari Quran.com API v4 (2026-11-10)

Anggapan lama ("belum ada sumber") ternyata keliru: sumbernya ada
— Quran.com API v4, `GET /v4/verses/by_chapter/{n}?words=true
&language=id&word_fields=text_uthmani,translation`, publik,
gratis, tanpa API key. Terverifikasi live di 3 titik sebelum
dibangun: Al-Fatihah 1:1–7, Ayat Kursi 2:255 (50 kata), An-Nas
114:1–6. AlQuranCloud tidak punya edisi per kata (hanya terjemah
per ayat) — gugur.

```bash
bun run import:kata                 # semua 114 surah
bun run import:kata -- --surah=2    # satu surah saja
bun run import:kata -- --reset      # hapus semua kata, impor ulang
SIJI_DB=/tmp/uji.db bun run import:kata
```

Yang diimpor: 77.429 kata, mencakup 6.236 dari 6.236 ayat; 2:255
tepat 50 kata; 1:1 kata pertama بِسْمِ → "dengan nama". Validasi
ketat per surah: jumlah ayat yang diambil harus sama dengan jumlah
ayat surah itu di tabel ayat, tiap ayat harus ada di tabel ayat,
tiap kata (selain entri "end" = nomor ayat) harus punya teks Arab
dan arti Indonesia non-kosong — satu surah gagal membatalkan
seluruh impor sebelum satu baris pun ditulis. Entri "end"
dilewati. Diimpor verbatim: tanda waqaf menempel di teks Arab,
dan kekhasan arti sumber dipertahankan (±8.186 arti dengan "Nya"
menempel seperti "menimpaNya", 255 "didalam/di antara/dibelakang")
— bukan salah ketik impor. Penerjemah per kata tidak disebutkan
di respons API, jadi atribusi yang dipakai "Quran.com (terjemah
per kata bahasa Indonesia)", bukan Kemenag. Frontend tidak
berubah: detail ayat sudah menampilkan `d.kata` bila ada.
Di VPS, jalankan `bun run import:kata` sekali setelah deploy
(tanpa restart); lalu label tombol dikembalikan menjadi
"Tafsir & per kata" (commit kecil terpisah, setelah impor
terverifikasi live).

## Siroh: timeline lengkap 26 peristiwa (fase 6, dilengkapi 2026-11-10)

Tidak ada API siroh terstruktur yang terverifikasi seperti
Quran.com / hadith-api, jadi isi modul ini ditulis sebagai
seed dari ringkasan Ar-Rahiq al-Makhtum (al-Mubarakfuri):
26 peristiwa dari kelahiran (570 M) sampai wafat Nabi (11 H)
— 10 Makkah, 8 Hijrah, 8 Madinah — masing-masing dengan
hikmah (pelajaran yang bisa dipetik, bukan kutipan hadits)
dan sumber di kolom `sumber`. Draf 18 peristiwa baru diaudit
dan disetujui Pak Gun sebelum dibangun; 8 Hijrah tetap verbatim
(hanya dinomori ulang jadi 11–18). Thaif digabung ke Tahun
Kesedihan. Perintah seed: `bun run seed:siroh` (isi bila kosong)
atau `bun run seed:siroh -- --reset` (isi ulang) — di VPS wajib
`--reset` karena 8 Hijrah sudah ada.

Kejujuran tanggal: tanggal Hijri (27 Safar, 1, 8, 12
Rabiul Awal 1 H) konsisten di sumber yang merujuk
Mubarakfuri, tetapi konversi Masehi harian bervariasi antar
sumber, jadi hanya tahun 622 yang disimpan di
`tahun_masehi`. Peta di tab Siroh adalah SVG skematis
(urutan Makkah -> Gua Tsur -> Quba -> Madinah), bukan peta
geografis presisi, dan itu ditulis di panel peta itu sendiri.

Perbaikan bug dari tangkapan layar Pak Gun 2026-10-30:
dropdown Surah sempat tetap tampil di tab Hadits karena
aturan CSS `.surah { display: flex }` mengalahkan atribut
`hidden` bawaan browser. Diperbaiki dengan
`.surah[hidden] { display: none; }`; logika JS-nya
(`surahWrap.hidden = modul !== "ayat"`) memang sudah benar.

```bash
bun run seed:siroh                 # isi bila siroh masih kosong
bun run seed:siroh -- --reset      # hapus semua siroh, isi ulang
SIJI_DB=/tmp/uji.db bun run seed:siroh
```

Di VPS, seed dijalankan sekali dari root repo setelah deploy
kode ini (data tidak ikut repo, jadi seed di VPS terpisah
dari seed uji lokal); restart service tidak wajib untuk isi
ini karena dibaca langsung dari DB.

## Artikel pilot: 5 Q&A Islam kontemporer (fase 7)

Tidak ada API artikel terverifikasi, jadi isi pilot ini
ditulis orisinal (`scripts/seed-artikel-pilot.ts`), bukan
diimpor. Dalil hanya ayat yang terjemahannya sudah
diverifikasi ada di tabel ayat situs ini (Kemenag RI),
dikutip persis dari DB; pilot ini tidak mengutip hadits
supaya tidak ada nomor hadits yang belum terverifikasi teks
lengkapnya. Tiap artikel ditutup kalimat "Artikel ini
adalah pengingat, bukan fatwa."

Isi pilot: ghibah di grup chat (QS 49:12), sabar dan salat
saat hidup berat (QS 2:153), syukur atas nikmat biasa
(QS 14:7, 2:152), menuntut ilmu dan adab majelis
(QS 58:11), salat qashar saat bepergian (QS 4:101, tanpa
angka batas jarak karena ulama berbeda pendapat).

```bash
bun run seed:artikel               # isi bila artikel masih kosong
bun run seed:artikel -- --reset    # hapus semua artikel, isi ulang
SIJI_DB=/tmp/uji.db bun run seed:artikel
```

Di VPS, seed dijalankan sekali dari root repo setelah deploy
kode ini (data tidak ikut repo); restart service tidak wajib
untuk isi ini karena dibaca langsung dari DB.

## Migrasi ayat ke tabel per modul

Migrasi mem-parse judul `QS surah:ayat — NamaSurah` dan memecah isi
di baris kosong menjadi arab + terjemahan, tanpa fetch ulang dari
Quran.com. Idempotent dan tidak menghapus tabel `konten`, jadi
gagal di tengah tidak merusak data lama. Server juga menjalankan
migrasi ini otomatis saat start bila tabel `ayat` masih kosong —
di VPS cukup `git pull` + restart service.

```bash
bun run migrate:modul            # migrasi + verifikasi hitungan
bun run migrate:modul -- --reset # hapus ayat, isi ulang dari konten
SIJI_DB=/tmp/uji.db bun run migrate:modul
```

## Impor ayat + terjemahan (data awal)

Sumber: Quran.com API v4, terjemahan resource 33 (Kemenag RI).
Skrip: `scripts/import-quran.ts` — mengisi tabel generik `konten`
dengan `jenis='ayat'`, judul `QS surah:ayat — NamaSurah`, isi berupa
teks Arab Uthmani + terjemahan (catatan kaki dibuang), sumber dan tag
`quran, slug-surah`. Total yang diimpor: 114 surah, 6236 ayat.
Impor bersifat idempotent: tanpa flag, skrip berhenti bila 6236 ayat
sudah ada; `--reset` hanya menghapus baris `jenis='ayat'` lalu mengimpor
ulang (baris hadits/siroh/artikel tidak disentuh).

```bash
bun run import:quran            # impor (berhenti bila sudah lengkap)
bun run import:quran -- --reset # impor ulang ayat saja
SIJI_DB=/tmp/uji.db bun run import:quran  # DB lain (default: ./data/app.db)
```

Di VPS (repo di `/opt/pangeling/siji`), jalankan dari root repo — skrip
otomatis memakai `./data/app.db`, yaitu DB yang dipakai server.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run start   # sama dengan: bun run src/index.ts
```

To type check:

```bash
bun check
```

Run `bun fmt` to format the code.

This project was created using `bun init` in bun v1.4.4. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
