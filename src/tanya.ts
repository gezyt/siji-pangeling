// Tanya Jawab AI Siji Pangeling.
//
// Alur: pertanyaan -> kata kunci -> retrieval FTS5 di keempat modul
// (ayat, hadits, siroh, artikel) -> prompt sistem + sumber terpilih ->
// 9router (endpoint OpenAI-compatible) -> jawaban + daftar sumber.
// AI hanya merangkai jawaban dari sumber yang diberikan; bila tidak ada
// sumber yang relevan, endpoint menjawab "tidak ditemukan" TANPA memanggil
// AI sama sekali (hemat biaya, mencegah karangan).
//
// Konfigurasi lewat environment (tidak pernah masuk repo):
//   SIJI_9ROUTER_URL   (default http://127.0.0.1:20128/v1)
//   SIJI_9ROUTER_KEY   (wajib; key khusus Siji dari dashboard 9router)
//   SIJI_TANYA_MODEL   (default deepseek/deepseek-chat; samakan dengan
//                        nama model di /v1/models 9router)

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cariAyat,
  cariHadits,
  cariSiroh,
  cariArtikel,
  getTanyaCache,
  setTanyaCache,
  listJawabanBaku,
} from "./db";

export type ModulSumber = "ayat" | "hadits" | "siroh" | "artikel";

export type Sumber = {
  modul: ModulSumber;
  /** Label kutipan persis seperti yang harus dipakai jawaban, mis. "QS. Al-Baqarah 2:153". */
  rujukan: string;
  /** Potongan isi sumber untuk prompt dan kartu sumber di frontend. */
  teks: string;
  /** Petunjuk buka-di-modul (dipakai kartu sumber di frontend). */
  surah?: number;
  ayat?: number;
  kitab?: string;
  no?: string;
  judul?: string;
};

export type HasilTanya = {
  jawaban: string;
  sumber: Sumber[];
  dariCache: boolean;
  /** Benar bila jawaban berasal dari jawaban baku kurasi (bukan AI). */
  dariBaku?: boolean;
};

export const MAKS_PANJANG_PERTANYAAN = 500;
export const MAKS_TOKEN_JAWABAN = 600;
export const BATAS_PER_MENIT = 5;
export const BATAS_PER_HARI = 20;

export const TIDAK_DITEMUKAN =
  "Tidak ditemukan jawaban di koleksi Siji Pangeling untuk pertanyaan ini. Coba kata kunci lain, atau buka langsung tab Al-Qur'an, Hadits, Siroh, dan Artikel.";

// Jawaban bila pertanyaan lanjutan kehabisan sumber baru: semua sumber
// yang relevan sudah disampaikan di ronde sebelumnya. Diawali "Tidak
// ditemukan" juga, supaya aturan jawabanMenolak() di server dan di
// frontend mengenalinya sebagai penolakan (kartu sumber disembunyikan).
export const TIDAK_DITEMUKAN_LAGI =
  "Tidak ditemukan lagi sumber lain di koleksi Siji Pangeling untuk pertanyaan ini yang belum disampaikan. Coba topik lain, atau buka langsung tab Al-Qur'an, Hadits, Siroh, dan Artikel.";

/** Opsi pertanyaan lanjutan (Fase 4 sederhana, 2026-11-12).
 *  `sudahDipakai` = rujukan sumber yang sudah disampaikan di ronde
 *  sebelumnya (persis seperti di `sumber[].rujukan`, mis.
 *  "QS. Al-Bayyinah 98:5"); sumber itu dikecualikan dari retrieval.
 *  `konteks` = pertanyaan asal rantai percakapan; kata kuncinya
 *  dipakai bila pertanyaan lanjutan itu sendiri tidak punya kata isi
 *  ("apa lagi?", "selain yang sudah disampaikan, apa lagi?"). */
export type OpsiLanjutan = {
  sudahDipakai?: string[];
  konteks?: string;
};

