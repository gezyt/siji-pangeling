// Impor ayat + terjemahan ke tabel generik `konten` (skema saat ini).
//
// Sumber: Quran.com API v4 (terbuka, tanpa API key untuk endpoint ini)
//   - GET /api/v4/chapters?language=id          -> 114 surah + verses_count
//   - GET /api/v4/verses/by_chapter/{n}?language=id&translations=33
//     &fields=text_uthmani&per_page=300
//   - Terjemahan resource 33 = "Indonesian Islamic Affairs Ministry"
//     (Kemenag RI, slug quran.id). Alternatif Indonesia lain di API yang
//     sama: 134 (King Fahad Quran Complex), 141 (The Sabiq Company).
//
// Pemetaan ke skema generik (sengaja, sesuai roadmap: impor dulu, perluas
// skema belakangan):
//   jenis  = 'ayat'
//   judul  = 'QS {surah}:{ayat} — {NamaSurah}'   (mis. 'QS 2:255 — Al-Baqarah')
//   isi    = teks Arab (Uthmani) + baris kosong + terjemahan Kemenag
//   sumber = 'Quran.com · Terjemahan Kemenag RI (resource 33)'
//   tag    = 'quran, {slug-nama-surah}'
//
// Jalur migrasi ke tabel ayat khusus nanti (tanpa fetch ulang, bila perlu):
//   judul bisa di-parse `QS (\d+):(\d+)`, isi bisa dipecah di baris kosong
//   menjadi arab/terjemahan, dan tag membawa slug surah. Atau jalankan
//   ulang skrip ini dengan skema baru — impor ini idempotent (lihat bawah).
//
// Keamanan idempotensi: skrip TIDAK pernah menghapus tabel lain. Tanpa
// --reset, skrip berhenti bila sudah ada 6236 baris jenis='ayat' (atau
// sejumlah total verses_count dari API). Dengan --reset, hanya baris
// jenis='ayat' yang dihapus lalu diimpor ulang; baris hadits/siroh/
// artikel yang sudah ada di DB live tetap utuh (trigger FTS ikut
// membersihkan indeks baris yang dihapus).
//
// Lokasi DB: SIJI_DB bila disetel, kalau tidak ./data/app.db relatif
// terhadap root proyek (bukan cwd). Jadi di VPS yang repo-nya ada di
// /opt/pangeling/siji, skrip ini otomatis menulis ke DB yang dipakai
// server (/opt/pangeling/siji/data/app.db) tanpa mengubah src/db.ts.
//
// Pakai:
//   bun run import:quran            # impor, berhenti bila sudah lengkap
//   bun run import:quran -- --reset # hapus ayat lama, impor ulang
//   SIJI_DB=/tmp/uji.db bun run import:quran
import { Database } from "bun:sqlite";
import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const API = "https://api.quran.com/api/v4";
const TRANSLATION_ID = 33;
const SOURCE = "Quran.com · Terjemahan Kemenag RI (resource 33)";

