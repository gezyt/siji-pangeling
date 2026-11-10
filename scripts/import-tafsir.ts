// Impor tafsir: Tafsir Kemenag per ayat, dari equran.id API v2
// (tanpa API key, sumber data dinyatakan Kemenag RI).
//
// Keputusan sumber (riset 2026-11-10, dipilih Pak Gun):
// - Quran.com: 0 tafsir Indonesia.
// - AlQuranCloud: 6 edisi tafsir, semuanya Arab.
// - Quranpedia: 2.198 buku tafsir, 0 Indonesia (Arab 2.153) —
//   plus kebijakannya melarang impor massal ("don't freeze a copy").
// - LPMQ Kemenag API resmi (quran-api.lpmqkemenag.id): Tafsir
//   Ringkas + Tahlili, TETAPI akses berlapis — daftar akun, surat
//   permohonan resmi ke Kepala LPMQ, tunggu token, isi survei —
//   baru endpoint diberikan; tanpa dokumentasi endpoint publik.
// - equran.id API v2 (https://equran.id/api/v2): publik, gratis,
//   tanpa API key, sumber data dinyatakan Kemenag RI, endpoint
//   tafsir per surah. Terverifikasi live 2026-11-10: surah 1 (7/7),
//   2 (286/286, 2:255 teks Indonesia benar), 36 (83/83), 114 (6/6).
//   Dipakai banyak aplikasi lain untuk tafsir Kemenag.
//
// Aturan impor yang jujur (jangan dilunakkan di laporan):
// - equran.id TIDAK melabeli teksnya Wajiz/Tahlili; teksnya panjang
//   berparagraf (gaya Tahlili, rata-rata ~1.000 karakter/ayat di uji
//   impor — angka pastinya dicetak di akhir impor). Karena itu
//   disimpan sebagai tingkat 'mendalam', bukan 'ringkas'.
// - Kolom sumber tiap baris menulis "Tafsir Kemenag (via equran.id)"
//   — cerminan data Kemenag lewat perantara, bukan API resmi LPMQ.
// - Validasi ketat per surah: jumlah entri tafsir HARUS sama dengan
//   jumlahAyat, tiap ayat HARUS ada di tabel ayat, tiap teks HARUS
//   non-kosong. Satu surah gagal → SELURUH impor dibatalkan sebelum
//   satu baris pun ditulis (fetch + validasi semua dulu, insert
//   belakangan dalam satu transaksi).
// - Idempotent: bila tafsir 'mendalam' sudah ada, dilewati
//   (pakai --reset untuk impor ulang). Satu surah bisa diimpor
//   sendiri dengan --surah=N (untuk uji/veriifikasi).
//
// Pakai:
//   bun run import:tafsir                 # semua 114 surah
//   bun run import:tafsir -- --surah=2    # satu surah saja
//   bun run import:tafsir -- --reset      # hapus tafsir mendalam, impor ulang
//   SIJI_DB=/tmp/uji.db bun run import:tafsir
import { db } from "../src/db";

const API = "https://equran.id/api/v2";
const TINGKAT = "mendalam";
const SUMBER = "Tafsir Kemenag (via equran.id)";

export type BarisTafsir = {
  ayat_id: number;
  tingkat: string;
  isi: string;
  sumber: string;
};

type TafsirApi = {
  nomor: number;
  jumlahAyat: number;
  tafsir: { ayat: number; teks: string }[];
};

/** Bangun baris tafsir dari satu respons API + peta ayat "surah:ayat" -> id.
 *  Validasi ketat: jumlah entri harus sama dengan jumlahAyat, tiap ayat
 *  harus ada di peta, tiap teks harus non-kosong. Gagal -> throw. */
export function bangunBarisTafsir(
  data: TafsirApi,
  petaAyat: Map<string, number>,
): BarisTafsir[] {
  const { nomor, jumlahAyat, tafsir } = data;
  if (!Array.isArray(tafsir)) {
    throw new Error(`Surah ${nomor}: respons API tidak berisi daftar tafsir.`);
  }
  if (tafsir.length !== jumlahAyat) {
    throw new Error(
      `Surah ${nomor}: entri tafsir ${tafsir.length} != jumlahAyat ${jumlahAyat}, impor dibatalkan.`,
    );
  }
  const baris: BarisTafsir[] = [];
  for (const t of tafsir) {
    const isi = String(t.teks ?? "").trim();
    if (!isi) throw new Error(`Surah ${nomor} ayat ${t.ayat}: teks tafsir kosong, impor dibatalkan.`);
    const ayat_id = petaAyat.get(`${nomor}:${t.ayat}`);
    if (!ayat_id) {
      throw new Error(`Surah ${nomor} ayat ${t.ayat}: tidak ada di tabel ayat, impor dibatalkan.`);
    }
    baris.push({ ayat_id, tingkat: TINGKAT, isi, sumber: SUMBER });
  }
  return baris;
}

