// Uji Tanya Jawab AI (src/tanya.ts + cache di src/db.ts).
// Memakai DB sementara (SIJI_DB) dengan data seed minimal, dan stub
// 9router lokal — tidak menyentuh data/app.db dan tidak memanggil AI asli.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";

const TMP_DB = "/tmp/siji-tanya-test.db";
process.env.SIJI_DB = TMP_DB;
try {
  unlinkSync(TMP_DB);
} catch {}
try {
  unlinkSync(TMP_DB + "-wal");
} catch {}
try {
  unlinkSync(TMP_DB + "-shm");
} catch {}

const dbMod: typeof import("../src/db") = await import("../src/db");
const tanya: typeof import("../src/tanya") = await import("../src/tanya");

let stubHits = 0;
const stub = Bun.serve({
  hostname: "127.0.0.1",
  port: 3399,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      stubHits++;
      // Stub meniru dua perilaku AI: menjawab biasa, atau menolak
      // bila prompt-nya menyebut "cinta" (skenario "tidak ditemukan"
      // meski ada sumber yang terambil).
      const b: any = await req.json().catch(() => ({}));
      const prompt = String(b?.messages?.[1]?.content ?? "");
      const isi = prompt.includes("cinta")
        ? "Tidak ditemukan jawaban di koleksi Siji Pangeling untuk pertanyaan ini."
        : "Jawaban contoh berdasarkan QS. Al-Baqarah 2:153.";
      return Response.json({ choices: [{ message: { content: isi } }] });
    }
    return new Response("not found", { status: 404 });
  },
});

