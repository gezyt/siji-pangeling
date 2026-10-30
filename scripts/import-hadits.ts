// Impor hadits pilot: Sahih al-Bukhari + Sahih Muslim dari
// fawazahmed0/hadith-api (lewat jsDelivr CDN, tanpa API key).
//
// Keputusan sumber (audit 2026-10-30, dipilih Pak Gun):
// - Sutanlab dicoret sementara: API-nya gagal DNS saat diaudit.
// - Sunnah.com resmi butuh API key (waktu persetujuan tak pasti)
//   dan tidak ada terjemahan Indonesia.
// - fawazahmed0 terverifikasi live: edisi Indonesian ada untuk
//   keenam kitab utama, sampel ind-bukhari/1 dan ind-muslim/1
//   terbaca, struktur ara/ind identik (hadithnumber sama).
//
// Aturan impor yang jujur (jangan dilunakkan di laporan):
// - matan_arab dari edisi ara-*, matan_id dari edisi ind-*.
//   Keduanya dicocokkan per hadithnumber, bukan per urutan file.
// - grades per hadits di sumber ini KOSONG (terverifikasi di
//   sampel). status_sanad='sahih' di sini BUKAN grade per hadits,
//   melainkan status kitab Sahih al-Bukhari / Sahih Muslim.
//   Itu ditulis eksplisit di kolom sumber tiap baris.
// - Penerjemah Indonesia tidak tercantum di sumber (author:
//   "Unknown" di editions.json), jadi kolom sumber juga menulis
//   itu, bukan mengarang nama penerjemah.
// - Perawi TIDAK diparse terpisah di pilot ini: rantai periwayat
//   sudah ada di dalam teks Indonesia (dalam tanda kurung siku),
//   dan memecahnya otomatis berisiko salah atribusi. Kolom
//   perawi dibiarkan NULL; rantai tetap utuh di matan_id.
// - Kategori = judul bab (section) dari metadata sumber, dalam
//   bahasa Inggris apa adanya (mis. "Revelation"), bukan
//   terjemahan buatan.
//
// Pakai:
//   bun run import:hadits                 # Bukhari + Muslim, lewati kitab yang sudah ada
//   bun run import:hadits -- --kitab=bukhari
//   bun run import:hadits -- --reset      # hapus dulu kedua kitab ini, impor ulang
//   SIJI_DB=/tmp/uji.db bun run import:hadits
import { db } from "../src/db";

const CDN = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions";

const KITAB: Record<string, { nama: string; tag: string }> = {
  bukhari: { nama: "Sahih al-Bukhari", tag: "bukhari" },
  muslim: { nama: "Sahih Muslim", tag: "muslim" },
};

const SUMBER =
  "fawazahmed0/hadith-api (data sunnah.com); status sahih berdasarkan kitab Sahih, grade per hadits di sumber kosong; terjemahan Indonesia penerjemah tidak tercantum";

async function ambilEdisi(nama: string): Promise<any> {
  const r = await fetch(`${CDN}/${nama}.json`);
  if (!r.ok) throw new Error(`Gagal mengunduh ${nama}: HTTP ${r.status}`);
  return r.json();
}

async function imporKitab(kunci: string, reset: boolean): Promise<number> {
  const { nama, tag } = KITAB[kunci];
  const sudah = (db.query("SELECT COUNT(*) AS n FROM hadits WHERE kitab = ?").get(nama) as { n: number }).n;
  if (reset && sudah > 0) {
    db.query("DELETE FROM hadits WHERE kitab = ?").run(nama);
  } else if (sudah > 0) {
    console.log(`${nama}: sudah ada ${sudah} hadits, dilewati (pakai --reset untuk impor ulang).`);
    return sudah;
  }

  console.log(`${nama}: mengunduh edisi ara + ind…`);
  const [ara, ind] = await Promise.all([
    ambilEdisi(`ara-${kunci}`),
    ambilEdisi(`ind-${kunci}`),
  ]);
  const petaAra = new Map<number, any>();
  for (const h of ara.hadiths ?? []) petaAra.set(h.hadithnumber, h);

  // Perhatian: edisi penuh memakai metadata.sections (jamak),
  // sedangkan endpoint per-hadits memakai metadata.section
  // (tunggal). Pakai keduanya, kalau tidak kategori jadi NULL
  // untuk semua hadits (bug yang sempat lolos di uji pertama).
  const section: Record<string, string> =
    ara.metadata?.sections ?? ara.metadata?.section ??
    ind.metadata?.sections ?? ind.metadata?.section ?? {};
  const baris: any[] = [];
  const tanpaAra: number[] = [];
  for (const h of ind.hadiths ?? []) {
    const a = petaAra.get(h.hadithnumber);
    if (!a) { tanpaAra.push(h.hadithnumber); continue; }
    const teksInd = String(h.text ?? "").trim();
    const teksAra = String(a.text ?? "").trim();
    if (!teksInd) continue;
    baris.push({
      kitab: nama,
      no_hadits: String(h.hadithnumber),
      perawi: null,
      matan_arab: teksAra || null,
      matan_id: teksInd,
      status_sanad: "sahih",
      kategori: section[String(h.reference?.book ?? "")] || null,
      sumber: SUMBER,
      tag: tag,
    });
  }
  if (tanpaAra.length > 0) {
    throw new Error(`${nama}: ${tanpaAra.length} hadits Indonesia tanpa padanan Arab (contoh: ${tanpaAra.slice(0, 5).join(", ")}), impor dibatalkan agar tidak ada matan setengah.`);
  }
  if (baris.length === 0) throw new Error(`${nama}: tidak ada baris yang bisa diimpor.`);

  const insert = db.query(
    `INSERT INTO hadits (kitab, no_hadits, perawi, matan_arab, matan_id, status_sanad, kategori, sumber, tag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const isiSemua = db.transaction((list: any[]) => {
    for (const b of list) {
      insert.run(b.kitab, b.no_hadits, b.perawi, b.matan_arab, b.matan_id, b.status_sanad, b.kategori, b.sumber, b.tag);
    }
  });
  isiSemua(baris);
  console.log(`${nama}: ${baris.length} hadits diimpor (ind ${ind.hadiths?.length ?? "?"}, ara ${ara.hadiths?.length ?? "?"}).`);
  return baris.length;
}

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const kitabArg = args.find((a) => a.startsWith("--kitab="))?.split("=")[1];
const daftar = kitabArg ? [kitabArg] : ["bukhari", "muslim"];
for (const k of daftar) {
  if (!KITAB[k]) throw new Error(`Kitab tidak dikenal: ${k} (pilih bukhari atau muslim)`);
}

for (const k of daftar) await imporKitab(k, reset);

console.log("Verifikasi:");
for (const [kunci, { nama }] of Object.entries(KITAB)) {
  const n = (db.query("SELECT COUNT(*) AS n FROM hadits WHERE kitab = ?").get(nama) as { n: number }).n;
  console.log(`  ${nama}: ${n}`);
}
console.log(`  total hadits: ${(db.query("SELECT COUNT(*) AS n FROM hadits").get() as { n: number }).n}`);
