import { Database } from "bun:sqlite";

export const db = new Database("/opt/pangeling/siji/data/app.db");
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

export function cari(q: string) {
  return db.query(
    `SELECT k.* FROM konten_fts f JOIN konten k ON k.id = f.rowid
     WHERE konten_fts MATCH ? LIMIT 20`
  ).all(q);
}