const reset = process.argv.includes("--reset");
const dbPath =
  process.env.SIJI_DB ??
  join(dirname(fileURLToPath(import.meta.url)), "..", "data", "app.db");

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Terjemahan API mengandung <sup foot_note=...>angka</sup> dan tag lain.
// Catatan kaki dibuang seutuhnya (termasuk angkanya); tag lain dibuang
// tapi teksnya dipertahankan.
const cleanTranslation = (html: string) =>
  html
    .replace(/<sup[^>]*>.*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

async function fetchJson(url: string, attempt = 1): Promise<any> {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (r.status === 429 && attempt <= 3) {
    const wait = attempt * 2000;
    console.log(`  429, tunggu ${wait}ms lalu ulang (percobaan ${attempt})`);
    await new Promise((res) => setTimeout(res, wait));
    return fetchJson(url, attempt + 1);
  }
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.json();
}

mkdirSync(dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
// Pastikan skema ada bila DB masih kosong (salinan skema dari src/db.ts).
db.exec(`
CREATE TABLE IF NOT EXISTS konten (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jenis TEXT NOT NULL,
  judul TEXT NOT NULL,
  isi TEXT NOT NULL,
  sumber TEXT,
  tag TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE VIRTUAL TABLE IF NOT EXISTS konten_fts USING fts5(
  judul, isi, content='konten', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS konten_ai AFTER INSERT ON konten BEGIN
  INSERT INTO konten_fts(rowid, judul, isi) VALUES (new.id, new.judul, new.isi);
END;
CREATE TRIGGER IF NOT EXISTS konten_ad AFTER DELETE ON konten BEGIN
  INSERT INTO konten_fts(konten_fts, rowid, judul, isi) VALUES ('delete', old.id, old.judul, old.isi);
END;
CREATE TRIGGER IF NOT EXISTS konten_au AFTER UPDATE ON konten BEGIN
  INSERT INTO konten_fts(konten_fts, rowid, judul, isi) VALUES ('delete', old.id, old.judul, old.isi);
  INSERT INTO konten_fts(rowid, judul, isi) VALUES (new.id, new.judul, new.isi);
END;
`);

const chapters = (await fetchJson(`${API}/chapters?language=id`)).chapters;
const totalVerses = chapters.reduce((s: number, c: any) => s + c.verses_count, 0);
console.log(`Surah: ${chapters.length}, total ayat menurut API: ${totalVerses}`);
console.log(`DB: ${dbPath}`);

const countAyat = () =>
  (db.query("SELECT COUNT(*) AS n FROM konten WHERE jenis = 'ayat'").get() as any).n;

if (reset) {
  const n = countAyat();
  db.query("DELETE FROM konten WHERE jenis = 'ayat'").run();
  console.log(`--reset: ${n} baris ayat lama dihapus (jenis lain tidak disentuh).`);
} else if (countAyat() >= totalVerses) {
  console.log(`Sudah lengkap (${countAyat()} ayat). Berhenti tanpa duplikasi.`);
  console.log("Untuk impor ulang, jalankan dengan --reset.");
  process.exit(0);
} else if (countAyat() > 0) {
  console.log(
    `PERINGATAN: sudah ada ${countAyat()} ayat (tidak lengkap). ` +
      `Jalankan dengan --reset agar tidak ganda, lalu berhenti.`
  );
  process.exit(1);
}

const insert = db.query(
  "INSERT INTO konten (jenis, judul, isi, sumber, tag) VALUES ('ayat', ?, ?, ?, ?)"
);
const insertMany = db.transaction((rows: any[]) => {
  for (const row of rows) insert.run(row.judul, row.isi, row.sumber, row.tag);
});

let inserted = 0;
for (const ch of chapters) {
  const rows: any[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const data = await fetchJson(
      `${API}/verses/by_chapter/${ch.id}?language=id&translations=${TRANSLATION_ID}&fields=text_uthmani&per_page=300&page=${page}`
    );
    totalPages = data.pagination?.total_pages ?? 1;
    for (const v of data.verses) {
      const tr = v.translations?.[0]?.text ?? "";
      rows.push({
        judul: `QS ${v.verse_key} — ${ch.name_simple}`,
        isi: `${v.text_uthmani}\n\n${cleanTranslation(tr)}`,
        sumber: SOURCE,
        tag: `quran, ${slugify(ch.name_simple)}`,
      });
    }
    page++;
  } while (page <= totalPages);
  if (rows.length !== ch.verses_count) {
    throw new Error(
      `Surah ${ch.id} (${ch.name_simple}): API mengembalikan ${rows.length} ayat, ` +
        `harusnya ${ch.verses_count}. Impor dibatalkan sebelum commit surah ini.`
    );
  }
  insertMany(rows);
  inserted += rows.length;
  if (ch.id % 10 === 0 || ch.id === chapters.length) {
    console.log(`  ...surah ${ch.id}/114 selesai (${inserted} ayat)`);
  }
  await new Promise((res) => setTimeout(res, 100));
}

console.log(`Selesai: ${inserted} ayat diimpor.`);
console.log(`Verifikasi DB: ${countAyat()} baris jenis='ayat'.`);
if (countAyat() !== totalVerses) {
  console.error(`JUMLAH TIDAK COCOK: DB ${countAyat()} vs API ${totalVerses}`);
  process.exit(1);
}
