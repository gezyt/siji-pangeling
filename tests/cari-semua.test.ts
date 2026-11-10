// Uji "satu pencarian" P3: cariSemua mengembalikan daftar + total
// per modul (hitungCariSemua), dengan angka yang sama dengan hasil
// yang bisa dimuat. Memakai DB sementara (SIJI_DB), tidak menyentuh
// data/app.db.
// Catatan: bun test berbagi modul antar berkas uji dalam satu proses,
// jadi bila tanya.test.ts sudah mengimpor src/db, berkas ini memakai
// DB yang sama — karena itu seed memakai id 101+ dan kata kunci
// "kunyit" yang tidak ada di seed tanya.test.ts.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";

const TMP_DB = "/tmp/siji-cari-test.db";
process.env.SIJI_DB = TMP_DB;
for (const f of [TMP_DB, TMP_DB + "-wal", TMP_DB + "-shm"]) {
  try {
    unlinkSync(f);
  } catch {}
}

const dbMod: typeof import("../src/db") = await import("../src/db");

beforeAll(() => {
  const db = dbMod.db;
  // Ayat: 1 cocok "kunyit", 1 tidak.
  db.query(
    "INSERT INTO ayat (id, surah_no, surah_nama, ayat_no, verse_key, arab, terjemahan) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(101, 3, "Ali 'Imran", 200, "3:200", "يَا أَيُّهَا الَّذِينَ آمَنُوا اصْبِرُوا وَصَابِرُوا", "Wahai orang-orang yang beriman, bersabarlah kamu; kunyit yang pahit pun bermanfaat.");
  db.query(
    "INSERT INTO ayat (id, surah_no, surah_nama, ayat_no, verse_key, arab, terjemahan) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(102, 5, "Al-Ma'idah", 1, "5:1", "يَا أَيُّهَا الَّذِينَ آمَنُوا أَوْفُوا بِالْعُقُودِ", "Wahai orang-orang yang beriman, penuhilah janji-janji.");
  // Hadits: 2 cocok "kunyit" (satu di matan, satu di kitab), 1 tidak.
  db.query(
    "INSERT INTO hadits (id, kitab, no_hadits, matan_id, status_sanad) VALUES (?, ?, ?, ?, ?)"
  ).run(101, "Sahih al-Bukhari", 1, "Sesungguhnya kunyit itu pada pukulan pertama.", "sahih");
  db.query(
    "INSERT INTO hadits (id, kitab, no_hadits, matan_id, status_sanad) VALUES (?, ?, ?, ?, ?)"
  ).run(102, "Kitab Kunyit", 7, "Amal yang paling dicintai Allah adalah yang terus-menerus.", "sahih");
  db.query(
    "INSERT INTO hadits (id, kitab, no_hadits, matan_id, status_sanad) VALUES (?, ?, ?, ?, ?)"
  ).run(103, "Sahih Muslim", 5, "Kebersihan itu sebagian dari iman.", "sahih");
  // Siroh: 1 cocok, 1 tidak.
  db.query("INSERT INTO siroh (id, urutan, judul, peristiwa, tempat) VALUES (?, ?, ?, ?, ?)").run(
    101, 1, "Kelahiran Nabi", "Nabi lahir di Makkah. Kunyit menjadi obat ibunda Aminah.", "Makkah"
  );
  db.query("INSERT INTO siroh (id, urutan, judul, peristiwa, tempat) VALUES (?, ?, ?, ?, ?)").run(
    102, 2, "Wahyu Pertama", "Wahyu pertama turun di Gua Hira.", "Gua Hira"
  );
  // Artikel: 1 cocok, 1 tidak.
  db.query("INSERT INTO artikel (id, judul, isi, kategori) VALUES (?, ?, ?, ?)").run(
    101, "Kunyit dalam ujian", "Kunyit adalah kunci menghadapi ujian hidup.", "Pengingat"
  );
  db.query("INSERT INTO artikel (id, judul, isi, kategori) VALUES (?, ?, ?, ?)").run(
    102, "Ikhlas beramal", "Ikhlas adalah membersihkan niat dari selain Allah.", "Pengingat"
  );
});

afterAll(() => {
  for (const f of [TMP_DB, TMP_DB + "-wal", TMP_DB + "-shm"]) {
    try {
      unlinkSync(f);
    } catch {}
  }
});

test("hitungCariSemua menghitung per modul", () => {
  expect(dbMod.hitungCariSemua("kunyit")).toEqual({ ayat: 1, hadits: 2, siroh: 1, artikel: 1 });
  expect(dbMod.hitungCariSemua("kata-yang-tidak-ada-di-mana-mana")).toEqual({
    ayat: 0,
    hadits: 0,
    siroh: 0,
    artikel: 0,
  });
});

test("cariSemua mengembalikan daftar + total yang cocok", () => {
  const r: any = dbMod.cariSemua("kunyit", 20);
  expect(r.total).toEqual({ ayat: 1, hadits: 2, siroh: 1, artikel: 1 });
  expect(r.ayat.length).toBe(1);
  expect(r.ayat[0].verse_key).toBe("3:200");
  expect(r.hadits.length).toBe(2);
  expect(r.siroh.length).toBe(1);
  expect(r.artikel.length).toBe(1);
});

test("cariSemua dengan limit memotong daftar tapi total tetap penuh", () => {
  const r: any = dbMod.cariSemua("kunyit", 1);
  expect(r.hadits.length).toBe(1);
  expect(r.total.hadits).toBe(2);
});

test("cariSemua tanpa hasil: daftar kosong dan total nol", () => {
  const r: any = dbMod.cariSemua("kata-yang-tidak-ada-di-mana-mana", 20);
  expect(r.total).toEqual({ ayat: 0, hadits: 0, siroh: 0, artikel: 0 });
  expect(r.ayat).toEqual([]);
  expect(r.hadits).toEqual([]);
  expect(r.siroh).toEqual([]);
  expect(r.artikel).toEqual([]);
});
