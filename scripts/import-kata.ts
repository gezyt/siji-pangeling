// Impor terjemah per kata bahasa Indonesia, dari Quran.com API v4
// (publik, gratis, tanpa API key).
//
// Keputusan sumber (riset 2026-11-10, dipilih Pak Gun):
// - Quran.com API v4: `GET /v4/verses/by_chapter/{n}?words=true
//   &language=id&word_fields=text_uthmani,translation` — tiap kata
//   membawa `translation: {text, language_name: "indonesian"}`.
//   Terverifikasi live 2026-11-10 di 3 titik: Al-Fatihah 1:1–7,
//   Ayat Kursi 2:255 (50 kata), An-Nas 114:1–6 — semua kata ada
//   terjemah Indonesianya. Cakupan penuh 114 surah.
// - AlQuranCloud: TIDAK punya edisi per kata (hanya terjemah per
//   ayat: id.indonesian, id.muntakhab) — gugur.
// - equran.id: tidak ada endpoint per kata — gugur.
// - LPMQ Kemenag API resmi: tidak ada endpoint per kata yang
//   diketahui publik — gugur.
//
// Aturan impor yang jujur (jangan dilunakkan di laporan):
// - Diimpor VERBATIM (apa adanya dari sumber): teks Arab Uthmani
//   berikut tanda waqaf yang menempel (mis. "ٱلْقَيُّومُ ۚ"), dan
//   arti Indonesia berikut kekhasan sumbernya (mis. "menimpaNya",
//   "didalam", "diantara", "langit(jamak)"). Bukan salah ketik
//   impor — begitu adanya di Quran.com. Jangan diam-diam
//   membetulkan terjemahan orang lain.
// - Entri `char_type_name: "end"` (angka nomor ayat, arti "(1)",
//   "(2)") DILEWATI — bukan kata.
// - Penerjemah per kata TIDAK disebutkan namanya di respons API
//   (berbeda dengan terjemah per ayat Quran.com yang dari Kemenag).
//   Atribusi yang ditulis di dokumen: "Quran.com (terjemah per kata
//   bahasa Indonesia)". Jangan mengklaim ini terjemah Kemenag.
// - Validasi ketat per surah: jumlah ayat yang diambil HARUS sama
//   dengan jumlah ayat surah itu di tabel ayat; tiap ayat HARUS ada
//   di tabel ayat; tiap kata (selain "end") HARUS punya teks Arab
//   non-kosong DAN arti Indonesia non-kosong. Satu surah gagal →
//   SELURUH impor dibatalkan sebelum satu baris pun ditulis (fetch
//   + validasi semua dulu, insert belakangan dalam satu transaksi).
// - Idempotent: bila tabel kata sudah terisi, dilewati (pakai
//   --reset untuk impor ulang). Satu surah bisa diimpor sendiri
//   dengan --surah=N (baris lama surah itu dihapus dulu, lalu
//   diisi ulang — jadi --surah aman dijalankan berulang).
//
// Pakai:
//   bun run import:kata                 # semua 114 surah
//   bun run import:kata -- --surah=2    # satu surah saja
//   bun run import:kata -- --reset      # hapus semua kata, impor ulang
//   SIJI_DB=/tmp/uji.db bun run import:kata
import { db } from "../src/db";

const API = "https://api.quran.com/api/v4";
const PER_HALAMAN = 50;

export type BarisKata = {
  ayat_id: number;
  urut: number;
  arab: string;
  arti: string;
};

type KataApi = {
  position: number;
  char_type_name: string;
  text_uthmani: string;
  translation?: { text?: string; language_name?: string } | null;
};

type AyatApi = {
  verse_key: string;
  verse_number: number;
  words: KataApi[];
};

/** Bangun baris kata dari daftar ayat satu surah + peta ayat
 *  "surah:ayat" -> id. Validasi ketat (lihat kepala berkas).
 *  Gagal -> throw dengan pesan yang menyebut surah/ayatnya. */
export function bangunBarisKata(
  nomorSurah: number,
  verses: AyatApi[],
  petaAyat: Map<string, number>,
  jumlahAyatSurah: number,
): BarisKata[] {
  if (!Array.isArray(verses)) {
    throw new Error(`Surah ${nomorSurah}: respons API tidak berisi daftar ayat.`);
  }
  if (verses.length !== jumlahAyatSurah) {
    throw new Error(
      `Surah ${nomorSurah}: ayat diambil ${verses.length} != jumlah ayat di tabel ${jumlahAyatSurah}, impor dibatalkan.`,
    );
  }
  const baris: BarisKata[] = [];
  const kunciUnik = new Set<string>();
  for (const v of verses) {
    const ayat_id = petaAyat.get(v.verse_key);
    if (!ayat_id) {
      throw new Error(`Ayat ${v.verse_key}: tidak ada di tabel ayat, impor dibatalkan.`);
    }
    if (!Array.isArray(v.words) || v.words.length === 0) {
      throw new Error(`Ayat ${v.verse_key}: tidak ada kata, impor dibatalkan.`);
    }
    for (const k of v.words) {
      if (k.char_type_name === "end") continue;
      const arab = String(k.text_uthmani ?? "").trim();
      const arti = String(k.translation?.text ?? "").trim();
      if (!arab) {
        throw new Error(`Ayat ${v.verse_key} urut ${k.position}: teks Arab kosong, impor dibatalkan.`);
      }
      if (!arti) {
        throw new Error(`Ayat ${v.verse_key} urut ${k.position}: arti kosong, impor dibatalkan.`);
      }
      if (k.translation?.language_name !== "indonesian") {
        throw new Error(
          `Ayat ${v.verse_key} urut ${k.position}: bahasa arti bukan indonesian (${k.translation?.language_name}), impor dibatalkan.`,
        );
      }
      const kunci = `${ayat_id}:${k.position}`;
      if (kunciUnik.has(kunci)) {
        throw new Error(`Ayat ${v.verse_key} urut ${k.position}: kata ganda, impor dibatalkan.`);
      }
      kunciUnik.add(kunci);
      baris.push({ ayat_id, urut: k.position, arab, arti });
    }
  }
  return baris;
}

