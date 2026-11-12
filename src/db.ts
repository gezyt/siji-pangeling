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

// ---------------------------------------------------------------------------
// Skema per modul (fase 2 roadmap, setelah impor ayat).
//
// Prinsip:
// 1. Tabel generik `konten` DIPERTAHANKAN apa adanya. API lama
//    (/api/konten, /api/cari) tetap membaca dari sana, jadi frontend
//    lama dan deploy live tidak pecah saat skema baru ditambahkan.
// 2. Tiap modul punya tabel sendiri + FTS5 sendiri, supaya field
//    khususnya bisa dicari dan disaring tanpa menebak-nebak dari
//    satu kolom `isi` generik.
// 3. `ayat` diisi dari `konten` jenis='ayat' lewat migrasi (lihat
//    migrasiAyat di bawah), BUKAN fetch ulang dari Quran.com:
//    judul di-parse `QS surah:ayat — NamaSurah`, isi dipecah di
//    baris kosong menjadi arab + terjemahan.
// 4. Tabel lain (tafsir, kata, hadits, siroh, artikel) dibuat kosong
//    dan siap diisi fase berikutnya. API baca untuk modul itu sudah
//    ada, API tulis belum dibuka (admin panel adalah fase terpisah).
// ---------------------------------------------------------------------------
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

-- Modul 1: Al-Qur'an. id dipertahankan = id baris konten asalnya,
-- supaya pelacakan balik ke sumber impor tidak hilang.
CREATE TABLE IF NOT EXISTS ayat (
  id INTEGER PRIMARY KEY,
  surah_no INTEGER NOT NULL,
  surah_nama TEXT NOT NULL,
  ayat_no INTEGER NOT NULL,
  verse_key TEXT NOT NULL UNIQUE,
  arab TEXT NOT NULL,
  terjemahan TEXT NOT NULL,
  sumber TEXT,
  tag TEXT,
  konten_id INTEGER UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(surah_no, ayat_no)
);
CREATE INDEX IF NOT EXISTS ayat_surah_idx ON ayat(surah_no, ayat_no);

CREATE VIRTUAL TABLE IF NOT EXISTS ayat_fts USING fts5(
  arab, terjemahan, surah_nama, content='ayat', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS ayat_ai AFTER INSERT ON ayat BEGIN
  INSERT INTO ayat_fts(rowid, arab, terjemahan, surah_nama) VALUES (new.id, new.arab, new.terjemahan, new.surah_nama);
END;
CREATE TRIGGER IF NOT EXISTS ayat_ad AFTER DELETE ON ayat BEGIN
  INSERT INTO ayat_fts(ayat_fts, rowid, arab, terjemahan, surah_nama) VALUES ('delete', old.id, old.arab, old.terjemahan, old.surah_nama);
END;
CREATE TRIGGER IF NOT EXISTS ayat_au AFTER UPDATE ON ayat BEGIN
  INSERT INTO ayat_fts(ayat_fts, rowid, arab, terjemahan, surah_nama) VALUES ('delete', old.id, old.arab, old.terjemahan, old.surah_nama);
  INSERT INTO ayat_fts(rowid, arab, terjemahan, surah_nama) VALUES (new.id, new.arab, new.terjemahan, new.surah_nama);
END;

-- Modul 1 lanjutan: tafsir bertingkat + terjemah per kata (fase berikut).
-- Tabel dibuat sekarang supaya API dan frontend per modul bisa
-- mengandalkan strukturnya, isinya masih kosong.
CREATE TABLE IF NOT EXISTS tafsir (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ayat_id INTEGER NOT NULL REFERENCES ayat(id) ON DELETE CASCADE,
  tingkat TEXT NOT NULL CHECK(tingkat IN ('ringkas', 'menengah', 'mendalam')),
  isi TEXT NOT NULL,
  sumber TEXT,
  UNIQUE(ayat_id, tingkat)
);
CREATE TABLE IF NOT EXISTS kata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ayat_id INTEGER NOT NULL REFERENCES ayat(id) ON DELETE CASCADE,
  urut INTEGER NOT NULL,
  arab TEXT NOT NULL,
  arti TEXT NOT NULL,
  UNIQUE(ayat_id, urut)
);