beforeAll(() => {
  process.env.SIJI_9ROUTER_URL = "http://127.0.0.1:3399/v1";
  process.env.SIJI_9ROUTER_KEY = "kunci-uji";
  process.env.SIJI_TANYA_MODEL = "model-uji";
  const db = dbMod.db;
  db.query(
    "INSERT INTO ayat (id, surah_no, surah_nama, ayat_no, verse_key, arab, terjemahan) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(1, 1, "Al-Fatihah", 1, "1:1", "بِسْمِ اللَّهِ", "Dengan nama Allah Yang Maha Pengasih, Maha Penyayang.");
  db.query(
    "INSERT INTO ayat (id, surah_no, surah_nama, ayat_no, verse_key, arab, terjemahan) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    2, 2, "Al-Baqarah", 153, "2:153",
    "يَا أَيُّهَا الَّذِينَ آمَنُوا اسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ",
    "Wahai orang-orang yang beriman, mintalah pertolongan dengan sabar dan salat."
  );
  db.query(
    "INSERT INTO ayat (id, surah_no, surah_nama, ayat_no, verse_key, arab, terjemahan) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    3, 2, "Al-Baqarah", 255, "2:255",
    "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ",
    "Allah, tidak ada tuhan selain Dia, Yang Maha Hidup, Yang terus-menerus mengurus makhluk-Nya."
  );
  db.query(
    "INSERT INTO ayat (id, surah_no, surah_nama, ayat_no, verse_key, arab, terjemahan) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    4, 3, "Ali 'Imran", 31, "3:31",
    "قُلْ إِنْ كُنْتُمْ تُحِبُّونَ اللَّهَ فَاتَّبِعُونِي",
    "Katakanlah: Jika kamu mencintai Allah, ikutilah aku, niscaya Allah mencintaimu dan mengampuni dosa-dosamu."
  );
  db.query(
    "INSERT INTO hadits (kitab, no_hadits, matan_id, perawi, status_sanad) VALUES (?, ?, ?, ?, ?)"
  ).run("Bukhari", "1", "Sesungguhnya amal itu tergantung niatnya.", "Umar bin Khattab", "sahih");
  db.query(
    "INSERT INTO siroh (urutan, judul, peristiwa, hikmah) VALUES (?, ?, ?, ?)"
  ).run(7, "Hijrah ke Madinah", "Nabi Muhammad hijrah dari Makkah ke Madinah.", "Hijrah adalah perpindahan menuju kebaikan.");
  db.query(
    "INSERT INTO artikel (judul, isi, dalil, kategori) VALUES (?, ?, ?, ?)"
  ).run("Sabar dalam Islam", "Sabar adalah menahan diri dalam ketaatan.", "QS. Al-Baqarah 2:153", "Akhlak");
});

afterAll(() => {
  stub.stop();
});

test("kataKunci membuang kata tanya, mempertahankan kata isi", () => {
  const k = tanya.kataKunci("Apa yang Al-Qur'an katakan tentang sabar?");
  expect(k).toContain("sabar");
  expect(k).not.toContain("apa");
  expect(k).not.toContain("yang");
  // "Al-Qur'an" tidak boleh jadi kata kunci: "qur" menarik surah Quraisy.
  expect(k).not.toContain("qur");
  expect(tanya.kataKunci("Apa yang Al-Qur'an katakan tentang sabar?")).toEqual(["sabar"]);
  expect(tanya.kataKunci("")).toEqual([]);
  expect(tanya.kataKunci("apa itu?")).toEqual([]);
});

test("cariSumber menemukan ayat 2:153 untuk pertanyaan tentang sabar", () => {
  const sumber = tanya.cariSumber("apa yang Al-Qur'an katakan tentang sabar?");
  const ayat = sumber.find((s) => s.modul === "ayat" && s.rujukan.includes("2:153"));
  expect(ayat).toBeDefined();
  expect(ayat!.rujukan).toBe("QS. Al-Baqarah 2:153");
  expect(ayat!.surah).toBe(2);
  expect(ayat!.ayat).toBe(153);
});

test("kataKunci membuang kata depan umum (kepada, oleh, akan)", () => {
  expect(tanya.kataKunci("Allah itu cinta kepada siapa?")).toEqual(["allah", "cinta"]);
  expect(tanya.kataKunci("siapa yang akan menolong oleh Allah?")).not.toContain("akan");
});

test("cariSumber: kata langka (cinta) mengalahkan kata umum (allah)", () => {
  const sumber = tanya.cariSumber("Allah itu cinta kepada siapa?");
  const ayat = sumber.filter((s) => s.modul === "ayat");
  expect(ayat.length).toBeGreaterThan(0);
  // 3:31 cocok "cinta" DAN "allah"; 1:1 dan 2:255 hanya cocok "allah".
  expect(ayat[0].rujukan).toBe("QS. Ali 'Imran 3:31");
  expect(ayat[0].surah).toBe(3);
  expect(ayat[0].ayat).toBe(31);
});

test("jawabPertanyaan: bila AI menolak, sumber tidak ikut dikembalikan", async () => {
  const hasil = await tanya.jawabPertanyaan("Allah itu cinta kepada siapa?");
  expect(hasil.jawaban).toContain("Tidak ditemukan jawaban di koleksi");
  expect(hasil.sumber).toEqual([]);
  expect(hasil.dariCache).toBe(false);
  // Panggilan kedua dari cache: tetap tanpa sumber.
  const kedua = await tanya.jawabPertanyaan("Allah itu cinta kepada siapa?");
  expect(kedua.dariCache).toBe(true);
  expect(kedua.sumber).toEqual([]);
});

test("jawabanMenolak mengenali kalimat penolakan", () => {
  expect(tanya.jawabanMenolak("Tidak ditemukan jawaban di koleksi Siji Pangeling untuk pertanyaan ini.")).toBe(true);
  expect(tanya.jawabanMenolak("Sabar adalah penolong. (QS. Al-Baqarah 2:153)")).toBe(false);
});

test("cariSumber menemukan hadits niat dan siroh hijrah", () => {
  const h = tanya.cariSumber("hadits tentang niat");
  expect(h.some((s) => s.modul === "hadits" && s.rujukan.includes("Bukhari"))).toBe(true);
  const s = tanya.cariSumber("kapan hijrah ke Madinah terjadi?");
  expect(s.some((x) => x.modul === "siroh" && x.rujukan.includes("Hijrah"))).toBe(true);
});

test("cariSumber kosong untuk kata yang tidak ada", () => {
  expect(tanya.cariSumber("zxqwvkj")).toEqual([]);
});

test("jawabPertanyaan memanggil stub 9router dan mengembalikan jawaban + sumber", async () => {
  const sebelum = stubHits;
  const hasil = await tanya.jawabPertanyaan("apa yang Al-Qur'an katakan tentang sabar?");
  expect(hasil.jawaban).toBe("Jawaban contoh berdasarkan QS. Al-Baqarah 2:153.");
  expect(hasil.sumber.length).toBeGreaterThan(0);
  expect(hasil.dariCache).toBe(false);
  expect(stubHits).toBe(sebelum + 1);
});

test("jawabPertanyaan kedua kalinya memakai cache (stub tidak dipanggil lagi)", async () => {
  const sebelum = stubHits;
  const hasil = await tanya.jawabPertanyaan("apa yang Al-Qur'an katakan tentang sabar?");
  expect(hasil.dariCache).toBe(true);
  expect(hasil.jawaban).toBe("Jawaban contoh berdasarkan QS. Al-Baqarah 2:153.");
  expect(stubHits).toBe(sebelum);
});

test("jawabPertanyaan tanpa sumber tidak memanggil AI", async () => {
  const sebelum = stubHits;
  const hasil = await tanya.jawabPertanyaan("zxqwvkj");
  expect(hasil.jawaban).toBe(tanya.TIDAK_DITEMUKAN);
  expect(hasil.sumber).toEqual([]);
  expect(stubHits).toBe(sebelum);
});

test("jawabPertanyaan menolak pertanyaan kosong dan terlalu panjang", async () => {
  await expect(tanya.jawabPertanyaan("   ")).rejects.toThrow("pertanyaan kosong");
  await expect(tanya.jawabPertanyaan("x".repeat(501))).rejects.toThrow("500 karakter");
});

test("bolehTanya: 5 dalam semenit boleh, ke-6 ditolak; batas harian terpisah per IP", () => {
  const ip = "10.99.0.1";
  for (let i = 0; i < 5; i++) expect(tanya.bolehTanya(ip).boleh).toBe(true);
  const keenam = tanya.bolehTanya(ip);
  expect(keenam.boleh).toBe(false);
  expect(keenam.alasan).toContain("menit");
  expect(tanya.bolehTanya("10.99.0.2").boleh).toBe(true);
});

test("cache tanya: simpan lalu baca kembali", () => {
  const hash = tanya.hashPertanyaan("Pertanyaan Uji Cache");
  expect(dbMod.getTanyaCache(hash)).toBeNull();
  dbMod.setTanyaCache(hash, "Pertanyaan Uji Cache", JSON.stringify({ jawaban: "ya", sumber: [] }));
  expect(dbMod.getTanyaCache(hash)).toBe(JSON.stringify({ jawaban: "ya", sumber: [] }));
});

test("prompt sistem dimuat dari prompts/sistem-tanya.md", () => {
  expect(tanya.PROMPT_SISTEM).toContain("HANYA berdasarkan sumber");
  expect(tanya.PROMPT_SISTEM).not.toContain("<!--");
  expect(tanya.muatPromptSistem()).toBe(tanya.PROMPT_SISTEM);
});

test("cariJawabanBaku: cocok dan yang spesifik menang", () => {
  dbMod.upsertJawabanBaku("Apa itu ikhlas?", "ikhlas", "Jawaban baku ikhlas.", JSON.stringify([{ modul: "artikel", rujukan: "Ikhlas", teks: "tulus" }]));
  dbMod.upsertJawabanBaku("Apa itu sabar?", "sabar", "Jawaban baku sabar umum.", "[]");
  dbMod.upsertJawabanBaku("Mengapa sabar dan salat menolong?", "sabar, salat", "Jawaban baku sabar-salat.", "[]");
  expect(tanya.cariJawabanBaku("apa itu ikhlas?")?.jawaban).toBe("Jawaban baku ikhlas.");
  expect(tanya.cariJawabanBaku("bagaimana cara salat?")).toBeNull();
  expect(tanya.cariJawabanBaku("mengapa sabar dan salat menolong kita?")?.jawaban).toBe("Jawaban baku sabar-salat.");
  expect(tanya.cariJawabanBaku("apa itu sabar?")?.jawaban).toBe("Jawaban baku sabar umum.");
});

test("jawabPertanyaan: jawaban baku didahulukan atas AI dan atas cache", async () => {
  const q = "apa itu ikhlas?";
  dbMod.setTanyaCache(tanya.hashPertanyaan(q), q, JSON.stringify({ jawaban: "Jawaban AI lama.", sumber: [] }));
  const sebelum = stubHits;
  const hasil = await tanya.jawabPertanyaan(q);
  expect(hasil.dariBaku).toBe(true);
  expect(hasil.dariCache).toBe(false);
  expect(hasil.jawaban).toBe("Jawaban baku ikhlas.");
  expect(hasil.sumber[0]?.rujukan).toBe("Ikhlas");
  expect(stubHits).toBe(sebelum);
});

test("ipKlien: CF-Connecting-IP diutamakan, lalu XFF, lalu koneksi", () => {
  const cf = new Request("http://x/", { headers: { "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" } });
  expect(tanya.ipKlien(cf)).toBe("1.2.3.4");
  const xff = new Request("http://x/", { headers: { "x-forwarded-for": "5.6.7.8, 9.9.9.9" } });
  expect(tanya.ipKlien(xff)).toBe("5.6.7.8");
  const kosong = new Request("http://x/");
  expect(tanya.ipKlien(kosong)).toBe("tak-dikenal");
});
