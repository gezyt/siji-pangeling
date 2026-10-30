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

## Skema per modul (fase 2)

Tabel generik `konten` DIPERTAHANKAN, jadi API lama di atas tetap
jalan. Di sampingnya ada tabel per modul, masing-masing dengan
FTS5 sendiri:

- `ayat` — surah_no, surah_nama, ayat_no, verse_key (unik,
  mis. `2:255`), arab, terjemahan, sumber, tag, konten_id.
  `id` ayat = `id` baris konten asalnya, supaya bisa dilacak balik.
- `tafsir` — ayat_id, tingkat (`ringkas`/`menengah`/`mendalam`),
  isi, sumber. Masih kosong, untuk tafsir bertingkat fase berikut.
- `kata` — ayat_id, urut, arab, arti. Masih kosong, untuk terjemah
  per kata fase berikut.
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
- `GET /api/cari-semua?q=sabar&limit=20` — `{ayat, hadits, siroh, artikel}`

API tulis untuk modul baru BELUM dibuka; pengisian modul baru lewat
skrip impor / panel admin fase berikut, bukan lewat endpoint publik.

## Frontend per modul (fase 3)

Satu halaman `public/index.html` dengan tab per modul, bukan lagi
daftar generik dari tabel `konten`:

- Tab **Al-Qur'an** (default): daftar ayat terpaginasi, dropdown
  surah dari `GET /api/surah` (114 surah + jumlah ayat), cari dalam
  modul, tombol **Tafsir & per kata** di tiap kartu yang membuka
  detail dari `GET /api/ayat?surah=&ayat=` — saat ini tafsir dan
  kata masih kosong, jadi detail menampilkan catatan bahwa keduanya
  menyusul pada fase tafsir.
- Tab **Hadits**: kartu kitab, nomor, perawi, status sanad, matan
  Arab + terjemahan. Saat ini kosong dengan penjelasan bahwa isinya
  menunggu sumber terverifikasi.
- Tab **Siroh**: kartu timeline (tahun Hijriah/Masehi, tempat,
  peristiwa, hikmah). Saat ini kosong dengan penjelasan serupa.
- Tab **Artikel**: kartu judul, isi, dalil, kategori. Saat ini
  kosong dengan penjelasan serupa.
- Setiap tab menampilkan hitungan modul dari `GET /api/modul`
  (saat ini Al-Qur'an 6236, sisanya 0) dan tombol Salin per kartu,
  responsif HP seperti sebelumnya. API lama `/api/konten` dan
  `/api/cari` tetap jalan di backend, hanya tidak lagi dipakai
  frontend.

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
bun run import:hadits                 # Bukhari + Muslim, lewati kitab yang sudah ada
bun run import:hadits -- --kitab=bukhari
bun run import:hadits -- --reset      # hapus dulu kedua kitab ini, impor ulang
SIJI_DB=/tmp/uji.db bun run import:hadits
```

Di VPS, impor dijalankan sekali dari root repo setelah deploy
kode ini (data tidak ikut repo, jadi impor di VPS terpisah
dari impor uji lokal), lalu restart service bila perlu.

## Siroh pilot: timeline Hijrah + peta skematis (fase 6)

Tidak ada API siroh terstruktur yang terverifikasi seperti
Quran.com / hadith-api, jadi isi pilot ini ditulis sebagai
seed dari ringkasan Ar-Rahiq al-Makhtum (al-Mubarakfuri):
8 peristiwa Hijrah Makkah -> Madinah, masing-masing dengan
hikmah (pelajaran yang bisa dipetik, bukan kutipan hadits)
dan sumber di kolom `sumber`.

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
