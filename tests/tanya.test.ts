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
      // meski ada sumber yang terambil). Penolakannya sengaja
      // DIPARAFRASA — meniru AI asli 2026-11-10 ("Tidak ditemukan
      // hadits tentang korupsi ...") — supaya uji membuktikan
      // deteksi penolakan tidak bergantung pada kalimat baku persis.
      const b: any = await req.json().catch(() => ({}));
      const prompt = String(b?.messages?.[1]?.content ?? "");
      const isi = prompt.includes("cinta")
        ? "Tidak ditemukan jawaban tentang cinta di koleksi Siji Pangeling untuk pertanyaan ini."
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
  // Ayat-ayat untuk uji perbaikan retrieval 2026-11-10 (mustahik,
  // dicintai, makhluk terbesar): 9:60 + ayat-ayat zakat lain supaya
  // peringkatnya bermakna, 40:57, dan 12:8 sebagai pengecoh "dicintai"
  // yang tidak relevan. 2:177 sengaja TIDAK ditambah: ia cocok "allah"
  // DAN "cinta" seperti 3:31 dan bisa menggeser uji peringkat cinta.
  const ayatTambah: [number, number, string, number, string, string, string][] = [
    [5, 9, "At-Tawbah", 60, "9:60", "", "Sesungguhnya zakat itu hanyalah untuk orang-orang fakir, orang miskin, amil zakat, orang yang dilunakkan hatinya (mualaf), untuk (memerdekakan) hamba sahaya, untuk (membebaskan) orang yang berhutang, untuk jalan Allah dan untuk orang yang sedang dalam perjalanan, sebagai kewajiban dari Allah. Allah Maha Mengetahui, Mahabijaksana."],
    [6, 2, "Al-Baqarah", 43, "2:43", "", "Dan dirikanlah salat, tunaikanlah zakat, dan rukuklah bersama orang-orang yang rukuk."],
    [7, 23, "Al-Mu'minun", 4, "23:4", "", "Dan orang-orang yang menunaikan zakat."],
    [8, 41, "Fussilat", 7, "41:7", "", "Yaitu orang-orang yang tidak menunaikan zakat dan mereka mengingkari kehidupan akhirat."],
    [9, 31, "Luqman", 4, "31:4", "", "Yaitu orang-orang yang mendirikan salat, menunaikan zakat, dan meyakini hari akhir."],
    [10, 24, "An-Nur", 56, "24:56", "", "Dan dirikanlah salat, tunaikanlah zakat, dan taatlah kepada Rasul agar kamu diberi rahmat."],
    [11, 40, "Ghafir", 57, "40:57", "", "Sungguh, penciptaan langit dan bumi itu lebih besar daripada penciptaan manusia, akan tetapi kebanyakan manusia tidak mengetahui."],
    [12, 12, "Yusuf", 8, "12:8", "", "Sesungguhnya Yusuf dan saudaranya lebih dicintai oleh ayah kami daripada kami, padahal kami satu golongan."],
    // Ayat-ayat unsur korupsi (dipakai uji peta konsep korupsi).
    [13, 2, "Al-Baqarah", 188, "2:188", "", "Dan janganlah kamu makan harta di antara kamu dengan jalan yang batil, dan (janganlah) kamu menyuap dengan harta itu kepada para hakim, dengan maksud agar kamu dapat memakan sebagian harta orang lain itu dengan jalan dosa, padahal kamu mengetahui."],
    [14, 5, "Al-Ma'idah", 38, "5:38", "", "Adapun orang laki-laki maupun perempuan yang mencuri, potonglah tangan keduanya (sebagai) balasan atas perbuatan yang mereka lakukan dan sebagai siksaan dari Allah."],
    [15, 3, "Ali 'Imran", 161, "3:161", "", "Dan tidak mungkin seorang Nabi berkhianat (dalam urusan harta rampasan perang). Barang siapa berkhianat, niscaya pada hari Kiamat dia akan datang membawa apa yang dikhianatkannya."],
    [16, 4, "An-Nisa", 58, "4:58", "", "Sungguh, Allah menyuruhmu menyampaikan amanat kepada yang berhak menerimanya, dan apabila kamu menetapkan hukum di antara manusia hendaknya kamu menetapkannya dengan adil."],
  ];
  for (const [id, surahNo, surahNama, ayatNo, key, arab, terjemahan] of ayatTambah) {
    db.query(
      "INSERT INTO ayat (id, surah_no, surah_nama, ayat_no, verse_key, arab, terjemahan) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(id, surahNo, surahNama, ayatNo, key, arab, terjemahan);
  }
  db.query(
    "INSERT INTO hadits (kitab, no_hadits, matan_id, perawi, status_sanad) VALUES (?, ?, ?, ?, ?)"
  ).run("Bukhari", "1", "Sesungguhnya amal itu tergantung niatnya.", "Umar bin Khattab", "sahih");
  // Hadits laknat penyuap (perluasan 2026-11-10): 3580 memakai kata
  // "sogokan", bukan "suap" — dipakai uji peta konsep suap->sogokan.
  // Status 'belum-diverifikasi' seperti impor asli (kitab Sunan,
  // grade per hadits kosong di sumber).
  db.query(
    "INSERT INTO hadits (kitab, no_hadits, matan_id, perawi, status_sanad) VALUES (?, ?, ?, ?, ?)"
  ).run("Sunan Abu Dawud", "3580", "Rasulullah shallallahu 'alaihi wasallam melaknat orang yang memberi uang sogokan dan orang yang menerimanya.", "Abdullah bin 'Amru", "belum-diverifikasi");
  db.query(
    "INSERT INTO hadits (kitab, no_hadits, matan_id, perawi, status_sanad) VALUES (?, ?, ?, ?, ?)"
  ).run("Sunan at-Tirmidzi", "1337", "Rasulullah shallallahu 'alaihi wasallam melaknati penyuap dan yang disuap. Abu Isa berkata; Hadits ini hasan shahih.", "Abdullah bin Umar", "belum-diverifikasi");
  db.query(
    "INSERT INTO hadits (kitab, no_hadits, matan_id, perawi, status_sanad) VALUES (?, ?, ?, ?, ?)"
  ).run("Sunan at-Tirmidzi", "1336", "Rasulullah shallallahu 'alaihi wasallam melaknati penyuap dan yang disuap.", "Abu Hurairah", "belum-diverifikasi");
  db.query(
    "INSERT INTO siroh (urutan, judul, peristiwa, hikmah) VALUES (?, ?, ?, ?)"
  ).run(7, "Hijrah ke Madinah", "Nabi Muhammad hijrah dari Makkah ke Madinah.", "Hijrah adalah perpindahan menuju kebaikan.");
  db.query(
    "INSERT INTO artikel (judul, isi, dalil, kategori) VALUES (?, ?, ?, ?)"
  ).run("Sabar dalam Islam", "Sabar adalah menahan diri dalam ketaatan.", "QS. Al-Baqarah 2:153", "Akhlak");
  // Baris fiqih untuk uji Tanya Jawab + fiqih (2026-11-12): teks Arab
  // asli gaya Kifayat — tiga baris wudhu (urut 1 cocok طهارة+وضوء,
  // urut 2 cocok وضوء saja, urut 3 cocok طهارة saja) supaya uji
  // lanjutan bisa membuktikan ronde 2 menemukan bagian baru, plus
  // satu baris salat. "hukum" sengaja tidak ada di teks Arab mana pun.
  db.query(
    "INSERT INTO fiqh (kitab, mazhab, bab, pasal, teks, urut, sumber) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run("Kifayat al-Akhyar", "Syafi'i", "كتاب الطهارة", "باب أقسام المياه", "المياه التي يجوز التطهير بها سبع مياه ماء السماء وماء البحر والوضوء من الطهارة", 1, "Fiqh Corpus");
  db.query(
    "INSERT INTO fiqh (kitab, mazhab, bab, pasal, teks, urut, sumber) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run("Kifayat al-Akhyar", "Syafi'i", "كتاب الطهارة", "باب فرائض الوضوء", "فرائض الوضوء ستة النية وغسل الوجه وغسل اليدين ومسح الرأس وغسل الرجلين والترتيب", 2, "Fiqh Corpus");
  db.query(
    "INSERT INTO fiqh (kitab, mazhab, bab, pasal, teks, urut, sumber) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run("Kifayat al-Akhyar", "Syafi'i", "كتاب الطهارة", "باب ما يحرم على الجنب والمحدث", "الطهارة شرط لصحة الصلاة فلا تصح الصلاة بغير طهارة", 3, "Fiqh Corpus");
  db.query(
    "INSERT INTO fiqh (kitab, mazhab, bab, pasal, teks, urut, sumber) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run("Kifayat al-Akhyar", "Syafi'i", "كتاب الصلاة", "باب مواقيت الصلاة", "مواقيت الصلاة خمس الصبح والظهر والعصر والمغرب والعشاء", 4, "Fiqh Corpus");
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
  expect(ayat[0]!.rujukan).toBe("QS. Ali 'Imran 3:31");
  expect(ayat[0]!.surah).toBe(3);
  expect(ayat[0]!.ayat).toBe(31);
});

test("jawabPertanyaan: bila AI menolak (dengan parafrasa), sumber tidak ikut dikembalikan", async () => {
  const hasil = await tanya.jawabPertanyaan("Allah itu cinta kepada siapa?");
  expect(hasil.jawaban).toContain("Tidak ditemukan");
  expect(hasil.sumber).toEqual([]);
  expect(hasil.dariCache).toBe(false);
  // Panggilan kedua dari cache: tetap tanpa sumber.
  const kedua = await tanya.jawabPertanyaan("Allah itu cinta kepada siapa?");
  expect(kedua.dariCache).toBe(true);
  expect(kedua.sumber).toEqual([]);
});

test("jawabanMenolak mengenali penolakan baku dan parafrasa, bukan kalimat di tengah jawaban", () => {
  expect(tanya.jawabanMenolak("Tidak ditemukan jawaban di koleksi Siji Pangeling untuk pertanyaan ini.")).toBe(true);
  // Parafrasa seperti jawaban AI asli 2026-11-10 untuk korupsi.
  expect(tanya.jawabanMenolak("Tidak ditemukan hadits tentang korupsi di koleksi Siji Pangeling untuk pertanyaan ini.")).toBe(true);
  expect(tanya.jawabanMenolak("  \"Tidak ditemukan jawaban untuk pertanyaan ini.\"")).toBe(true);
  expect(tanya.jawabanMenolak("tidak ditemukan sumber yang relevan.")).toBe(true);
  expect(tanya.jawabanMenolak("Sabar adalah penolong. (QS. Al-Baqarah 2:153)")).toBe(false);
  // "tidak ditemukan" di TENGAH jawaban bukan penolakan.
  expect(tanya.jawabanMenolak("Menurut sumber, hadits itu tidak ditemukan di sini, tetapi ayatnya ada.")).toBe(false);
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

test("stemKata: imbuhan Indonesia diringkas ke bentuk kanonik", () => {
  expect(tanya.stemKata("dicintai")).toBe("cinta");
  expect(tanya.stemKata("mencintai")).toBe("cinta");
  expect(tanya.stemKata("terbesar")).toBe("besar");
  expect(tanya.stemKata("beramal")).toBe("amal");
  expect(tanya.stemKata("berhutang")).toBe("hutang");
  expect(tanya.stemKata("perjalanan")).toBe("jalan");
  expect(tanya.stemKata("penciptaan")).toBe("cipta");
  expect(tanya.stemKata("diberikan")).toBe("beri");
  // Kata pendek yang memang akar tidak boleh rusak.
  expect(tanya.stemKata("iman")).toBe("iman");
  expect(tanya.stemKata("kursi")).toBe("kursi");
  expect(tanya.stemKata("nabi")).toBe("nabi");
  expect(tanya.stemKata("sabar")).toBe("sabar");
  expect(tanya.stemKata("tuhan")).toBe("tuhan");
  // Kata serapan berakhiran -si: "-i"-nya bagian dari kata, bukan akhiran.
  expect(tanya.stemKata("korupsi")).toBe("korupsi");
  expect(tanya.stemKata("polisi")).toBe("polisi");
});

test("kataKunci memakai stem: dicintai jadi cinta, terbesar jadi besar", () => {
  expect(tanya.kataKunci("Siapa yang paling dicintai Allah?")).toEqual(["paling", "cinta", "allah"]);
  expect(tanya.kataKunci("makhluk apa yang terbesar?")).toEqual(["makhluk", "besar"]);
  expect(tanya.kataKunci("siapa yang beramal dan berhutang?")).toEqual(["amal", "hutang"]);
  // "seorang" hasil stem-nya ("orang") ikut tersaring sebagai kata buang.
  expect(tanya.kataKunci("seorang penuntut ilmu")).not.toContain("orang");
});

test("cariSumber: mustahik menemukan 9:60 lewat peta konsep", () => {
  const sumber = tanya.cariSumber("Siapa saja mustahik zakat?");
  const ayat = sumber.filter((s) => s.modul === "ayat");
  expect(ayat.length).toBeGreaterThan(0);
  // 9:60 cocok 7 kata kunci (zakat + 6 dari peta konsep); ayat zakat
  // lain hanya cocok "zakat". Tanpa peta konsep 9:60 ada di posisi 8.
  expect(ayat[0]!.rujukan).toBe("QS. At-Tawbah 9:60");
});

test("cariSumber: dicintai menemukan 3:31 lewat stemming", () => {
  const sumber = tanya.cariSumber("Siapa yang paling dicintai Allah?");
  const ayat = sumber.filter((s) => s.modul === "ayat");
  expect(ayat.length).toBeGreaterThan(0);
  // 3:31 cocok "cinta" dan "allah"; 12:8 hanya cocok "cinta".
  expect(ayat[0]!.rujukan).toBe("QS. Ali 'Imran 3:31");
});

test("cariSumber: makhluk terbesar menemukan 40:57 lewat peta konsep", () => {
  const sumber = tanya.cariSumber("Apa makhluk yang paling besar?");
  const ayat = sumber.filter((s) => s.modul === "ayat");
  // 40:57 cocok "besar" dan "cipta" (dari peta makhluk); 2:255 hanya
  // cocok "makhluk". Tanpa peta konsep 40:57 ada di posisi 61.
  expect(ayat.slice(0, 5).some((a) => a.rujukan.includes("40:57"))).toBe(true);
});

test("perluasKataKunci: korupsi diperluas ke unsur-unsurnya", () => {
  const kunci = tanya.perluasKataKunci(tanya.kataKunci("carikan hadits tentang korupsi"));
  expect(kunci).toContain("korupsi");
  expect(kunci).toContain("cari");
  // "mencuri" ter-stem jadi "curi"; "khianat", "batil", "amanah",
  // "amanat" tetap; "suap" menemukan "menyuap" lewat LIKE.
  expect(kunci).toContain("curi");
  expect(kunci).toContain("khianat");
  expect(kunci).toContain("batil");
  expect(kunci).toContain("amanah");
  expect(kunci).toContain("amanat");
});

test("cariSumber: pertanyaan korupsi menemukan ayat-ayat unsurnya", () => {
  const sumber = tanya.cariSumber("carikan hadits tentang korupsi");
  const ayat = sumber.filter((s) => s.modul === "ayat").slice(0, 5);
  const rujukan = ayat.map((a) => a.rujukan);
  // Keempat ayat unsur korupsi harus masuk lima besar: 2:188 (batil +
  // suap), 5:38 (mencuri), 3:161 (khianat), 4:58 (amanat). Sebelum
  // peringkat didahulukan jumlah kata kunci, 2:188 terbenam di
  // posisi 44 karena "amanah" (2 ayat) mengangkat ayat lain.
  for (const target of ["2:188", "5:38", "3:161", "4:58"]) {
    expect(rujukan.some((r) => r.includes(target))).toBe(true);
  }
});

test("cariSumber: pertanyaan suap menemukan hadits laknat penyuap", () => {
  const sumber = tanya.cariSumber("hadits tentang suap");
  const hadits = sumber.filter((s) => s.modul === "hadits").slice(0, 3);
  const rujukan = hadits.map((h) => h.rujukan);
  // 3580 memakai kata "sogokan" (bukan "suap") — hanya terambil
  // lewat peta konsep suap -> sogokan.
  expect(rujukan.some((r) => r.includes("3580"))).toBe(true);
  expect(rujukan.some((r) => r.includes("1337") || r.includes("1336"))).toBe(true);
});

test("cariJawabanBaku: entri korupsi cocok dengan pertanyaannya", () => {
  dbMod.upsertJawabanBaku("Carikan hadits tentang korupsi", "korupsi", "Jawaban baku korupsi.", "[]");
  expect(tanya.cariJawabanBaku("carikan hadits tentang korupsi")?.jawaban).toBe("Jawaban baku korupsi.");
  expect(tanya.cariJawabanBaku("apa hukum korupsi dalam Islam?")?.jawaban).toBe("Jawaban baku korupsi.");
  expect(tanya.cariJawabanBaku("apa itu sabar?")?.jawaban).not.toBe("Jawaban baku korupsi.");
});

test("cariJawabanBaku: empat entri baru cocok dengan pertanyaannya", () => {
  dbMod.upsertJawabanBaku("Hadits tentang niat", "hadits, niat", "Jawaban baku niat.", "[]");
  dbMod.upsertJawabanBaku("Siapa saja mustahik zakat?", "mustahik, zakat", "Jawaban baku mustahik.", "[]");
  dbMod.upsertJawabanBaku("Siapa yang paling dicintai Allah?", "dicintai, allah", "Jawaban baku dicintai.", "[]");
  dbMod.upsertJawabanBaku("Apa makhluk yang paling besar?", "makhluk, besar", "Jawaban baku makhluk.", "[]");
  expect(tanya.cariJawabanBaku("hadits tentang niat")?.jawaban).toBe("Jawaban baku niat.");
  expect(tanya.cariJawabanBaku("siapa saja mustahik zakat?")?.jawaban).toBe("Jawaban baku mustahik.");
  expect(tanya.cariJawabanBaku("siapa yang paling dicintai Allah?")?.jawaban).toBe("Jawaban baku dicintai.");
  // Varian redaksi tetap cocok: "dicintai" tanpa "paling", dan
  // "terbesar" yang ter-stem jadi "besar".
  expect(tanya.cariJawabanBaku("siapa yang dicintai Allah?")?.jawaban).toBe("Jawaban baku dicintai.");
  expect(tanya.cariJawabanBaku("apa makhluk yang paling besar?")?.jawaban).toBe("Jawaban baku makhluk.");
  expect(tanya.cariJawabanBaku("makhluk apa yang terbesar?")?.jawaban).toBe("Jawaban baku makhluk.");
});

test("hapusTanyaCache: menghapus entri dan mengembalikan benar/salah", () => {
  const q = "Pertanyaan Hapus Cache";
  const hash = tanya.hashPertanyaan(q);
  dbMod.setTanyaCache(hash, q, JSON.stringify({ jawaban: "lama", sumber: [] }));
  expect(dbMod.getTanyaCache(hash)).not.toBeNull();
  expect(dbMod.hapusTanyaCache(hash)).toBe(true);
  expect(dbMod.getTanyaCache(hash)).toBeNull();
  expect(dbMod.hapusTanyaCache(hash)).toBe(false);
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

test("prompt sistem: soal hukum dijawab dari sumber fiqih, bukan ditolak", () => {
  // Regresi 2026-11-12 (P9a lalu P9b): kalimat P9 "dan ingatkan
  // bahwa itu satu pendapat mazhab, bukan fatwa" membuat model
  // menolak soal hukum padahal sumbernya ada; pangkasan P9a
  // mengembalikan jawaban "perintah Allah", tetapi "apa hukum
  // wudhu?" masih ditolak karena kalimat asli "Jangan mengeluarkan
  // fatwa atau putusan hukum; ..." — justru soal yang modul fiqih
  // dibangun untuk dijawab. Aturan baru (disetujui Pak Gun 12 Nov
  // sore): soal hukum dijawab HANYA dari sumber fiqih + sebut
  // kitab/mazhab; putusan di luar sumber tetap dilarang; bila
  // sumber tak cukup, arahkan ke ustadz. Kata "fatwa" tidak lagi
  // muncul di prompt; peringatan "bukan fatwa" tetap ada di UI.
  expect(tanya.PROMPT_SISTEM).toContain("Kifayat al-Akhyar");
  expect(tanya.PROMPT_SISTEM).toContain("mazhab Syafi'i");
  expect(tanya.PROMPT_SISTEM).toContain("jawablah hanya dari sumber fiqih");
  expect(tanya.PROMPT_SISTEM).toContain("jangan mengeluarkan putusan hukum sendiri di luar sumber");
  expect(tanya.PROMPT_SISTEM).not.toContain("bukan fatwa");
  expect(tanya.PROMPT_SISTEM).not.toContain("fatwa");
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

// --- Pertanyaan lanjutan (Fase 4 sederhana, 2026-11-12) ---

test("kataKunci membuang kata lanjutan (selain, lagi, sampaikan)", () => {
  // "perintah" ter-stem jadi "intah" (awalan "per") seperti biasa;
  // yang penting kata lanjutan tidak jadi kata kunci.
  expect(tanya.kataKunci("Selain yang sudah Anda sampaikan, apa lagi perintah Allah?")).toEqual(["intah", "allah"]);
  expect(tanya.kataKunci("apa lagi?")).toEqual([]);
  expect(tanya.kataKunci("lanjut, apa lagi?")).toEqual([]);
});

test("kataKunciEfektif: lanjutan tanpa kata isi memakai kata kunci konteks", () => {
  const k = tanya.kataKunciEfektif("apa lagi?", "apa perintah tentang salat dan zakat?");
  expect(k).toContain("salat");
  expect(k).toContain("zakat");
  expect(tanya.kataKunciEfektif("apa lagi?")).toEqual([]);
  // Kata isi baru di lanjutan ikut dipakai bersama konteks.
  expect(tanya.kataKunciEfektif("apa lagi tentang zakat?", "apa perintah tentang salat?")).toContain("zakat");
});

test("hashPertanyaan: lanjutan memakai kunci cache yang berbeda", () => {
  const q = "apa itu sabar?";
  expect(tanya.hashPertanyaan(q)).toBe(tanya.hashPertanyaan(q));
  expect(tanya.hashPertanyaan(q)).not.toBe(
    tanya.hashPertanyaan(q, { sudahDipakai: ["QS. Al-Baqarah 2:153"] })
  );
  expect(
    tanya.hashPertanyaan(q, { sudahDipakai: ["QS. Al-Baqarah 2:153"] })
  ).toBe(tanya.hashPertanyaan(q, { sudahDipakai: ["QS. Al-Baqarah 2:153"] }));
});

test("cariSumber dengan sudahDipakai: sumber yang dipakai tidak kembali", () => {
  const pertama = tanya.cariSumber("salat dan zakat");
  expect(pertama.filter((s) => s.modul === "ayat").length).toBe(5);
  const rujukanPertama = pertama[0]!.rujukan;
  const kedua = tanya.cariSumber("salat dan zakat", { sudahDipakai: [rujukanPertama] });
  expect(kedua.map((s) => s.rujukan)).not.toContain(rujukanPertama);
  expect(kedua.length).toBeGreaterThan(0);
  // Bila SEMUA ayat yang cocok dikecualikan, tidak ada ayat yang kembali
  // (pool 12 menampung ketujuh ayat yang cocok: 6 zakat + 2:153).
  const semuaRujukan = [
    "QS. At-Tawbah 9:60", "QS. Al-Baqarah 2:43", "QS. Al-Mu'minun 23:4",
    "QS. Fussilat 41:7", "QS. Luqman 31:4", "QS. An-Nur 24:56",
    "QS. Al-Baqarah 2:153",
  ];
  const habis = tanya.cariSumber("salat dan zakat", { sudahDipakai: semuaRujukan });
  expect(habis.filter((s) => s.modul === "ayat")).toEqual([]);
});

test("jawabPertanyaan lanjutan: sumber baru, bukan ulangan ronde pertama", async () => {
  const sebelum = stubHits;
  const ronde1 = await tanya.jawabPertanyaan("apa perintah tentang salat dan zakat?");
  expect(ronde1.dariCache).toBe(false);
  expect(ronde1.sumber.length).toBeGreaterThan(0);
  expect(stubHits).toBe(sebelum + 1);
  const dipakai = ronde1.sumber.map((s) => s.rujukan);
  const ronde2 = await tanya.jawabPertanyaan("Selain yang sudah disampaikan, apa lagi?", {
    konteks: "apa perintah tentang salat dan zakat?",
    sudahDipakai: dipakai,
  });
  // Cache ronde 1 tidak dipakai (kunci berbeda): stub dipanggil lagi.
  expect(ronde2.dariCache).toBe(false);
  expect(stubHits).toBe(sebelum + 2);
  expect(ronde2.sumber.length).toBeGreaterThan(0);
  for (const s of ronde2.sumber) expect(dipakai).not.toContain(s.rujukan);
});

test("jawabPertanyaan lanjutan yang kehabisan sumber: pesan 'tidak ditemukan lagi', AI tidak dipanggil", async () => {
  const sebelum = stubHits;
  const hasil = await tanya.jawabPertanyaan("zxqwvkj", {
    konteks: "zxqwvkj",
    sudahDipakai: ["QS. Al-Baqarah 2:153"],
  });
  expect(hasil.jawaban).toBe(tanya.TIDAK_DITEMUKAN_LAGI);
  expect(hasil.sumber).toEqual([]);
  expect(stubHits).toBe(sebelum);
});

test("jawabPertanyaan lanjutan melewati jawaban baku (tidak mengulang ronde pertama)", async () => {
  dbMod.upsertJawabanBaku("Apa itu tawakal?", "tawakal", "Jawaban baku tawakal.", "[]");
  const pertama = await tanya.jawabPertanyaan("apa itu tawakal?");
  expect(pertama.dariBaku).toBe(true);
  expect(pertama.jawaban).toBe("Jawaban baku tawakal.");
  const sebelum = stubHits;
  const kedua = await tanya.jawabPertanyaan("apa lagi?", {
    konteks: "apa itu tawakal?",
    sudahDipakai: ["jawaban-baku"],
  });
  expect(kedua.dariBaku).not.toBe(true);
  expect(kedua.jawaban).toBe(tanya.TIDAK_DITEMUKAN_LAGI);
  expect(stubHits).toBe(sebelum);
});

test("perluasKataKunci: wudhu dan salat diperluas ke istilah Arab", () => {
  const wudhu = tanya.perluasKataKunci(["wudhu"]);
  expect(wudhu).toContain("طهارة");
  expect(wudhu).toContain("وضوء");
  const salat = tanya.perluasKataKunci(["salat"]);
  expect(salat).toContain("صلاة");
  const zakat = tanya.perluasKataKunci(["zakat"]);
  expect(zakat).toContain("زكاة");
});

test("cariSumber: pertanyaan wudhu menemukan sumber fiqih Kifayat al-Akhyar", () => {
  const hasil = tanya.cariSumber("apa hukum wudhu?");
  const fiqih = hasil.filter((s) => s.modul === "fiqh");
  expect(fiqih.length).toBeGreaterThan(0);
  // Rujukan memuat kitab + bab Arab, dan urut untuk tautan dalam.
  expect(fiqih[0]!.rujukan).toMatch(/^Kifayat al-Akhyar — كتاب الطهارة/);
  expect(fiqih[0]!.kitab).toBe("Kifayat al-Akhyar");
  expect(typeof fiqih[0]!.urut).toBe("number");
  expect(fiqih[0]!.teks).toMatch(/طهارة|وضوء/);
});

test("cariSumber: pertanyaan salat menemukan bagian fiqih tentang salat", () => {
  const hasil = tanya.cariSumber("kapan waktu salat?");
  const fiqih = hasil.filter((s) => s.modul === "fiqh");
  expect(fiqih.length).toBeGreaterThan(0);
  expect(fiqih.some((s) => s.rujukan.includes("كتاب الصلاة"))).toBe(true);
});

test("cariSumber lanjutan: ronde 2 menemukan bagian fiqih baru, bukan ulangan ronde 1", () => {
  const ronde1 = tanya.cariSumber("apa hukum wudhu?");
  const fiqih1 = ronde1.filter((s) => s.modul === "fiqh");
  expect(fiqih1.length).toBe(2);
  const dipakai = ronde1.map((s) => s.rujukan);
  const ronde2 = tanya.cariSumber("apa lagi?", {
    konteks: "apa hukum wudhu?",
    sudahDipakai: dipakai,
  });
  const fiqih2 = ronde2.filter((s) => s.modul === "fiqh");
  // Baris wudhu ketiga (urut 3, cocok طهارة saja) masih tersisa.
  expect(fiqih2.length).toBe(1);
  expect(fiqih2[0]!.rujukan).toContain("باب ما يحرم على الجنب والمحدث");
  for (const s of fiqih2) expect(dipakai).not.toContain(s.rujukan);
});

test("hapusSemuaTanyaCache: menghapus seluruh entri cache", () => {
  const hash = tanya.hashPertanyaan("pertanyaan cache uji hapus semua");
  dbMod.setTanyaCache(hash, "pertanyaan cache uji hapus semua", JSON.stringify({ jawaban: "x", sumber: [] }));
  expect(dbMod.getTanyaCache(hash)).not.toBeNull();
  const n = dbMod.hapusSemuaTanyaCache();
  expect(n).toBeGreaterThanOrEqual(1);
  expect(dbMod.getTanyaCache(hash)).toBeNull();
});