export function normalisasiRujukan(rujukan: string): string {
  return String(rujukan ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Instruksi cadangan bila prompts/sistem-tanya.md hilang atau kosong.
 * Isinya SAMA dengan file itu — ubah instruksinya di file, bukan di sini,
 * supaya yang dibaca Pak Gun dan yang dipakai server selalu satu sumber.
 */
const PROMPT_DEFAULT = `Kamu adalah penjawab di situs Siji Pangeling. Jawablah HANYA berdasarkan sumber-sumber di bawah ini. Setiap pernyataan faktual harus disertai kutipan sumbernya dengan format persis seperti yang diberikan (mis. QS. Al-Baqarah 2:153, HR. Bukhari No. 1). Jangan menambah nomor ayat, nomor hadits, atau isi yang tidak ada di sumber. Bila pertanyaan adalah lanjutan, jawablah hanya dari sumber baru yang diberikan dan jangan mengulangi sumber yang sudah disampaikan sebelumnya. Bila sumber tidak cukup untuk menjawab, jawablah PERSIS dengan kalimat berikut, tanpa mengubah, menambah, atau memparafrasa satu kata pun: "Tidak ditemukan jawaban di koleksi Siji Pangeling untuk pertanyaan ini." Jangan mengeluarkan fatwa atau putusan hukum; untuk soal hukum, arahkan untuk bertanya ke ustadz atau ahli. Jawablah dalam Bahasa Indonesia, nada tenang dan sederhana, maksimal 250 kata.`;

/**
 * Muat system prompt dari prompts/sistem-tanya.md (dibaca saat server
 * start). Komentar HTML di file itu dibuang. Bila file tidak ada, kosong,
 * atau gagal dibaca, pakai PROMPT_DEFAULT dan catat peringatan.
 */
export function muatPromptSistem(): string {
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "sistem-tanya.md");
  try {
    const isi = readFileSync(path, "utf-8")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
    if (isi) return isi;
    console.warn("tanya: prompts/sistem-tanya.md kosong, memakai instruksi cadangan");
  } catch {
    console.warn("tanya: prompts/sistem-tanya.md tidak terbaca, memakai instruksi cadangan");
  }
  return PROMPT_DEFAULT;
}

export const PROMPT_SISTEM = muatPromptSistem();

export function konfigurasiTanya() {
  return {
    url: (process.env.SIJI_9ROUTER_URL ?? "http://127.0.0.1:20128/v1").replace(/\/$/, ""),
    key: process.env.SIJI_9ROUTER_KEY ?? "",
    model: process.env.SIJI_TANYA_MODEL ?? "deepseek/deepseek-chat",
  };
}

// Kata tanya/umum yang dibuang saat mengambil kata kunci. Huruf Arab
// dipertahankan (regex memakai \p{L}) supaya pertanyaan berhuruf Arab
// tetap bisa dicari. "Qur'an" dibuang juga: "Al-Qur'an" di pertanyaan
// ternormalisasi jadi "qur" dan malah menarik surah Quraisy — kata itu
// menyebut topiknya, bukan isi yang dicari.
const KATA_BUANG = new Set(
  "apa apakah bagaimana kenapa mengapa siapa kapan dimana di mana yang dan atau di ke dari dalam untuk dengan pada adalah itu ini saya pak bu tolong mohon jelaskan ceritakan tentang sebutkan berikan adakah bisakah bolehkah qur quran alquran katakan kata menurut juga kita mereka orang para kepada oleh bagi serta jika kalau ketika seperti antara atas sambil tanpa akan telah sudah jangan bukan hanya saja semua kemudian selain lagi lain lainnya lanjut tambah tambahan berikut ikut sebut tadi belum sampai anda tersebut".split(" ")
);

// Stemming sederhana Bahasa Indonesia: ringkas kata berimbuhan ke
// bentuk kanoniknya supaya "dicintai" dan "mencintai" dicari sebagai
// kata yang sama ("cinta"), dan "terbesar" sebagai "besar". FTS5 hanya
// cocok awalan kata ("cinta*" tidak cocok dengan token "mencintai"),
// jadi tanpa ini imbuhan membuat sumber kunci tidak terlihat — persis
// yang terjadi pada "Siapa yang paling dicintai Allah?" (QS. 3:31 tak
// ditemukan karena ayatnya memakai "mencintai").
//
// Stem di sini TIDAK harus akar kamus yang benar; cukup bentuk kanonik
// yang konsisten dan merupakan sub string dari kata aslinya. Alasannya:
// cariModul selalu punya fallback LIKE (%stem%) yang menemukan kata
// berimbuhan itu sendiri, dan pencocokan jawaban baku memakai cocok
// longgar. Satu awalan + satu akhiran, dengan sisa minimal supaya kata
// pendek yang memang akar ("iman", "kursi", "nabi", "tuhan", "jalan")
// tidak rusak. Asimilasi nasal (menolong -> tolong, mengasihi ->
// kasih) sengaja TIDAK ditangani: stem "olong"/"asihi" tetap sub string
// dari kata aslinya, jadi LIKE tetap menemukannya.
const AWALAN: [string, number][] = [
  ["meng", 3], ["meny", 3], ["men", 3], ["mem", 3], ["me", 3],
  ["peng", 3], ["peny", 3], ["pen", 3], ["pem", 3], ["per", 4], ["pe", 4],
  ["di", 3], ["ter", 3], ["ber", 3], ["ke", 4], ["se", 4],
];
const AKHIRAN: [string, number][] = [
  ["nya", 3], ["kan", 3], ["an", 4], ["i", 5],
  ["lah", 3], ["kah", 3], ["ku", 3], ["mu", 3],
];

export function stemKata(kata: string): string {
  let k = kata;
  for (const [aw, min] of AWALAN) {
    if (k.startsWith(aw) && k.length - aw.length >= min) {
      k = k.slice(aw.length);
      break;
    }
  }
  for (const [ak, min] of AKHIRAN) {
    // "-i" di akhir kata serapan ("korupsi", "polisi", "fungsi") adalah
    // bagian dari kata itu sendiri, bukan akhiran — jangan dipotong,
    // kalau tidak "korupsi" jadi "korups" dan kunci peta konsepnya
    // tidak cocok. Akhiran -i yang asli ("cintai", "sayangi") tidak
    // berakhiran "si".
    if (ak === "i" && k.endsWith("si")) continue;
    if (k.endsWith(ak) && k.length - ak.length >= min) {
      k = k.slice(0, -ak.length);
      break;
    }
  }
  return k;
}

export function kataKunci(pertanyaan: string): string[] {
  const kata = pertanyaan
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !KATA_BUANG.has(w))
    .map(stemKata)
    // Saring ulang: stemming bisa menghasilkan kata buang ("seorang"
    // -> "orang", "sesudah" -> "sudah") atau sisa yang terlalu pendek.
    .filter((w) => w.length > 2 && !KATA_BUANG.has(w));
  return [...new Set(kata)].slice(0, 8);
}

