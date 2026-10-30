# siji

Siji Pangeling — Tafsir · Hadits · Siroh (siji.pangeling.web.id).
Stack: Bun + SQLite (FTS5) + Caddy + systemd.

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
bun run index.ts
```

To type check:

```bash
bun check
```

Run `bun fmt` to format the code.

This project was created using `bun init` in bun v1.4.4. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