-- Modul 2: Hadits terverifikasi, berkategori, berstatus sanad.
CREATE TABLE IF NOT EXISTS hadits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kitab TEXT NOT NULL,
  no_hadits TEXT,
  perawi TEXT,
  matan_arab TEXT,
  matan_id TEXT NOT NULL,
  status_sanad TEXT NOT NULL DEFAULT 'belum-diverifikasi'
    CHECK(status_sanad IN ('sahih', 'hasan', 'dhaif', 'belum-diverifikasi')),
  kategori TEXT,
  sumber TEXT,
  tag TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS hadits_kitab_idx ON hadits(kitab);
CREATE INDEX IF NOT EXISTS hadits_status_idx ON hadits(status_sanad);
CREATE VIRTUAL TABLE IF NOT EXISTS hadits_fts USING fts5(
  matan_arab, matan_id, kitab, perawi, content='hadits', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS hadits_ai AFTER INSERT ON hadits BEGIN
  INSERT INTO hadits_fts(rowid, matan_arab, matan_id, kitab, perawi) VALUES (new.id, new.matan_arab, new.matan_id, new.kitab, new.perawi);
END;
CREATE TRIGGER IF NOT EXISTS hadits_ad AFTER DELETE ON hadits BEGIN
  INSERT INTO hadits_fts(hadits_fts, rowid, matan_arab, matan_id, kitab, perawi) VALUES ('delete', old.id, old.matan_arab, old.matan_id, old.kitab, old.perawi);
END;
CREATE TRIGGER IF NOT EXISTS hadits_au AFTER UPDATE ON hadits BEGIN
  INSERT INTO hadits_fts(hadits_fts, rowid, matan_arab, matan_id, kitab, perawi) VALUES ('delete', old.id, old.matan_arab, old.matan_id, old.kitab, old.perawi);
  INSERT INTO hadits_fts(rowid, matan_arab, matan_id, kitab, perawi) VALUES (new.id, new.matan_arab, new.matan_id, new.kitab, new.perawi);
END;

-- Modul 3: Siroh (timeline + tempat + hikmah).
CREATE TABLE IF NOT EXISTS siroh (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tahun_hijriah INTEGER,
  tahun_masehi INTEGER,
  judul TEXT NOT NULL,
  peristiwa TEXT NOT NULL,
  tempat TEXT,
  hikmah TEXT,
  sumber TEXT,
  urutan INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS siroh_urutan_idx ON siroh(urutan, tahun_hijriah, id);
CREATE VIRTUAL TABLE IF NOT EXISTS siroh_fts USING fts5(
  judul, peristiwa, hikmah, tempat, content='siroh', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS siroh_ai AFTER INSERT ON siroh BEGIN
  INSERT INTO siroh_fts(rowid, judul, peristiwa, hikmah, tempat) VALUES (new.id, new.judul, new.peristiwa, new.hikmah, new.tempat);
END;
CREATE TRIGGER IF NOT EXISTS siroh_ad AFTER DELETE ON siroh BEGIN
  INSERT INTO siroh_fts(siroh_fts, rowid, judul, peristiwa, hikmah, tempat) VALUES ('delete', old.id, old.judul, old.peristiwa, old.hikmah, old.tempat);
END;
CREATE TRIGGER IF NOT EXISTS siroh_au AFTER UPDATE ON siroh BEGIN
  INSERT INTO siroh_fts(siroh_fts, rowid, judul, peristiwa, hikmah, tempat) VALUES ('delete', old.id, old.judul, old.peristiwa, old.hikmah, old.tempat);
  INSERT INTO siroh_fts(rowid, judul, peristiwa, hikmah, tempat) VALUES (new.id, new.judul, new.peristiwa, new.hikmah, new.tempat);
END;

-- Modul 4: Islam kontemporer (Q&A / artikel berdalil).
CREATE TABLE IF NOT EXISTS artikel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  judul TEXT NOT NULL,
  isi TEXT NOT NULL,
  kategori TEXT,
  dalil TEXT,
  sumber TEXT,
  tag TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE VIRTUAL TABLE IF NOT EXISTS artikel_fts USING fts5(
  judul, isi, dalil, content='artikel', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS artikel_ai AFTER INSERT ON artikel BEGIN
  INSERT INTO artikel_fts(rowid, judul, isi, dalil) VALUES (new.id, new.judul, new.isi, new.dalil);
END;
CREATE TRIGGER IF NOT EXISTS artikel_ad AFTER DELETE ON artikel BEGIN
  INSERT INTO artikel_fts(artikel_fts, rowid, judul, isi, dalil) VALUES ('delete', old.id, old.judul, old.isi, old.dalil);
END;
CREATE TRIGGER IF NOT EXISTS artikel_au AFTER UPDATE ON artikel BEGIN
  INSERT INTO artikel_fts(artikel_fts, rowid, judul, isi, dalil) VALUES ('delete', old.id, old.judul, old.isi, old.dalil);
  INSERT INTO artikel_fts(rowid, judul, isi, dalil) VALUES (new.id, new.judul, new.isi, new.dalil);
END;

-- Modul 5: Fiqih (pilot: Kifayat al-Akhyar, Syafi'i, dari Fiqh Corpus).
-- Satu baris = satu bagian (pendahuluan kitab / bab / pasal) dengan teks
-- Arab lengkap bagian itu. urut = urutan bagian dalam kitab; UNIQUE
-- (kitab, urut) menjaga idempotensi impor ulang.
CREATE TABLE IF NOT EXISTS fiqh (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kitab TEXT NOT NULL,
  mazhab TEXT,
  bab TEXT NOT NULL,
  pasal TEXT,
  teks TEXT NOT NULL,
  urut INTEGER NOT NULL,
  sumber TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(kitab, urut)
);
CREATE INDEX IF NOT EXISTS fiqh_kitab_idx ON fiqh(kitab);
CREATE VIRTUAL TABLE IF NOT EXISTS fiqh_fts USING fts5(
  kitab, bab, pasal, teks, content='fiqh', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS fiqh_ai AFTER INSERT ON fiqh BEGIN
  INSERT INTO fiqh_fts(rowid, kitab, bab, pasal, teks) VALUES (new.id, new.kitab, new.bab, new.pasal, new.teks);
END;
CREATE TRIGGER IF NOT EXISTS fiqh_ad AFTER DELETE ON fiqh BEGIN
  INSERT INTO fiqh_fts(fiqh_fts, rowid, kitab, bab, pasal, teks) VALUES ('delete', old.id, old.kitab, old.bab, old.pasal, old.teks);
END;
CREATE TRIGGER IF NOT EXISTS fiqh_au AFTER UPDATE ON fiqh BEGIN
  INSERT INTO fiqh_fts(fiqh_fts, rowid, kitab, bab, pasal, teks) VALUES ('delete', old.id, old.kitab, old.bab, old.pasal, old.teks);
  INSERT INTO fiqh_fts(rowid, kitab, bab, pasal, teks) VALUES (new.id, new.kitab, new.bab, new.pasal, new.teks);
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

function hitung(sql: string, params: any[] = []): number {
  return (db.query(sql).get(...params) as { n: number }).n;
}

// ---------------------------------------------------------------------------
// Migrasi ayat: konten jenis='ayat' -> tabel ayat.
// Idempotent: bila ayat sudah terisi, tidak melakukan apa-apa.
// --reset: hapus ayat (tafsir/kata ikut terhapus lewat CASCADE) lalu isi
// ulang dari konten. Tabel konten TIDAK pernah dihapus/diubah, jadi
// migrasi yang gagal di tengah tidak merusak data lama.
// ---------------------------------------------------------------------------
export function migrasiAyat(reset = false): {
  migrated: boolean;
  sudahAda: number;
  dariKonten: number;
  hasil: number;
} {
  const dariKonten = hitung(
    "SELECT COUNT(*) AS n FROM konten WHERE jenis = 'ayat'"
  );
  let sudahAda = hitung("SELECT COUNT(*) AS n FROM ayat");
  if (reset && sudahAda > 0) {
    db.query("DELETE FROM ayat").run();
    sudahAda = 0;
  }
  if (sudahAda > 0) {
    return { migrated: false, sudahAda, dariKonten, hasil: sudahAda };
  }
  if (dariKonten === 0) {
    return { migrated: false, sudahAda: 0, dariKonten: 0, hasil: 0 };
  }

  const rows = db
    .query("SELECT * FROM konten WHERE jenis = 'ayat' ORDER BY id ASC")
    .all() as any[];
  const parsed = rows.map((r) => {
    const m = String(r.judul).match(/^QS\s+(\d+):(\d+)\s+—\s+(.+)$/);
    if (!m) throw new Error(`Judul tidak bisa di-parse: ${r.judul}`);
    const bagian = String(r.isi).split(/\n\s*\n/);
    const arab = (bagian[0] ?? "").trim();
    const terjemahan = bagian.slice(1).join("\n\n").trim();
    if (!arab || !terjemahan) {
      throw new Error(`Isi tidak lengkap untuk ${r.judul}`);
    }
    return {
      id: r.id,
      surah_no: Number(m[1]),
      surah_nama: m[3].trim(),
      ayat_no: Number(m[2]),
      verse_key: `${m[1]}:${m[2]}`,
      arab,
      terjemahan,
      sumber: r.sumber ?? null,
      tag: r.tag ?? null,
      konten_id: r.id,
    };
  });
  const kunci = new Set(parsed.map((p) => p.verse_key));
  if (kunci.size !== parsed.length) {
    throw new Error("Ada verse_key ganda, migrasi dibatalkan");
  }

  const insert = db.query(
    `INSERT INTO ayat (id, surah_no, surah_nama, ayat_no, verse_key, arab, terjemahan, sumber, tag, konten_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const isiSemua = db.transaction((list: typeof parsed) => {
    for (const p of list) {
      insert.run(
        p.id, p.surah_no, p.surah_nama, p.ayat_no, p.verse_key,
        p.arab, p.terjemahan, p.sumber, p.tag, p.konten_id
      );
    }
  });
  isiSemua(parsed);

  const hasil = hitung("SELECT COUNT(*) AS n FROM ayat");
  if (hasil !== dariKonten) {
    throw new Error(`Hasil migrasi ${hasil} != konten ${dariKonten}`);
  }
  return { migrated: true, sudahAda: 0, dariKonten, hasil };
}

// Migrasi otomatis saat server start, persis pola aplikasi lain Pak Gun
// (migrasi jalan saat restart). Gagal = server tetap jalan dengan tabel
// konten lama, migrasi bisa diulang lewat skrip; data lama tidak disentuh.
try {
  const r = migrasiAyat(false);
  if (r.migrated) {
    console.log(`Migrasi per-modul: ${r.hasil} ayat dipindah dari konten ke tabel ayat.`);
  }
} catch (e) {
  console.warn("Migrasi per-modul gagal, server tetap jalan dengan tabel konten:", e);
}

// ---------------------------------------------------------------------------
// API lama (tetap, membaca tabel konten)
// ---------------------------------------------------------------------------
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
  } catch {}

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

// ---------------------------------------------------------------------------
// API baru per modul (baca saja; tulis modul baru lewat impor/admin fase
// berikut, bukan lewat endpoint publik).
// ---------------------------------------------------------------------------
function tokenCari(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10);
}

function likeDari(q: string): string {
  return `%${q.trim().replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
}

function cariModul(
  tabel: string,
  fts: string,
  kolomLike: string[],
  q: string,
  limit = 20,
  offset = 0,
  filterSql = "",
  filterParams: any[] = []
): any[] {
  const lim = batas(limit);
  const off = awal(offset);
  const ambil = lim + off;
  const tokens = tokenCari(q);
  if (!tokens.length) return [];
  let ftsRows: any[] = [];
  if (tokens.length) {
    try {
      ftsRows = db
        .query(
          `SELECT m.* FROM ${fts} f JOIN ${tabel} m ON m.id = f.rowid
           WHERE ${fts} MATCH ? ${filterSql}
           ORDER BY bm25(${fts}) LIMIT ?`
        )
        .all(tokens.map((t) => `${t}*`).join(" "), ...filterParams, ambil) as any[];
    } catch {}
  }
  const like = likeDari(q);
  const whereLike = kolomLike.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(" OR ");
  const likeRows = db
    .query(
      `SELECT m.* FROM ${tabel} m WHERE (${whereLike}) ${filterSql}
       ORDER BY m.id DESC LIMIT ?`
    )
    .all(...kolomLike.map(() => like), ...filterParams, ambil) as any[];
  const sudah = new Set(ftsRows.map((r: any) => r.id));
  const gabung = [...ftsRows, ...likeRows.filter((r: any) => !sudah.has(r.id))];
  return gabung.slice(off, off + lim);
}

// Hitung jumlah hasil cari per modul (tanpa batas): gabungan id dari
// FTS MATCH dan LIKE, didedup — cerminan persis dari cariModul di atas,
// supaya angka yang ditampilkan sama dengan hasil yang bisa dimuat.
// Dipakai tampilan "satu pencarian" (P3) untuk hitungan per modul.
function hitungCariModul(
  tabel: string,
  fts: string,
  kolomLike: string[],
  q: string,
  filterSql = "",
  filterParams: any[] = []
): number {
  const tokens = tokenCari(q);
  if (!tokens.length) return 0;
  const id = new Set<number>();
  try {
    const ftsRows = db
      .query(`SELECT m.id FROM ${fts} f JOIN ${tabel} m ON m.id = f.rowid WHERE ${fts} MATCH ? ${filterSql}`)
      .all(tokens.map((t) => `${t}*`).join(" "), ...filterParams) as { id: number }[];
    for (const r of ftsRows) id.add(r.id);
  } catch {}
  const like = likeDari(q);
  const whereLike = kolomLike.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(" OR ");
  const likeRows = db
    .query(`SELECT m.id FROM ${tabel} m WHERE (${whereLike}) ${filterSql}`)
    .all(...kolomLike.map(() => like), ...filterParams) as { id: number }[];
  for (const r of likeRows) id.add(r.id);
  return id.size;
}

export function hitungCariSemua(q: string) {
  return {
    ayat: hitungCariModul("ayat", "ayat_fts", ["arab", "terjemahan", "surah_nama"], q),
    hadits: hitungCariModul("hadits", "hadits_fts", ["matan_arab", "matan_id", "kitab", "perawi"], q),
    siroh: hitungCariModul("siroh", "siroh_fts", ["judul", "peristiwa", "hikmah", "tempat"], q),
    artikel: hitungCariModul("artikel", "artikel_fts", ["judul", "isi", "dalil"], q),
    fiqh: hitungCariModul("fiqh", "fiqh_fts", ["kitab", "bab", "pasal", "teks"], q),
  };
}

export function daftarSurah() {
  return db
    .query(
      "SELECT surah_no, surah_nama, COUNT(*) AS jumlah FROM ayat GROUP BY surah_no, surah_nama ORDER BY surah_no ASC"
    )
    .all();
}

export function hitungAyat(surah?: number): number {
  return surah
    ? hitung("SELECT COUNT(*) AS n FROM ayat WHERE surah_no = ?", [surah])
    : hitung("SELECT COUNT(*) AS n FROM ayat");
}

export function listAyat(limit = 20, offset = 0, surah?: number) {
  const lim = batas(limit);
  const off = awal(offset);
  return surah
    ? db
        .query("SELECT * FROM ayat WHERE surah_no = ? ORDER BY ayat_no ASC LIMIT ? OFFSET ?")
        .all(surah, lim, off)
    : db
        .query("SELECT * FROM ayat ORDER BY surah_no ASC, ayat_no ASC LIMIT ? OFFSET ?")
        .all(lim, off);
}

export function getAyat(surah: number, ayatNo: number) {
  const row = db
    .query("SELECT * FROM ayat WHERE surah_no = ? AND ayat_no = ?")
    .get(surah, ayatNo) as any;
  if (!row) return null;
  return {
    ...row,
    tafsir: db
      .query("SELECT * FROM tafsir WHERE ayat_id = ? ORDER BY CASE tingkat WHEN 'ringkas' THEN 1 WHEN 'menengah' THEN 2 WHEN 'mendalam' THEN 3 END")
      .all(row.id),
    kata: db
      .query("SELECT * FROM kata WHERE ayat_id = ? ORDER BY urut ASC")
      .all(row.id),
  };
}

export function cariAyat(q: string, limit = 20, offset = 0, surah?: number) {
  return surah
    ? cariModul("ayat", "ayat_fts", ["arab", "terjemahan", "surah_nama"], q, limit, offset, "AND m.surah_no = ?", [surah])
    : cariModul("ayat", "ayat_fts", ["arab", "terjemahan", "surah_nama"], q, limit, offset);
}

export function hitungHadits(kitab?: string, status?: string): number {
  if (kitab && status) return hitung("SELECT COUNT(*) AS n FROM hadits WHERE kitab = ? AND status_sanad = ?", [kitab, status]);
  if (kitab) return hitung("SELECT COUNT(*) AS n FROM hadits WHERE kitab = ?", [kitab]);
  if (status) return hitung("SELECT COUNT(*) AS n FROM hadits WHERE status_sanad = ?", [status]);
  return hitung("SELECT COUNT(*) AS n FROM hadits");
}

export function listHadits(limit = 20, offset = 0, kitab?: string, status?: string) {
  const lim = batas(limit);
  const off = awal(offset);
  if (kitab && status) return db.query("SELECT * FROM hadits WHERE kitab = ? AND status_sanad = ? ORDER BY id ASC LIMIT ? OFFSET ?").all(kitab, status, lim, off);
  if (kitab) return db.query("SELECT * FROM hadits WHERE kitab = ? ORDER BY id ASC LIMIT ? OFFSET ?").all(kitab, lim, off);
  if (status) return db.query("SELECT * FROM hadits WHERE status_sanad = ? ORDER BY id ASC LIMIT ? OFFSET ?").all(status, lim, off);
  return db.query("SELECT * FROM hadits ORDER BY id ASC LIMIT ? OFFSET ?").all(lim, off);
}

export function getHadits(kitab: string, no: string) {
  return db.query("SELECT * FROM hadits WHERE kitab = ? AND no_hadits = ?").get(kitab, no) as any;
}

export function cariHadits(q: string, limit = 20, offset = 0, kitab?: string, status?: string) {
  if (kitab && status) return cariModul("hadits", "hadits_fts", ["matan_arab", "matan_id", "kitab", "perawi"], q, limit, offset, "AND m.kitab = ? AND m.status_sanad = ?", [kitab, status]);
  if (kitab) return cariModul("hadits", "hadits_fts", ["matan_arab", "matan_id", "kitab", "perawi"], q, limit, offset, "AND m.kitab = ?", [kitab]);
  if (status) return cariModul("hadits", "hadits_fts", ["matan_arab", "matan_id", "kitab", "perawi"], q, limit, offset, "AND m.status_sanad = ?", [status]);
  return cariModul("hadits", "hadits_fts", ["matan_arab", "matan_id", "kitab", "perawi"], q, limit, offset);
}

export function hitungSiroh(): number {
  return hitung("SELECT COUNT(*) AS n FROM siroh");
}

export function listSiroh(limit = 20, offset = 0) {
  const lim = batas(limit);
  const off = awal(offset);
  return db
    .query("SELECT * FROM siroh ORDER BY urutan ASC, tahun_hijriah ASC, id ASC LIMIT ? OFFSET ?")
    .all(lim, off);
}

export function cariSiroh(q: string, limit = 20, offset = 0) {
  return cariModul("siroh", "siroh_fts", ["judul", "peristiwa", "hikmah", "tempat"], q, limit, offset);
}

export function hitungArtikel(kategori?: string): number {
  return kategori
    ? hitung("SELECT COUNT(*) AS n FROM artikel WHERE kategori = ?", [kategori])
    : hitung("SELECT COUNT(*) AS n FROM artikel");
}

export function listArtikel(limit = 20, offset = 0, kategori?: string) {
  const lim = batas(limit);
  const off = awal(offset);
  return kategori
    ? db.query("SELECT * FROM artikel WHERE kategori = ? ORDER BY id DESC LIMIT ? OFFSET ?").all(kategori, lim, off)
    : db.query("SELECT * FROM artikel ORDER BY id DESC LIMIT ? OFFSET ?").all(lim, off);
}

export function cariArtikel(q: string, limit = 20, offset = 0, kategori?: string) {
  return kategori
    ? cariModul("artikel", "artikel_fts", ["judul", "isi", "dalil"], q, limit, offset, "AND m.kategori = ?", [kategori])
    : cariModul("artikel", "artikel_fts", ["judul", "isi", "dalil"], q, limit, offset);
}

export function hitungFiqih(kitab?: string): number {
  return kitab
    ? hitung("SELECT COUNT(*) AS n FROM fiqh WHERE kitab = ?", [kitab])
    : hitung("SELECT COUNT(*) AS n FROM fiqh");
}

export function daftarKitabFiqih(): string[] {
  return (db.query("SELECT kitab FROM fiqh GROUP BY kitab ORDER BY MIN(urut)").all() as { kitab: string }[]).map(
    (r) => r.kitab,
  );
}

// Daftar bab satu kitab (judul + urut bagian pertamanya) — cerminan
// daftarSurah: pemilih bab di tab Fiqih diisi dari endpoint ini.
export function daftarBabFiqih(kitab: string): { bab: string; urut: number }[] {
  return db
    .query("SELECT bab, MIN(urut) AS urut FROM fiqh WHERE kitab = ? GROUP BY bab ORDER BY MIN(urut)")
    .all(kitab) as { bab: string; urut: number }[];
}

// Seluruh bagian dalam satu bab, urut naik — yang ditampilkan saat
// pengguna memilih kitab + bab lalu menekan Buka.
export function listFiqihBab(kitab: string, bab: string) {
  return db
    .query("SELECT * FROM fiqh WHERE kitab = ? AND bab = ? ORDER BY urut ASC")
    .all(kitab, bab);
}

// Satu bagian berdasarkan urutnya dalam kitab — urut stabil antar
// impor ulang (UNIQUE kitab+urut), jadi dipakai tautan dalam
// #fiqih/{kitab}/{urut}, cerminan getHadits(kitab, no).
export function getFiqihByUrut(kitab: string, urut: number) {
  return db.query("SELECT * FROM fiqh WHERE kitab = ? AND urut = ?").get(kitab, urut) as any;
}

export function listFiqih(limit = 20, offset = 0, kitab?: string) {
  const lim = batas(limit);
  const off = awal(offset);
  return kitab
    ? db.query("SELECT * FROM fiqh WHERE kitab = ? ORDER BY urut ASC LIMIT ? OFFSET ?").all(kitab, lim, off)
    : db.query("SELECT * FROM fiqh ORDER BY kitab ASC, urut ASC LIMIT ? OFFSET ?").all(lim, off);
}

export function getFiqih(id: number) {
  return db.query("SELECT * FROM fiqh WHERE id = ?").get(id) as any;
}

export function cariFiqih(q: string, limit = 20, offset = 0, kitab?: string) {
  return kitab
    ? cariModul("fiqh", "fiqh_fts", ["kitab", "bab", "pasal", "teks"], q, limit, offset, "AND m.kitab = ?", [kitab])
    : cariModul("fiqh", "fiqh_fts", ["kitab", "bab", "pasal", "teks"], q, limit, offset);
}

export function cariSemua(q: string, limit = 20) {
  return {
    ayat: cariAyat(q, limit, 0),
    hadits: cariHadits(q, limit, 0),
    siroh: cariSiroh(q, limit, 0),
    artikel: cariArtikel(q, limit, 0),
    fiqh: cariFiqih(q, limit, 0),
    total: hitungCariSemua(q),
  };
}

// ---------------------------------------------------------------------------
// Tanya Jawab AI: cache jawaban.
// Satu baris per pertanyaan (kunci = hash SHA-256 pertanyaan yang
// dinormalisasi), berlaku 7 hari. Tujuannya hemat biaya: pertanyaan yang
// sama tidak memanggil 9router dua kali. Isi jawaban disimpan sebagai
// JSON { jawaban, sumber } persis seperti yang dikembalikan endpoint.
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS tanya_cache (
  hash TEXT PRIMARY KEY,
  pertanyaan TEXT NOT NULL,
  jawaban TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

export function getTanyaCache(hash: string): string | null {
  const row = db
    .query(
      "SELECT jawaban FROM tanya_cache WHERE hash = ? AND created_at >= datetime('now', '-7 days')"
    )
    .get(hash) as any;
  return row ? String(row.jawaban) : null;
}

export function setTanyaCache(hash: string, pertanyaan: string, jawaban: string): void {
  db.query(
    "INSERT INTO tanya_cache (hash, pertanyaan, jawaban) VALUES (?, ?, ?) " +
      "ON CONFLICT(hash) DO UPDATE SET pertanyaan = excluded.pertanyaan, jawaban = excluded.jawaban, created_at = datetime('now')"
  ).run(hash, pertanyaan, jawaban);
}

export function bersihkanTanyaCache(): void {
  db.query("DELETE FROM tanya_cache WHERE created_at < datetime('now', '-7 days')").run();
}

/** Hapus satu entri cache tanya berdasarkan hash pertanyaannya.
 *  Dipakai scripts/hapus-cache-tanya.ts: jawaban "tidak ditemukan"
 *  yang tersimpan sebelum perbaikan retrieval/baku harus dihapus
 *  supaya pertanyaan itu dicari ulang — kalau tidak, cache 7 hari
 *  terus mengembalikan penolakan lama. Mengembalikan true bila ada
 *  entri yang dihapus. */
export function hapusTanyaCache(hash: string): boolean {
  const info = db.query("DELETE FROM tanya_cache WHERE hash = ?").run(hash);
  return info.changes > 0;
}

// ---------------------------------------------------------------------------
// Jawaban baku (memory kurasi).
// Jawaban yang ditulis/dis setujui Pak Gun untuk pertanyaan yang sering
// masuk. Dicek SEBELUM cache dan SEBELUM memanggil AI: bila cocok,
// jawaban baku yang keluar — tanpa biaya AI, tanpa risiko AI salah
// merangkai. `pemicu` = kata-kata kunci (dipisah koma) yang semuanya
// harus ada di pertanyaan; makin banyak pemicunya, makin spesifik.
// `sumber` = JSON array objek Sumber (modul, rujukan, teks, + petunjuk
// buka-di-modul), supaya kartu sumber di frontend bekerja sama seperti
// jawaban AI. Isi awal lewat scripts/seed-jawaban-baku.ts; menambah
// atau mengubah entri = ubah skrip itu lalu jalankan ulang (upsert
// berdasarkan `pertanyaan`, jadi entri lama diperbarui, bukan ganda).
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS jawaban_baku (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pertanyaan TEXT NOT NULL UNIQUE,
  pemicu TEXT NOT NULL,
  jawaban TEXT NOT NULL,
  sumber TEXT NOT NULL DEFAULT '[]',
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
`);

export function listJawabanBaku(): any[] {
  return db
    .query("SELECT * FROM jawaban_baku WHERE aktif = 1 ORDER BY id ASC")
    .all() as any[];
}

export function upsertJawabanBaku(
  pertanyaan: string,
  pemicu: string,
  jawaban: string,
  sumberJson: string
): void {
  db.query(
    "INSERT INTO jawaban_baku (pertanyaan, pemicu, jawaban, sumber) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(pertanyaan) DO UPDATE SET pemicu = excluded.pemicu, jawaban = excluded.jawaban, sumber = excluded.sumber, aktif = 1, updated_at = datetime('now')"
  ).run(pertanyaan, pemicu, jawaban, sumberJson);
}