// Peta konsep: istilah yang tidak muncul harfiah di teks sumber.
// "Mustahik" tidak ada di terjemahan ayat mana pun — yang ada adalah
// daftarnya (fakir, miskin, amil, ...). "Makhluk" tidak ada di QS.
// 40:57 — yang ada "penciptaan" (dan Arsy sebagai makhluk yang disebut
// dalam hadits). Tanpa peta ini kedua pertanyaan itu tidak pernah
// menemukan sumbernya, betapa pun bagusnya peringkat. Kunci dan nilai
// ditulis sebagai kata wajar lalu di-stem (lihat stemKata) supaya
// cocok dengan kataKunci. Peta ini sengaja kecil: hanya untuk celah
// konsep yang sudah terbukti, bukan kamus sinonim umum.
const PETA_KONSEP: Record<string, string[]> = {
  mustahik: ["fakir", "miskin", "amil", "mualaf", "sahaya", "berhutang"],
  makhluk: ["penciptaan", "arsy"],
  // Korupsi: kata "korupsi" tidak muncul di satu pun teks sumber
  // (0 cocok), padahal unsur-unsurnya ada — suap dan makan harta
  // batil (2:188, 4:29), khianat atas harta (3:161), amanat (4:58),
  // dan hadits tanda munafik "bila dipercaya ia berkhianat"
  // (HR. Muslim No. 213). Tanpa peta ini pertanyaan tentang korupsi
  // hanya menemukan ayat-ayat "mencari" (dari "carikan" -> "cari").
  korupsi: ["mencuri", "suap", "khianat", "harta", "batil", "amanah", "amanat"],
  // "suap" tidak menemukan hadits laknat penyuap yang paling
  // terkenal (Abu Dawud No. 3580) karena matannya memakai kata
  // "sogokan" ("memberi uang sogokan"), bukan "suap". Hanya 1
  // hadits di koleksi yang memakai kata itu.
  suap: ["sogokan"],
};