async function ambilTafsir(nomor: number): Promise<TafsirApi> {
  const r = await fetch(`${API}/tafsir/${nomor}`);
  if (!r.ok) throw new Error(`Surah ${nomor}: gagal mengunduh tafsir: HTTP ${r.status}`);
  const j: any = await r.json();
  if (j.code !== 200 || !j.data) {
    throw new Error(`Surah ${nomor}: respons API tidak valid (code ${j.code}).`);
  }
  return j.data as TafsirApi;
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");
  const surahArg = args.find((a) => a.startsWith("--surah="))?.split("=")[1];
  const surahPilih = surahArg ? Number(surahArg) : null;
  if (surahArg && (!Number.isInteger(surahPilih) || surahPilih! < 1 || surahPilih! > 114)) {
    throw new Error(`--surah harus 1-114, dapat: ${surahArg}`);
  }
  const daftar = surahPilih ? [surahPilih] : Array.from({ length: 114 }, (_, i) => i + 1);

  const sudah = (db.query("SELECT COUNT(*) AS n FROM tafsir WHERE tingkat = ?").get(TINGKAT) as { n: number }).n;
  if (reset && sudah > 0) {
    db.query("DELETE FROM tafsir WHERE tingkat = ?").run(TINGKAT);
    console.log(`Tafsir '${TINGKAT}': ${sudah} baris lama dihapus.`);
  } else if (sudah > 0 && !surahPilih) {
    console.log(`Tafsir '${TINGKAT}': sudah ada ${sudah} baris, dilewati (pakai --reset untuk impor ulang).`);
    return;
  }

  const peta = petaAyatSemua();
  console.log(`Peta ayat: ${peta.size} ayat. Mengunduh tafsir ${daftar.length} surah dari equran.id…`);
  const semuaBaris: BarisTafsir[] = [];
  for (const n of daftar) {
    const data = await ambilTafsir(n);
    const baris = bangunBarisTafsir(data, peta);
    semuaBaris.push(...baris);
    if (n % 10 === 0 || n === daftar[daftar.length - 1]) {
      console.log(`  surah ${n}/114: ${semuaBaris.length} ayat tervalidasi…`);
    }
  }

  const insert = db.query(
    "INSERT INTO tafsir (ayat_id, tingkat, isi, sumber) VALUES (?, ?, ?, ?)",
  );
  const isiSemua = db.transaction((list: BarisTafsir[]) => {
    for (const b of list) insert.run(b.ayat_id, b.tingkat, b.isi, b.sumber);
  });
  isiSemua(semuaBaris);

  console.log("Verifikasi:");
  console.log(`  total tafsir: ${(db.query("SELECT COUNT(*) AS n FROM tafsir").get() as { n: number }).n}`);
  for (const t of ["ringkas", "menengah", "mendalam"] as const) {
    const n = (db.query("SELECT COUNT(*) AS n FROM tafsir WHERE tingkat = ?").get(t) as { n: number }).n;
    console.log(`  ${t}: ${n}`);
  }
  const stat = db.query(
    "SELECT AVG(LENGTH(isi)) AS rata, MIN(LENGTH(isi)) AS min, MAX(LENGTH(isi)) AS maks FROM tafsir WHERE tingkat = ?",
  ).get(TINGKAT) as { rata: number; min: number; maks: number };
  console.log(`  panjang isi '${TINGKAT}': rata-rata ${Math.round(stat.rata)} karakter (min ${stat.min}, maks ${stat.maks})`);
  const kursi = db.query(
    "SELECT LENGTH(t.isi) AS n FROM tafsir t JOIN ayat a ON a.id = t.ayat_id WHERE a.surah_no = 2 AND a.ayat_no = 255 AND t.tingkat = ?",
  ).get(TINGKAT) as { n: number } | null;
  console.log(`  2:255: ${kursi ? `${kursi.n} karakter` : "TIDAK DITEMUKAN"}`);
}

// Alur CLI hanya jalan bila file dieksekusi langsung, BUKAN saat
// diimpor (mis. oleh bun test) — tanpa penjaga ini, mengimpor
// bangunBarisTafsir dari tes akan ikut menjalankan impor sungguhan.
if (import.meta.main) await main();