async function ambilKataSurah(nomor: number): Promise<AyatApi[]> {
  const semua: AyatApi[] = [];
  let halaman = 1;
  for (;;) {
    const r = await fetch(
      `${API}/verses/by_chapter/${nomor}?words=true&language=id&word_fields=text_uthmani,translation&per_page=${PER_HALAMAN}&page=${halaman}`,
    );
    if (!r.ok) throw new Error(`Surah ${nomor}: gagal mengunduh kata: HTTP ${r.status}`);
    const j: any = await r.json();
    if (!Array.isArray(j.verses)) {
      throw new Error(`Surah ${nomor}: respons API tidak valid (tanpa daftar verses).`);
    }
    semua.push(...(j.verses as AyatApi[]));
    if (!j.pagination?.next_page) break;
    halaman = j.pagination.next_page;
  }
  return semua;
}

function petaAyatSemua(): Map<string, number> {
  const peta = new Map<string, number>();
  const semua = db.query("SELECT id, surah_no, ayat_no FROM ayat").all() as {
    id: number;
    surah_no: number;
    ayat_no: number;
  }[];
  for (const a of semua) peta.set(`${a.surah_no}:${a.ayat_no}`, a.id);
  return peta;
}

function hitungAyatSurah(peta: Map<string, number>, nomor: number): number {
  let n = 0;
  for (const k of peta.keys()) if (k.startsWith(`${nomor}:`)) n++;
  return n;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");
  const surahArg = args.find((a) => a.startsWith("--surah="))?.split("=")[1];
  const surahPilih = surahArg ? Number(surahArg) : null;
  if (surahArg && (!Number.isInteger(surahPilih) || surahPilih! < 1 || surahPilih! > 114)) {
    throw new Error(`--surah harus 1-114, dapat: ${surahArg}`);
  }
  const daftar = surahPilih ? [surahPilih] : Array.from({ length: 114 }, (_, i) => i + 1);

  const peta = petaAyatSemua();
  const ayatIdsSurah = (nomor: number): number[] => {
    const ids: number[] = [];
    for (const [k, id] of peta) if (k.startsWith(`${nomor}:`)) ids.push(id);
    return ids;
  };

  const sudah = (db.query("SELECT COUNT(*) AS n FROM kata").get() as { n: number }).n;
  if (reset && sudah > 0) {
    db.query("DELETE FROM kata").run();
    console.log(`Kata: ${sudah} baris lama dihapus.`);
  } else if (sudah > 0 && !surahPilih) {
    console.log(`Kata: sudah ada ${sudah} baris, dilewati (pakai --reset untuk impor ulang).`);
    return;
  }

  console.log(`Peta ayat: ${peta.size} ayat. Mengunduh kata ${daftar.length} surah dari Quran.com…`);
  const semuaBaris: BarisKata[] = [];
  for (const n of daftar) {
    const verses = await ambilKataSurah(n);
    const baris = bangunBarisKata(n, verses, peta, hitungAyatSurah(peta, n));
    semuaBaris.push(...baris);
    if (n % 10 === 0 || n === daftar[daftar.length - 1]) {
      console.log(`  surah ${n}/114: ${semuaBaris.length} kata tervalidasi…`);
    }
  }

  // Satu surah yang diimpor sendiri: hapus baris lamanya dulu supaya
  // impor berulang tidak menabrak UNIQUE(ayat_id, urut).
  if (surahPilih) {
    const ids = ayatIdsSurah(surahPilih);
    if (ids.length) {
      db.query(`DELETE FROM kata WHERE ayat_id IN (${ids.map(() => "?").join(",")})`).run(...ids);
    }
  }

  const insert = db.query("INSERT INTO kata (ayat_id, urut, arab, arti) VALUES (?, ?, ?, ?)");
  const isiSemua = db.transaction((list: BarisKata[]) => {
    for (const b of list) insert.run(b.ayat_id, b.urut, b.arab, b.arti);
  });
  isiSemua(semuaBaris);

  console.log("Verifikasi:");
  console.log(`  total kata: ${(db.query("SELECT COUNT(*) AS n FROM kata").get() as { n: number }).n}`);
  console.log(
    `  ayat tercakup: ${(db.query("SELECT COUNT(DISTINCT ayat_id) AS n FROM kata").get() as { n: number }).n} dari ${peta.size}`,
  );
  const kursi = db.query(
    "SELECT COUNT(*) AS n FROM kata k JOIN ayat a ON a.id = k.ayat_id WHERE a.surah_no = 2 AND a.ayat_no = 255",
  ).get() as { n: number };
  console.log(`  2:255: ${kursi.n} kata (harapan: 50)`);
  const contoh = db.query(
    "SELECT k.arab AS arab, k.arti AS arti FROM kata k JOIN ayat a ON a.id = k.ayat_id WHERE a.surah_no = 1 AND a.ayat_no = 1 AND k.urut = 1",
  ).get() as { arab: string; arti: string } | null;
  console.log(`  1:1 kata pertama: ${contoh ? `${contoh.arab} → “${contoh.arti}”` : "TIDAK DITEMUKAN"}`);
}

// Alur CLI hanya jalan bila file dieksekusi langsung, BUKAN saat
// diimpor (mis. oleh bun test) — tanpa penjaga ini, mengimpor
// bangunBarisKata dari tes akan ikut menjalankan impor sungguhan.
if (import.meta.main) await main();