export function perluasKataKunci(kunci: string[]): string[] {
  const hasil = [...kunci];
  for (const k of kunci) {
    for (const tambah of PETA_KONSEP[k] ?? []) {
      const stem = stemKata(tambah);
      if (!hasil.includes(stem)) hasil.push(stem);
    }
  }
  return hasil;
}

function potong(teks: string, maks = 600): string {
  const t = (teks ?? "").trim();
  return t.length > maks ? t.slice(0, maks) + "…" : t;
}

/**
 * Gabung hasil cari per kata kunci (OR, bukan AND): FTS5 menggabungkan
 * beberapa kata dengan AND, sehingga "sabar salat" tidak menemukan apa pun
 * bila satu katanya tidak ada. Di sini tiap kata kunci dicari sendiri,
 * lalu hasilnya digabung dan diurutkan berdasarkan jumlah kata kunci yang
 * cocok — yang paling relevan di atas.
 *
 * Bobot kelangkaan: kata yang muncul di mana-mana (mis. "allah", ada di
 * ribuan ayat) tidak boleh mengalahkan kata yang jarang (mis. "cinta").
 * Tiap kata kunci ditimbang 1 / jumlah hasil yang dikembalikannya:
 * ayat yang hanya cocok kata umum mendapat skor kecil, ayat yang cocok
 * kata langka mendapat skor besar. Tanpa ini, 5 ayat teratas untuk
 * "Allah itu cinta kepada siapa?" adalah ayat-ayat acak yang kebetulan
 * menyebut Allah.
 *
 * Urutan: JUMLAH kata kunci yang cocok didahulukan, baru skor
 * kelangkaan. Satu kata langka saja tidak boleh mengalahkan ayat yang
 * cocok dua kata kunci — tanpa ini, "amanah" (hanya 2 ayat) mengangkat
 * QS. 64:12 (tentang Rasul menyampaikan risalah, bukan soal korupsi)
 * ke peringkat 1 untuk "carikan hadits tentang korupsi", sementara
 * QS. 2:188 (cocok "harta" + "batil") terbenam di posisi 44.
 *
 * Batas uji 100 (bukan 20): kata "cinta" saja cocok 31 ayat — dengan
 * batas 20, ayat kunci seperti 3:31 terpotong dari daftar "cinta" dan
 * tidak pernah mendapat bobotnya, sehingga peringkat jatuh kembali
 * ke urutan bm25 kata "allah" (9:106, 64:11, 4:45).
 */
const BATAS_UJI_KELANGKAAN = 100;

