// Impor Fiqih pilot: Kifayat al-Akhyar (Syafi'i), dari Fiqh Corpus
// (arabic-digital-humanities/fiqh, publik di GitHub).
//
// Keputusan sumber (riset 2026-11-12, dipilih Pak Gun):
// - Fiqh Corpus: 55 kitab Arab format OpenITI, 11 per mazhab; pilot ini
//   hanya Kifayat al-Akhyar (syarah Matn Abi Shuja, Imam Taqiyyuddin
//   al-Hisni, w. 829 H) — 44 kitab Sunni bila 11 Ja'fari disaring.
//   Berkas diambil dari raw.githubusercontent (terverifikasi 2026-11-12:
//   HTTP 200, 1.848.668 byte, identik dengan clone).
// - Fiqh Corpus TIDAK punya versi Indonesia — Arab saja. Terjemah
//   Indonesia Kifayatul Akhyar ada di luar korpus (lilmuslimin.com,
//   Kitabpedia, cetakan Bina Ilmu 1997, Pustaka Azzam 2016) — tersebar
//   dan yang modern berhak cipta, jadi TIDAK dimasukkan ke DB.
//   Modul ini menampilkan teks Arab; tautan baca terjemah ke situs
//   luar menjadi urusan frontend, bukan impor.
//
// Struktur berkas (terverifikasi langsung dari isi, 2026-11-12):
// - Baris 1 `######OpenITI#`, lalu blok #META# s.d. `#META#Header#End#`
//   (baris 44); isi sesudahnya, 16.112 baris total.
// - `### |  |1 كتاب X` = kitab (17 kitab); `### || |2 باب Y` = bab
//   (132 bab); `|2 ...` tanpa ### = pasal/fasal di dalam bab (8 buah).
// - Token sebaris yang DIBUANG (markup, bukan isi): `PageV01P001`
//   (575 baris), `Milestone300`, `@QB@`/`@QE@` (penanda kutipan Qur'an,
//   385 baris — teks kutipannya tetap disimpan).
// - Baris teks terpotong di tengah kalimat (wrap ~70 karakter);
//   disimpan dengan spasi sebagai pemisah, supaya frasa yang
//   melintasi baris tetap bisa dicari.
//
// Aturan impor yang jujur (jangan dilunakkan di laporan):
// - Diimpor VERBATIM (apa adanya dari sumber): teks Arab berikut
//   kekhasan ejaan sumbernya. Jangan diam-diam membetulkan isi kitab.
// - Satu baris DB = satu bagian (pendahuluan kitab / bab / pasal).
//   `bab` untuk pendahuluan kitab = judul kitab itu sendiri.
// - Idempotent: bila kitab ini sudah ada di tabel fiqh, dilewati
//   (pakai --reset untuk impor ulang). --reset hanya menghapus baris
//   kitab ini, bukan seluruh tabel fiqh.
// - Validasi sebelum satu baris pun ditulis: penanda akhir META harus
//   ada; header pertama harus kitab; tiap bagian harus punya teks;
//   total bagian >= 100 dan kitab >= 10 (penjaga bila format sumber
//   berubah diam-diam).
//
// Pakai:
//   bun run import:fiqih                 # unduh dari GitHub, impor
//   bun run import:fiqih -- --reset      # hapus Kifayat lama, impor ulang
//   bun run import:fiqih -- --file=/tmp/kifayat.txt   # dari berkas lokal
//   SIJI_DB=/tmp/uji.db bun run import:fiqih
import { db } from "../src/db";

const SUMBER_URL =
  "https://raw.githubusercontent.com/arabic-digital-humanities/fiqh/master/txt/0829TaqiDinDimashqiHisni.KifayatAkhyar.txt";

export const KITAB = "Kifayat al-Akhyar";
export const MAZHAB = "Syafi'i";
export const SUMBER =
  "Fiqh Corpus (arabic-digital-humanities/fiqh) · OpenITI · teks Arab dari al-Maktaba al-Shamila";

