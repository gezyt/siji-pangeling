// Migrasi per-modul: konten jenis='ayat' -> tabel ayat.
//
// Catatan: mengimpor file ../src/db.ts SUDAH menjalankan migrasi
// otomatis bila ayat masih kosong (pola yang sama dengan migrasi
// saat server start). Jadi skrip ini pada dasarnya adalah laporan
// verifikasi, plus jalan ulang manual dengan --reset bila perlu.
//
// Pakai:
//   bun run scripts/migrate-per-modul.ts
//   bun run scripts/migrate-per-modul.ts -- --reset
//   SIJI_DB=/tmp/uji.db bun run scripts/migrate-per-modul.ts
import { db, migrasiAyat } from "../src/db";

const reset = process.argv.includes("--reset");

if (reset) {
  const r = migrasiAyat(true);
  console.log(`Migrasi ulang: ${r.hasil} ayat (dari ${r.dariKonten} baris konten).`);
} else {
  const r = migrasiAyat(false);
  console.log(
    r.migrated
      ? `Migrasi: ${r.hasil} ayat dipindah dari konten ke tabel ayat.`
      : `Tidak ada migrasi baru: ayat sudah ${r.hasil}, konten ayat ${r.dariKonten}.`
  );
}

const cek = (sql: string) =>
  (db.query(sql).get() as { n: number }).n;

console.log("Verifikasi:");
console.log(`  konten ayat : ${cek("SELECT COUNT(*) AS n FROM konten WHERE jenis = 'ayat'")}`);
console.log(`  ayat        : ${cek("SELECT COUNT(*) AS n FROM ayat")}`);
console.log(`  hadits      : ${cek("SELECT COUNT(*) AS n FROM hadits")}`);
console.log(`  siroh       : ${cek("SELECT COUNT(*) AS n FROM siroh")}`);
console.log(`  artikel     : ${cek("SELECT COUNT(*) AS n FROM artikel")}`);
console.log(`  tafsir      : ${cek("SELECT COUNT(*) AS n FROM tafsir")}`);
console.log(`  kata        : ${cek("SELECT COUNT(*) AS n FROM kata")}`);

const sampel = db
  .query("SELECT verse_key, surah_nama, arab, terjemahan FROM ayat WHERE surah_no = 2 AND ayat_no = 255")
  .get() as any;
if (sampel) {
  console.log(`Sampel: ${sampel.verse_key} — ${sampel.surah_nama}`);
  console.log(`  Arab: ${sampel.arab.slice(0, 60)}…`);
  console.log(`  Terjemahan: ${sampel.terjemahan.slice(0, 80)}…`);
} else {
  console.log("Sampel QS 2:255 tidak ditemukan (wajar bila DB masih kosong).");
}