function cariGabung<T extends { id: number }>(
  fn: (q: string, limit: number, offset: number) => T[],
  kunci: string[],
  limit: number
): T[] {
  const skor = new Map<number, { item: T; skor: number; n: number }>();
  for (const k of kunci) {
    const hasil = fn(k, BATAS_UJI_KELANGKAAN, 0);
    if (!hasil.length) continue;
    const bobot = 1 / hasil.length;
    for (const item of hasil) {
      const s = skor.get(item.id) ?? { item, skor: 0, n: 0 };
      s.skor += bobot;
      s.n++;
      skor.set(item.id, s);
    }
  }
  return [...skor.values()]
    .sort((a, b) => b.n - a.n || b.skor - a.skor)
    .slice(0, limit)
    .map((s) => s.item);
}

/**
 * Kata kunci efektif untuk pertanyaan lanjutan: gabungan kata kunci
 * pertanyaan saat ini dan pertanyaan asal (`konteks`). Bila
 * pertanyaan lanjutan tidak punya kata isi sama sekali ("apa lagi?"),
 * kata kunci konteks yang dipakai sepenuhnya — tanpa ini retrieval
 * untuk "apa lagi?" kosong dan selalu "tidak ditemukan".
 */
export function kataKunciEfektif(pertanyaan: string, konteks?: string): string[] {
  const kunci = kataKunci(pertanyaan);
  const konteksBersih = String(konteks ?? "").trim();
  if (!konteksBersih) return kunci;
  const kunciKonteks = kataKunci(konteksBersih);
  return [...new Set([...kunciKonteks, ...kunci])].slice(0, 8);
}

/**
 * Retrieval (FTS5 + LIKE): 5 ayat + 3 hadits + 2 siroh + 2 artikel
 * teratas. Kata kunci di-stem (lihat stemKata) lalu diperluas lewat
 * peta konsep (lihat PETA_KONSEP), supaya istilah seperti "mustahik"
 * dan "dicintai" menemukan sumbernya.
 *
 * Lanjutan (`opsi.sudahDipakai`): sumber yang rujukannya sudah
 * disampaikan dikecualikan. Pool yang diambil sengaja diperbesar
 * (12 per modul) sebelum disaring — bila hanya mengambil 5 lalu
 * menyaring, ronde kedua bisa kosong padahal sumber ke-6 masih ada.
 */
export function cariSumber(pertanyaan: string, opsi: OpsiLanjutan = {}): Sumber[] {
  const kunci = perluasKataKunci(kataKunciEfektif(pertanyaan, opsi.konteks));
  if (!kunci.length) return [];
  const kecuali = new Set((opsi.sudahDipakai ?? []).map(normalisasiRujukan));
  // Pool diperbesar seiring banyaknya sumber yang dikecualikan
  // (12 + jumlah yang sudah dipakai): bila pool tetap 12, ronde ke-3
  // hanya mendapat 2 sumber baru padahal ayat yang cocok masih ada
  // di luar 12 besar — teruji E2E 2026-11-12 sebelum perbaikan ini.
  const pool = kecuali.size ? 12 + kecuali.size : 0;
  const ambil = <T extends { id: number }>(
    fn: (q: string, limit: number, offset: number) => T[],
    limit: number,
    buat: (x: any) => Sumber
  ): Sumber[] =>
    cariGabung(fn, kunci, pool || limit)
      .map(buat)
      .filter((s) => !kecuali.has(normalisasiRujukan(s.rujukan)))
      .slice(0, limit);
  const sumber: Sumber[] = [];
  sumber.push(
    ...ambil(cariAyat, 5, (a: any) => ({
      modul: "ayat" as const,
      rujukan: `QS. ${a.surah_nama} ${a.verse_key}`,
      teks: potong(a.terjemahan),
      surah: a.surah_no,
      ayat: a.ayat_no,
    }))
  );
  sumber.push(
    ...ambil(cariHadits, 3, (h: any) => ({
      modul: "hadits" as const,
      rujukan: `HR. ${h.kitab}${h.no_hadits ? " No. " + h.no_hadits : ""}`,
      teks: potong(h.matan_id),
      kitab: h.kitab,
      no: h.no_hadits,
    }))
  );
  sumber.push(
    ...ambil(cariSiroh, 2, (s: any) => ({
      modul: "siroh" as const,
      rujukan: s.judul,
      teks: potong(s.peristiwa),
      judul: s.judul,
    }))
  );
  sumber.push(
    ...ambil(cariArtikel, 2, (a: any) => ({
      modul: "artikel" as const,
      rujukan: a.judul,
      teks: potong(a.isi),
      judul: a.judul,
    }))
  );
  return sumber;
}

