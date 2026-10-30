import { Database } from "bun:sqlite";
import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Lokasi DB: SIJI_DB bila disetel, kalau tidak ./data/app.db relatif
// terhadap root proyek (bukan cwd, bukan path hardcoded /opt/...).
// Ini yang membuat clone bisa jalan lokal apa adanya, dan di VPS pun
// tetap benar selama repo di /opt/pangeling/siji.
export const dbPath =
  process.env.SIJI_DB ??
  join(dirname(fileURLToPath(import.meta.url)), "..", "data", "app.db");

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

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

function batas(limit: unknown, def = 20): number {
  const n = Number(limit);
  if (!Number.isFinite(n)) return def;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

function awal(offset: unknown): number {
  const n = Number(offset);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function daftarJenis(): string[] {
  const rows = db
    .query("SELECT DISTINCT jenis FROM konten ORDER BY jenis ASC")
    .all() as { jenis: string }[];
  return rows.map((r) => r.jenis).filter(Boolean);
}

export function hitungKonten(jenis?: string): number {
  const row = jenis
    ? (db
        .query("SELECT COUNT(*) AS n FROM konten WHERE jenis = ?")
        .get(jenis) as { n: number })
    : (db.query("SELECT COUNT(*) AS n FROM konten").get() as { n: number });
  return row.n;
}

export function listKonten(limit = 20, offset = 0, jenis?: string) {
  const lim = batas(limit);
  const off = awal(offset);
  if (jenis) {
    return db
      .query(
        "SELECT * FROM konten WHERE jenis = ? ORDER BY id DESC LIMIT ? OFFSET ?"
      )
      .all(jenis, lim, off);
  }
  return db
    .query("SELECT * FROM konten ORDER BY id DESC LIMIT ? OFFSET ?")
    .all(lim, off);
}

export function cari(q: string, jenis?: string, limit = 20, offset = 0) {
  const lim = batas(limit);
  const off = awal(offset);
  // Sanitasi untuk FTS5: hanya huruf/angka yang lolos, sisanya jadi
  // pemisah. Ini mencegah query seperti `"`, `*`, `-`, `OR` merusak
  // MATCH atau menimbulkan error 500. Tiap token diberi `*` supaya
  // pencarian awalan jalan (mis. "sabar" ikut menemukan "sabarlah").
  const tokens = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10);
  if (!tokens.length) return [];

  const ftsQuery = tokens.map((t) => `${t}*`).join(" ");
  const ambil = lim + off;
  let ftsRows: any[] = [];
  try {
    ftsRows = (
      jenis
        ? db
            .query(
              `SELECT k.* FROM konten_fts f JOIN konten k ON k.id = f.rowid
               WHERE konten_fts MATCH ? AND k.jenis = ?
               ORDER BY bm25(konten_fts) LIMIT ?`
            )
            .all(ftsQuery, jenis, ambil)
        : db
            .query(
              `SELECT k.* FROM konten_fts f JOIN konten k ON k.id = f.rowid
               WHERE konten_fts MATCH ?
               ORDER BY bm25(konten_fts) LIMIT ?`
            )
            .all(ftsQuery, ambil)
    ) as any[];
  } catch {
    // FTS gagal (mis. token Arab tertentu): lanjut ke LIKE saja.
  }

  // Gabungan substring: ini yang menutup celah "syukur" vs "bersyukur"
  // (FTS awalan tidak menemukan kata yang diawali imbuhan). Hasil FTS
  // tetap di depan (sudah diranking bm25), LIKE hanya menambah yang
  // belum ada, tanpa duplikasi id.
  const bersih = q.trim().replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const like = `%${bersih}%`;
  const likeRows = (
    jenis
      ? db
          .query(
            `SELECT * FROM konten
             WHERE (judul LIKE ? ESCAPE '\\' OR isi LIKE ? ESCAPE '\\')
             AND jenis = ? ORDER BY id DESC LIMIT ?`
          )
          .all(like, like, jenis, ambil)
      : db
          .query(
            `SELECT * FROM konten
             WHERE judul LIKE ? ESCAPE '\\' OR isi LIKE ? ESCAPE '\\'
             ORDER BY id DESC LIMIT ?`
          )
          .all(like, like, ambil)
  ) as any[];
  const sudah = new Set(ftsRows.map((r: any) => r.id));
  const gabung = [...ftsRows, ...likeRows.filter((r: any) => !sudah.has(r.id))];
  return gabung.slice(off, off + lim);
}
