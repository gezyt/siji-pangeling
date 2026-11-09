// Seed jawaban baku (memory kurasi) untuk Tanya Jawab AI.
//
// Jawaban di sini ditulis/dis setujui Pak Gun untuk pertanyaan yang sering
// masuk. Bot memeriksa tabel ini SEBELUM cache dan SEBELUM memanggil AI,
// jadi jawaban baku keluar tanpa biaya AI dan tanpa risiko AI salah
// merangkai. Teks ayat/hadits diambil langsung dari database (bukan
// ditulis tangan di skrip ini) supaya kutipannya persis.
//
// Menambah/mengubah entri: tambah/edit objek di DAFTAR di bawah, lalu
// jalankan ulang skrip ini (upsert berdasarkan `pertanyaan`, jadi entri
// lama diperbarui, bukan ganda). Tidak perlu restart service — tabel
// dibaca dari database setiap ada pertanyaan masuk.
//
// Pakai: SIJI_DB=./data/app.db bun run seed:jawaban-baku
// Di VPS: cd /opt/pangeling/siji && bun run seed:jawaban-baku
import { db, upsertJawabanBaku } from "../src/db";
import type { Sumber } from "../src/tanya";

function ayatSumber(verseKey: string): Sumber | null {
  const a = db
    .query("SELECT * FROM ayat WHERE verse_key = ?")
    .get(verseKey) as any;
  if (!a) {
    console.warn(`seed: ayat ${verseKey} tidak ada di database, dilewati`);
    return null;
  }
  return {
    modul: "ayat",
    rujukan: `QS. ${a.surah_nama} ${a.verse_key}`,
    teks: a.terjemahan,
    surah: a.surah_no,
    ayat: a.ayat_no,
  };
}

function haditsSumber(kitab: string, no: string): Sumber | null {
  const h = db
    .query("SELECT * FROM hadits WHERE kitab = ? AND no_hadits = ?")
    .get(kitab, no) as any;
  if (!h) {
    console.warn(`seed: hadits ${kitab} No. ${no} tidak ada di database, dilewati`);
    return null;
  }
  return {
    modul: "hadits",
    rujukan: `HR. ${h.kitab}${h.no_hadits ? " No. " + h.no_hadits : ""}`,
    teks: h.matan_id,
    kitab: h.kitab,
    no: h.no_hadits,
  };
}