function promptPengguna(pertanyaan: string, sumber: Sumber[], opsi: OpsiLanjutan = {}): string {
  const daftar = sumber
    .map((s, i) => `[${i + 1}] ${s.rujukan}\n${s.teks}`)
    .join("\n\n");
  // Lanjutan: tegaskan ke AI bahwa daftar di bawah ini HANYA sumber
  // baru, dan sebutkan yang sudah dipakai supaya tidak diulang dari
  // ingatan model (sumber lama tidak ada di daftar, tapi model bisa
  // saja mengulang kutipannya dari ronde sebelumnya).
  const lanjutan =
    (opsi.sudahDipakai ?? []).length > 0
      ? `Ini pertanyaan lanjutan dari: "${String(opsi.konteks ?? "").trim()}". Sumber-sumber berikut SUDAH disampaikan sebelumnya dan TIDAK ada di daftar di bawah — jangan mengulang isinya: ${(opsi.sudahDipakai ?? []).join("; ")}. Jawablah hanya dari sumber BARU di bawah ini, sebagai tambahan dari jawaban sebelumnya.\n\n`
      : "";
  return `${lanjutan}Pertanyaan: ${pertanyaan}\n\nSumber-sumber:\n${daftar}`;
}

async function panggilAI(pertanyaan: string, sumber: Sumber[], opsi: OpsiLanjutan = {}): Promise<string> {
  const cfg = konfigurasiTanya();
  if (!cfg.key) throw new Error("SIJI_9ROUTER_KEY belum disetel di server");
  const r = await fetch(`${cfg.url}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.key}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      max_tokens: MAKS_TOKEN_JAWABAN,
      messages: [
        { role: "system", content: PROMPT_SISTEM },
        { role: "user", content: promptPengguna(pertanyaan, sumber, opsi) },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`9router HTTP ${r.status}`);
  const j: any = await r.json();
  const isi = String(j?.choices?.[0]?.message?.content ?? "").trim();
  if (!isi) throw new Error("jawaban AI kosong");
  return isi;
}

/** Hash pertanyaan yang dinormalisasi (kunci cache). Lanjutan memakai
 *  kunci yang berbeda: pertanyaan yang sama dengan riwayat sumber yang
 *  berbeda harus dicari ulang, bukan mengambil jawaban ronde
 *  sebelumnya dari cache. Tanpa opsi, hash-nya sama seperti dulu. */
export function hashPertanyaan(pertanyaan: string, opsi: OpsiLanjutan = {}): string {
  const dasar = pertanyaan.trim().toLowerCase();
  const sudah = [...new Set((opsi.sudahDipakai ?? []).map(normalisasiRujukan))].sort();
  const konteks = String(opsi.konteks ?? "").trim().toLowerCase();
  if (!sudah.length && !konteks) return createHash("sha256").update(dasar).digest("hex");
  return createHash("sha256")
    .update(dasar + "\nkonteks:" + konteks + "\nsudah:" + sudah.join("|"))
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Jawaban baku (memory kurasi) — dicek SEBELUM cache dan SEBELUM AI.
// Semua kata pemicu harus ada di pertanyaan (dicocokkan longgar: kata
// pemicu "cinta" cocok dengan kata pertanyaan "dicintai"/"mencintai").
// Bila beberapa entri cocok, yang pemicunya paling banyak (paling
// spesifik) yang menang. Jawaban baku tidak ditulis ke tanya_cache:
// ia sudah tersimpan di tabelnya sendiri.
// ---------------------------------------------------------------------------
function kataDariPemicu(pemicu: string): string[] {
  return pemicu
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s,]/gu, " ")
    .split(/[\s,]+/)
    .filter((w) => w.length > 2)
    // Di-stem seperti kataKunci supaya pemicu "dicintai" cocok dengan
    // pertanyaan yang memakai "dicintai", "mencintai", atau "cinta".
    .map(stemKata);
}

export function cariJawabanBaku(
  pertanyaan: string
): { jawaban: string; sumber: Sumber[] } | null {
  const kunci = kataKunci(pertanyaan);
  if (!kunci.length) return null;
  let terbaik: { baris: any; skor: number } | null = null;
  for (const baris of listJawabanBaku()) {
    const pemicu = kataDariPemicu(String(baris.pemicu ?? ""));
    if (!pemicu.length) continue;
    const cocok = pemicu.filter((p) => kunci.some((k) => k.includes(p) || p.includes(k)));
    if (cocok.length !== pemicu.length) continue;
    if (!terbaik || pemicu.length > terbaik.skor) terbaik = { baris, skor: pemicu.length };
  }
  if (!terbaik) return null;
  let sumber: Sumber[] = [];
  try {
    sumber = JSON.parse(terbaik.baris.sumber ?? "[]");
  } catch {
    sumber = [];
  }
  return { jawaban: String(terbaik.baris.jawaban), sumber };
}

export async function jawabPertanyaan(pertanyaanMentah: string, opsi: OpsiLanjutan = {}): Promise<HasilTanya> {
  const pertanyaan = pertanyaanMentah.trim();
  if (!pertanyaan) throw new Error("pertanyaan kosong");
  if (pertanyaan.length > MAKS_PANJANG_PERTANYAAN)
    throw new Error(`pertanyaan maks ${MAKS_PANJANG_PERTANYAAN} karakter`);
  const lanjutan = (opsi.sudahDipakai ?? []).length > 0;
  // Jawaban baku didahulukan atas cache: bila Pak Gun baru menambah
  // jawaban baku untuk pertanyaan yang pernah dijawab AI, jawaban baku
  // yang keluar — bukan jawaban AI lama dari cache.
  // Pengecualian lanjutan: jawaban baku adalah jawaban ronde pertama;
  // bila pertanyaan dikirim sebagai lanjutan, baku dilewati supaya
  // tidak terulang — ronde kedua harus mencari sumber baru lewat AI.
  const baku = lanjutan ? null : cariJawabanBaku(pertanyaan);
  if (baku) return { jawaban: baku.jawaban, sumber: baku.sumber, dariCache: false, dariBaku: true };
  const hash = hashPertanyaan(pertanyaan, opsi);
  const cache = getTanyaCache(hash);
  if (cache) {
    try {
      const parsed = JSON.parse(cache) as { jawaban: string; sumber: Sumber[] };
      // Aturan yang sama seperti jawaban segar: bila jawabannya
      // "tidak ditemukan", sumber tidak ikut ditampilkan — termasuk
      // untuk jawaban lama yang tersimpan sebelum aturan ini ada.
      const sumber = jawabanMenolak(parsed.jawaban) ? [] : parsed.sumber;
      return { jawaban: parsed.jawaban, sumber, dariCache: true };
    } catch {
      // Cache rusak: lanjut seperti tidak ada cache.
    }
  }
  const sumber = cariSumber(pertanyaan, opsi);
  if (!sumber.length) {
    // Lanjutan yang kehabisan sumber baru mendapat pesan sendiri
    // ("tidak ditemukan LAGI ..."), bukan pesan umum — supaya pengguna
    // tahu rantainya sudah habis, bukan topiknya yang tidak ada.
    const jawaban = lanjutan ? TIDAK_DITEMUKAN_LAGI : TIDAK_DITEMUKAN;
    const hasil: HasilTanya = { jawaban, sumber: [], dariCache: false };
    setTanyaCache(hash, pertanyaan, JSON.stringify({ jawaban: hasil.jawaban, sumber: hasil.sumber }));
    return hasil;
  }
  const jawaban = await panggilAI(pertanyaan, sumber, opsi);
  // Bila AI sendiri menyatakan tidak menemukan jawaban, sumber yang
  // sempat terambil TIDAK ikut dikembalikan: menampilkannya di bawah
  // jawaban "tidak ditemukan" membuat ayat-ayat yang lemah kecocokannya
  // tampak seperti jawaban — persis yang terjadi pada pertanyaan
  // "Allah itu cinta kepada siapa?" (sumbernya At-Tawbah 9:106 dkk.,
  // padahal jawabannya "tidak ditemukan").
  const hasil: HasilTanya = jawabanMenolak(jawaban)
    ? { jawaban, sumber: [], dariCache: false }
    : { jawaban, sumber, dariCache: false };
  setTanyaCache(hash, pertanyaan, JSON.stringify({ jawaban: hasil.jawaban, sumber: hasil.sumber }));
  return hasil;
}

/**
 * Benar bila jawaban menyatakan tidak menemukan jawaban di koleksi.
 *
 * Dulu: cocok kalimat baku persis ("Tidak ditemukan jawaban di
 * koleksi ..."). Itu rapuh: AI boleh memparafrasa penolakannya
 * ("Tidak ditemukan hadits tentang korupsi di koleksi ..."), dan
 * sumber tak relevan pun ikut tampil + tersimpan di cache — persis
 * yang terjadi 2026-11-10. Sekarang: cukup jawabannya DIAWALI
 * "tidak ditemukan" (toleran huruf besar/kecil, spasi, dan tanda
 * kutip di depan). Jawaban wajar tidak pernah diawali kalimat itu;
 * kalimat "tidak ditemukan" di TENGAH jawaban (mis. "..., tetapi
 * hadits itu tidak ditemukan di sini") tetap dianggap jawaban.
 * Frontend (public/index.html) memakai aturan yang sama.
 */
export function jawabanMenolak(jawaban: string): boolean {
  return /^\s*["'«“”]?\s*tidak ditemukan/i.test(jawaban);
}

// ---------------------------------------------------------------------------
// Rate limit in-memory (satu proses Bun). Cukup untuk v1: melindungi dari
// tanya bertubi-tubi tanpa menambah tabel. Restart service mengosongkannya.
// ---------------------------------------------------------------------------
const jejak = new Map<string, number[]>();

export function bolehTanya(ip: string): { boleh: boolean; alasan?: string } {
  const kini = Date.now();
  const sehari = 24 * 60 * 60 * 1000;
  const daftar = (jejak.get(ip) ?? []).filter((t) => kini - t < sehari);
  if (daftar.filter((t) => kini - t < 60 * 1000).length >= BATAS_PER_MENIT) {
    return { boleh: false, alasan: "Terlalu banyak pertanyaan dalam satu menit. Tunggu sebentar lalu coba lagi." };
  }
  if (daftar.length >= BATAS_PER_HARI) {
    return { boleh: false, alasan: "Batas 20 pertanyaan per hari untuk layanan ini sudah tercapai. Coba lagi besok." };
  }
  daftar.push(kini);
  jejak.set(ip, daftar);
  if (jejak.size > 10000) {
    for (const [k, v] of jejak) if (!v.some((t) => kini - t < sehari)) jejak.delete(k);
  }
  return { boleh: true };
}

/** IP klien di balik Caddy/Cloudflare: Cloudflare dulu (tak bisa dipalsukan
 *  lewat Cloudflare), lalu X-Forwarded-For pertama, lalu IP koneksi TCP. */
export function ipKlien(req: Request, server?: { requestIP?: (req: Request) => { address: string } | null }): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (xff) return xff;
  try {
    return server?.requestIP?.(req)?.address ?? "tak-dikenal";
  } catch {
    return "tak-dikenal";
  }
}
