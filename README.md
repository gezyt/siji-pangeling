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