const DAFTAR: { pertanyaan: string; pemicu: string; jawaban: string; sumber: (Sumber | null)[] }[] = [
  {
    pertanyaan: "Apa yang Al-Qur'an katakan tentang sabar?",
    pemicu: "sabar",
    jawaban:
      "Al-Qur'an mengajarkan bahwa sabar adalah salah satu cara memohon pertolongan Allah, bersama salat. Allah juga menyatakan bahwa Dia beserta orang-orang yang sabar. (QS. Al-Baqarah 2:153)\n\n" +
      "Sabar disebut sebagai sifat orang-orang yang bertawakal kepada Allah. (QS. Al-'Ankabut 29:59; QS. An-Nahl 16:42) Al-Qur'an juga memuji Ismail sebagai seorang anak yang sangat sabar. (QS. As-Saffat 37:101)\n\n" +
      "Dalam kisah Nabi Musa dan Khidir, disebutkan bahwa seseorang mungkin tidak sanggup bersabar dalam menghadapi sesuatu yang belum dipahaminya. (QS. Al-Kahf 18:67)\n\n" +
      "Jadi, berdasarkan sumber-sumber ini, sabar berkaitan dengan memohon pertolongan Allah, tetap bertawakal kepada-Nya, dan menahan diri dalam menghadapi keadaan yang sulit. (QS. Al-Baqarah 2:153; QS. Al-'Ankabut 29:59; QS. An-Nahl 16:42)",
    sumber: [
      ayatSumber("2:153"),
      ayatSumber("18:67"),
      ayatSumber("37:101"),
      ayatSumber("29:59"),
      ayatSumber("16:42"),
    ],
  },
  {
    pertanyaan: "Apa itu ikhlas?",
    pemicu: "ikhlas",
    jawaban:
      "Ikhlas adalah beribadah kepada Allah dengan tulus, hanya mengharapkan-Nya, tanpa memperhatikan ketidaksukaan orang lain. Allah berfirman, \"Maka sembahlah Allah dengan tulus ikhlas beragama kepada-Nya.\" (QS. Ghafir 40:14)\n\n" +
      "Ikhlas berkaitan dengan menyembah Allah semata — Dialah Allah Yang Maha Esa, tempat meminta segala sesuatu, yang tidak beranak dan tidak diperanakkan, dan tidak ada sesuatu pun yang setara dengan-Nya. (QS. Al-Ikhlas 112:1-4)",
    sumber: [
      ayatSumber("40:14"),
      ayatSumber("112:1"),
      ayatSumber("112:2"),
      ayatSumber("112:3"),
      ayatSumber("112:4"),
      haditsSumber("Sahih Muslim", "1690"),
      haditsSumber("Sahih al-Bukhari", "5015"),
      haditsSumber("Sahih al-Bukhari", "5748"),
    ],
  },
  {
    pertanyaan: "Ayat kursi surah apa ayat berapa?",
    pemicu: "ayat, kursi",
    jawaban:
      "Ayat Kursi adalah QS. Al-Baqarah 2:255: \"Allah, tidak ada tuhan selain Dia, Yang Maha Hidup, Yang terus-menerus mengurus makhluk-Nya.\"",
    sumber: [ayatSumber("2:255")],
  },
  {
    pertanyaan: "Hadits tentang niat",
    pemicu: "hadits, niat",
    jawaban:
      "Rasulullah ﷺ bersabda: \"Semua perbuatan tergantung niatnya, dan (balasan) bagi tiap-tiap orang tergantung apa yang diniatkan.\" (HR. Sahih al-Bukhari No. 1)\n\n" +
      "Karena itu, nilai suatu amal ditentukan oleh niat yang menyertainya — hijrah karena Allah dan Rasul-Nya berbeda balasannya dengan hijrah karena dunia. Al-Qur'an pun menegaskan bahwa Allah memperhitungkan niat yang terkandung dalam hati (QS. Al-Baqarah 2:225).",
    sumber: [haditsSumber("Sahih al-Bukhari", "1"), ayatSumber("2:225")],
  },
  {
    pertanyaan: "Siapa saja mustahik zakat?",
    pemicu: "mustahik, zakat",
    jawaban:
      "Mustahik zakat ada delapan golongan (QS. At-Tawbah 9:60): orang fakir, orang miskin, amil zakat, mualaf, hamba sahaya (untuk dimerdekakan), orang yang berhutang, orang yang berjuang di jalan Allah, dan orang yang sedang dalam perjalanan.",
    sumber: [ayatSumber("9:60")],
  },
  {
    pertanyaan: "Siapa yang paling dicintai Allah?",
    pemicu: "dicintai, allah",
    jawaban:
      "Al-Qur'an tidak menyebut satu orang yang paling dicintai Allah, tetapi menyebut siapa saja yang dicintai-Nya. Di antaranya orang yang mengikuti Nabi Muhammad ﷺ — \"Jika kamu mencintai Allah, ikutilah aku, niscaya Allah mencintaimu\" (QS. Ali 'Imran 3:31) — dan orang-orang yang berperang di jalan-Nya dalam barisan yang teratur (QS. As-Saf 61:4).",
    sumber: [ayatSumber("3:31"), ayatSumber("61:4")],
  },
  {
    pertanyaan: "Apa makhluk yang paling besar?",
    pemicu: "makhluk, besar",
    jawaban:
      "Al-Qur'an menyatakan penciptaan langit dan bumi lebih besar daripada penciptaan manusia (QS. Ghafir 40:57). Adapun Arsy disebut dalam doa Nabi sebagai \"Arsy yang Agung\", dan Allah sebagai Tuhan Pemelihara Arsy (HR. Sahih al-Bukhari No. 7431). Koleksi Siji tidak memuat hadits yang secara eksplisit menyebut makhluk yang paling besar.",
    sumber: [ayatSumber("40:57"), haditsSumber("Sahih al-Bukhari", "7431")],
  },
];

let n = 0;
for (const e of DAFTAR) {
  const sumber = e.sumber.filter((s): s is Sumber => s !== null);
  upsertJawabanBaku(e.pertanyaan, e.pemicu, e.jawaban, JSON.stringify(sumber));
  n++;
}
console.log(`seed jawaban baku: ${n} entri`);