export type BarisFiqih = {
  kitab: string;
  mazhab: string;
  bab: string;
  pasal: string | null;
  teks: string;
  urut: number;
  sumber: string;
};

export type StatistikFiqih = { bagian: number; kitab: number; bab: number; pasal: number };

function bersihTeks(baris: string): string {
  return baris
    .replace(/PageV\d+P\d+/g, "")
    .replace(/Milestone\d+/g, "")
    .replace(/@QB@/g, "")
    .replace(/@QE@/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function bersihJudul(baris: string): string {
  return bersihTeks(baris);
}

/** Parse isi berkas OpenITI Kifayat al-Akhyar menjadi baris-baris fiqh.
 *  Fungsi murni (bisa diuji tanpa jaringan/DB). Gagal -> throw dengan
 *  pesan yang menyebut barisnya. */
export function bangunBarisFiqih(teksBerkas: string): { baris: BarisFiqih[]; statistik: StatistikFiqih } {
  const akhirMeta = teksBerkas.indexOf("#META#Header#End#");
  if (akhirMeta < 0) {
    throw new Error("Fiqih: penanda akhir META (#META#Header#End#) tidak ditemukan, impor dibatalkan.");
  }
  const isi = teksBerkas.slice(akhirMeta + "#META#Header#End#".length);
  const semua = isi.split("\n");

  const baris: BarisFiqih[] = [];
  let kitab = "";
  let bab = "";
  let pasal: string | null = null;
  let teks: string[] = [];
  let urut = 0;
  let nKitab = 0;
  let nBab = 0;
  let nPasal = 0;
  let sebelumHeader: string[] = [];

  const siram = () => {
    const t = teks.join(" ").replace(/\s+/g, " ").trim();
    if (!t) return; // header tanpa isi (mis. pendahuluan kitab yang kosong) dilewati
    urut += 1;
    baris.push({ kitab: KITAB, mazhab: MAZHAB, bab, pasal, teks: t, urut, sumber: SUMBER });
    teks = [];
  };

  for (let i = 0; i < semua.length; i++) {
    const mentah = semua[i] ?? "";
    const s = mentah.trim();
    if (!s || s === "######OpenITI#") continue;
    if (s.startsWith("###")) {
      const sisa = s.replace(/^###\s*/, "");
      const m = sisa.match(/^\|+\s*\|(\d)\s+(.+)$/);
      if (!m) {
        throw new Error(`Fiqih baris ${i + 1}: penanda ### tak dikenal: ${s.slice(0, 80)}`);
      }
      const tingkat = Number(m[1]);
      const judul = bersihJudul(m[2] ?? "");
      if (!judul) throw new Error(`Fiqih baris ${i + 1}: judul header kosong.`);
      if (kitab === "" && tingkat !== 1) {
        throw new Error(`Fiqih baris ${i + 1}: header pertama bukan kitab (tingkat ${tingkat}).`);
      }
      if (tingkat === 1) {
        siram();
        kitab = judul;
        bab = judul;
        pasal = null;
        nKitab += 1;
      } else if (tingkat === 2) {
        siram();
        bab = judul;
        pasal = null;
        nBab += 1;
      } else {
        siram();
        pasal = judul;
        nPasal += 1;
      }
      continue;
    }
    if (s.startsWith("#")) {
      throw new Error(`Fiqih baris ${i + 1}: baris penanda tak dikenal: ${s.slice(0, 60)}`);
    }
    const pasalLepas = s.match(/^\|(\d)\s+(.+)$/);
    if (pasalLepas) {
      if (!kitab) throw new Error(`Fiqih baris ${i + 1}: pasal sebelum kitab pertama.`);
      siram();
      pasal = bersihJudul(pasalLepas[2] ?? "");
      nPasal += 1;
      continue;
    }
    if (!kitab) {
      sebelumHeader.push(s);
      if (sebelumHeader.length > 3) {
        throw new Error(
          `Fiqih baris ${i + 1}: ${sebelumHeader.length} baris isi sebelum kitab pertama — struktur sumber berubah?`,
        );
      }
      continue;
    }
    const t = bersihTeks(s);
    if (t) teks.push(t);
  }
  siram();

  if (baris.length < 100) {
    throw new Error(`Fiqih: hanya ${baris.length} bagian ter-parse (< 100) — struktur sumber berubah?`);
  }
  if (nKitab < 10) {
    throw new Error(`Fiqih: hanya ${nKitab} kitab ter-parse (< 10) — struktur sumber berubah?`);
  }
  for (const b of baris) {
    if (!b.teks) throw new Error(`Fiqih urut ${b.urut} (${b.bab}): teks kosong.`);
  }
  return { baris, statistik: { bagian: baris.length, kitab: nKitab, bab: nBab, pasal: nPasal } };
}

async function ambilTeks(args: string[]): Promise<string> {
  const fileArg = args.find((a) => a.startsWith("--file="))?.split("=")[1];
  if (fileArg) {
    const f = Bun.file(fileArg);
    if (!(await f.exists())) throw new Error(`Fiqih: berkas tidak ada: ${fileArg}`);
    return await f.text();
  }
  const url = process.env.SIJI_FIQIH_URL || SUMBER_URL;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fiqih: gagal mengunduh kitab: HTTP ${r.status} (${url})`);
  return await r.text();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");

  const sudah = (
    db.query("SELECT COUNT(*) AS n FROM fiqh WHERE kitab = ?").get(KITAB) as { n: number }
  ).n;
  if (reset && sudah > 0) {
    db.query("DELETE FROM fiqh WHERE kitab = ?").run(KITAB);
    console.log(`Fiqih: ${sudah} baris lama ${KITAB} dihapus.`);
  } else if (sudah > 0) {
    console.log(`Fiqih: ${KITAB} sudah ada (${sudah} baris), dilewati (pakai --reset untuk impor ulang).`);
    return;
  }

  console.log(`Fiqih: mengunduh ${KITAB} dari Fiqh Corpus…`);
  const teksBerkas = await ambilTeks(args);
  console.log(`  berkas: ${(teksBerkas.length / 1024 / 1024).toFixed(2)} MB`);
  const { baris, statistik } = bangunBarisFiqih(teksBerkas);
  console.log(
    `  ter-parse: ${statistik.bagian} bagian (${statistik.kitab} kitab, ${statistik.bab} bab, ${statistik.pasal} pasal)`,
  );

  const insert = db.query(
    "INSERT INTO fiqh (kitab, mazhab, bab, pasal, teks, urut, sumber) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const isiSemua = db.transaction((list: BarisFiqih[]) => {
    for (const b of list) insert.run(b.kitab, b.mazhab, b.bab, b.pasal, b.teks, b.urut, b.sumber);
  });
  isiSemua(baris);

  console.log("Verifikasi:");
  console.log(
    `  total fiqh: ${(db.query("SELECT COUNT(*) AS n FROM fiqh").get() as { n: number }).n} baris`,
  );
  console.log(
    `  kitab: ${(db.query("SELECT COUNT(DISTINCT bab) AS n FROM fiqh WHERE bab LIKE 'كتاب%'").get() as { n: number }).n} judul diawali 'كتاب'`,
  );
  const pertama = db.query("SELECT bab, teks FROM fiqh WHERE kitab = ? ORDER BY urut ASC LIMIT 1").get(KITAB) as {
    bab: string;
    teks: string;
  };
  console.log(`  bagian pertama: ${pertama.bab} — “${pertama.teks.slice(0, 80)}…”`);
  const shalat = (
    db.query("SELECT COUNT(*) AS n FROM fiqh WHERE kitab = ? AND bab LIKE '%الصلاة%'").get(KITAB) as { n: number }
  ).n;
  console.log(`  bagian dengan 'الصلاة' di judul bab: ${shalat}`);
}

// Alur CLI hanya jalan bila file dieksekusi langsung, BUKAN saat
// diimpor (mis. oleh bun test) — tanpa penjaga ini, mengimpor
// bangunBarisFiqih dari tes akan ikut menjalankan impor sungguhan.
if (import.meta.main) await main();
