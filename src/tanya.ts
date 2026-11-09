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
import {
  cariAyat,
  cariHadits,
  cariSiroh,
  cariArtikel,
  getTanyaCache,
  setTanyaCache,
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
};

export const MAKS_PANJANG_PERTANYAAN = 500;
export const MAKS_TOKEN_JAWABAN = 600;
export const BATAS_PER_MENIT = 5;
export const BATAS_PER_HARI = 20;

export const TIDAK_DITEMUKAN =
  "Tidak ditemukan jawaban di koleksi Siji Pangeling untuk pertanyaan ini. Coba kata kunci lain, atau buka langsung tab Al-Qur'an, Hadits, Siroh, dan Artikel.";

export const PROMPT_SISTEM = `Kamu adalah penjawab di situs Siji Pangeling. Jawablah HANYA berdasarkan sumber-sumber di bawah ini. Setiap pernyataan faktual harus disertai kutipan sumbernya dengan format persis seperti yang diberikan (mis. QS. Al-Baqarah 2:153, HR. Bukhari No. 1). Jangan menambah nomor ayat, nomor hadits, atau isi yang tidak ada di sumber. Bila sumber tidak cukup untuk menjawab, katakan "Tidak ditemukan jawaban di koleksi Siji Pangeling untuk pertanyaan ini." Jangan mengeluarkan fatwa atau putusan hukum; untuk soal hukum, arahkan untuk bertanya ke ustadz atau ahli. Jawablah dalam Bahasa Indonesia, nada tenang dan sederhana, maksimal 250 kata.`;

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
  "apa apakah bagaimana kenapa mengapa siapa kapan dimana di mana yang dan atau di ke dari dalam untuk dengan pada adalah itu ini saya pak bu tolong mohon jelaskan ceritakan tentang sebutkan berikan adakah bisakah bolehkah qur quran alquran katakan kata menurut juga kita mereka orang para".split(" ")
);

export function kataKunci(pertanyaan: string): string[] {
  const kata = pertanyaan
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !KATA_BUANG.has(w));
  return [...new Set(kata)].slice(0, 8);
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
 */
function cariGabung<T extends { id: number }>(
  fn: (q: string, limit: number, offset: number) => T[],
  kunci: string[],
  limit: number
): T[] {
  const skor = new Map<number, { item: T; n: number }>();
  for (const k of kunci) {
    for (const item of fn(k, limit, 0)) {
      const s = skor.get(item.id) ?? { item, n: 0 };
      s.n++;
      skor.set(item.id, s);
    }
  }
  return [...skor.values()].sort((a, b) => b.n - a.n).slice(0, limit).map((s) => s.item);
}

/** Retrieval v1 (FTS5): 5 ayat + 3 hadits + 2 siroh + 2 artikel teratas. */
export function cariSumber(pertanyaan: string): Sumber[] {
  const kunci = kataKunci(pertanyaan);
  if (!kunci.length) return [];
  const sumber: Sumber[] = [];
  for (const a of cariGabung(cariAyat, kunci, 5) as any[]) {
    sumber.push({
      modul: "ayat",
      rujukan: `QS. ${a.surah_nama} ${a.verse_key}`,
      teks: potong(a.terjemahan),
      surah: a.surah_no,
      ayat: a.ayat_no,
    });
  }
  for (const h of cariGabung(cariHadits, kunci, 3) as any[]) {
    sumber.push({
      modul: "hadits",
      rujukan: `HR. ${h.kitab}${h.no_hadits ? " No. " + h.no_hadits : ""}`,
      teks: potong(h.matan_id),
      kitab: h.kitab,
      no: h.no_hadits,
    });
  }
  for (const s of cariGabung(cariSiroh, kunci, 2) as any[]) {
    sumber.push({ modul: "siroh", rujukan: s.judul, teks: potong(s.peristiwa), judul: s.judul });
  }
  for (const a of cariGabung(cariArtikel, kunci, 2) as any[]) {
    sumber.push({ modul: "artikel", rujukan: a.judul, teks: potong(a.isi), judul: a.judul });
  }
  return sumber;
}

function promptPengguna(pertanyaan: string, sumber: Sumber[]): string {
  const daftar = sumber
    .map((s, i) => `[${i + 1}] ${s.rujukan}\n${s.teks}`)
    .join("\n\n");
  return `Pertanyaan: ${pertanyaan}\n\nSumber-sumber:\n${daftar}`;
}

async function panggilAI(pertanyaan: string, sumber: Sumber[]): Promise<string> {
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
        { role: "user", content: promptPengguna(pertanyaan, sumber) },
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

/** Hash pertanyaan yang dinormalisasi (kunci cache). */
export function hashPertanyaan(pertanyaan: string): string {
  return createHash("sha256").update(pertanyaan.trim().toLowerCase()).digest("hex");
}

export async function jawabPertanyaan(pertanyaanMentah: string): Promise<HasilTanya> {
  const pertanyaan = pertanyaanMentah.trim();
  if (!pertanyaan) throw new Error("pertanyaan kosong");
  if (pertanyaan.length > MAKS_PANJANG_PERTANYAAN)
    throw new Error(`pertanyaan maks ${MAKS_PANJANG_PERTANYAAN} karakter`);
  const hash = hashPertanyaan(pertanyaan);
  const cache = getTanyaCache(hash);
  if (cache) {
    try {
      const parsed = JSON.parse(cache) as { jawaban: string; sumber: Sumber[] };
      return { jawaban: parsed.jawaban, sumber: parsed.sumber, dariCache: true };
    } catch {
      // Cache rusak: lanjut seperti tidak ada cache.
    }
  }
  const sumber = cariSumber(pertanyaan);
  if (!sumber.length) {
    const hasil: HasilTanya = { jawaban: TIDAK_DITEMUKAN, sumber: [], dariCache: false };
    setTanyaCache(hash, pertanyaan, JSON.stringify({ jawaban: hasil.jawaban, sumber: hasil.sumber }));
    return hasil;
  }
  const jawaban = await panggilAI(pertanyaan, sumber);
  const hasil: HasilTanya = { jawaban, sumber, dariCache: false };
  setTanyaCache(hash, pertanyaan, JSON.stringify({ jawaban: hasil.jawaban, sumber: hasil.sumber }));
  return hasil;
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
