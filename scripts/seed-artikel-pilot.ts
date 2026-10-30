// Isi awal modul Artikel: 5 artikel Q&A Islam kontemporer.
// Berbeda dengan ayat, hadits, dan siroh, artikel TIDAK diimpor
// dari API mana pun: tidak ada API artikel terverifikasi.
// Artikel-artikel ini ditulis orisinal untuk Siji Pangeling.
//
// Aturan kejujuran yang dipakai (disetujui Pak Gun 2026-10-30):
// - Dalil hanya ayat Al-Qur'an yang teks terjemahannya sudah
//   diverifikasi ADA di tabel ayat situs ini (terjemahan
//   Kemenag RI). Kutipan di kolom dalil disalin persis dari DB,
//   bukan dari ingatan. Tidak ada hadits yang dikutip di pilot
//   ini, supaya tidak ada nomor hadits yang belum terverifikasi
//   teks lengkapnya.
// - Artikel adalah pengingat, BUKAN fatwa. Kalimat itu ditulis
//   di akhir tiap artikel, dan topik fikih yang ada perbedaan
//   pendapat ulama hanya disajikan sebagai pengantar.
// - Artikel 5 (qashar) sengaja tidak menyebut angka batas jarak
//   safar, karena para ulama berbeda pendapat tentang itu.
//
// Pakai:
//   bun run seed:artikel               # isi bila artikel masih kosong
//   bun run seed:artikel -- --reset    # hapus semua artikel, isi ulang
//   SIJI_DB=/tmp/uji.db bun run seed:artikel
import { db } from "../src/db";

const PENUTUP =
  "Artikel ini adalah pengingat, bukan fatwa. Untuk kasus khusus, tanyakan kepada ustadz atau ulama yang berkompeten.";

type Baris = {
  judul: string;
  isi: string;
  kategori: string;
  dalil: string;
  sumber: string;
  tag: string;
};

const DAFTAR: Baris[] = [
  {
    judul: "Apakah membagikan kabar tentang orang lain di grup chat termasuk ghibah?",
    isi: [
      "Pertanyaan ini sering muncul karena ghibah zaman sekarang jarang berbentuk bisik-bisik di pojok ruangan. Bentuknya justru lebih sering berupa tangkapan layar yang diteruskan, pesan suara yang disebar, atau komentar di grup yang membahas aib seseorang yang tidak hadir di situ.",
      "Ukuran sederhananya tetap sama: bila kabar itu benar tetapi akan menyakiti orangnya bila ia mendengarnya, dan tidak ada keperluan yang dibenarkan untuk menyampaikannya, maka menahan diri adalah pilihan yang lebih selamat. Benar saja belum cukup; yang ditimbang juga keperluan dan akibatnya.",
      "Di grup chat, godaan terbesarnya adalah kecepatan. Pesan diteruskan sebelum sempat dipikirkan, lalu dibaca puluhan orang yang tidak ada hubungannya dengan masalah itu. Padahal satu kali tekan tombol saja, kabar itu sudah tidak bisa ditarik kembali.",
      "Praktik yang bisa dilatih: pertama, tahan dulu pesan yang berisi aib orang lain, jangan langsung diteruskan. Kedua, bila ada yang mengirim kabar semacam itu ke kita, tidak perlu ikut menimpali; cukup diam atau alihkan pembicaraan. Ketiga, bila kabar itu menyangkut keamanan atau kezaliman yang perlu dicegah, sampaikan kepada pihak yang berwenang menanganinya, bukan kepada grup yang hanya akan menjadikannya bahan gosip.",
      PENUTUP,
    ].join("\n\n"),
    kategori: "Akhlak",
    dalil:
      "QS Al-Hujurat 49:12 — “Wahai orang-orang yang beriman! Jauhilah banyak dari prasangka, sesungguhnya sebagian prasangka itu dosa, dan janganlah kamu mencari-cari kesalahan orang lain, dan janganlah ada di antara kamu yang menggunjing sebagian yang lain. Apakah ada di antara kamu yang suka memakan daging saudaranya yang sudah mati? Tentu kamu merasa jijik. Dan bertakwalah kepada Allah, sungguh Allah Maha Penerima tobat, Maha Penyayang.”",
    sumber: "Siji Pangeling (artikel orisinal)",
    tag: "ghibah, media sosial, grup chat, akhlak",
  },
  {
    judul: "Saat hidup terasa berat, dari mana mulai?",
    isi: [
      "Ada masa ketika masalah datang bertumpuk: pekerjaan menekan, keluarga butuh perhatian, dan badan terasa lelah. Di masa seperti itu, nasihat yang paling sering terdengar justru terasa paling sulit dilakukan, karena kita ingin masalahnya selesai sekarang, bukan sekadar bersabar.",
      "Al-Qur'an mengarahkan kepada dua penolong yang bisa dimulai hari ini juga, tanpa menunggu keadaan membaik: sabar dan salat. Sabar di sini bukan berarti diam dan pasrah tanpa usaha, melainkan menahan diri dari keputusan yang tergesa-gesa sambil tetap mengerjakan apa yang bisa dikerjakan. Salat menjadi jeda yang mengembalikan kita kepada Allah di tengah hari yang penuh tekanan.",
      "Mulailah dari yang kecil dan bisa dipegang: satu salat yang dikerjakan dengan tenang, satu masalah yang diurai menjadi langkah berikutnya, satu orang yang dimintai tolong bila beban sudah terlalu berat untuk dipikul sendiri. Meminta tolong kepada orang yang dipercaya bukan tanda iman yang lemah; itu bagian dari ikhtiar.",
      "Bila kesulitan terasa berat dan berkepanjangan, apalagi sampai mengganggu tidur, makan, dan pekerjaan sehari-hari, jangan ragu mencari bantuan profesional atau pendamping yang berkompeten, selain tetap berdoa dan beribadah. Menjaga diri adalah bagian dari menjaga amanah.",
      PENUTUP,
    ].join("\n\n"),
    kategori: "Ibadah",
    dalil:
      "QS Al-Baqarah 2:153 — “Wahai orang-orang yang beriman! Mohonlah pertolongan (kepada Allah) dengan sabar dan salat. Sungguh, Allah beserta orang-orang yang sabar.”",
    sumber: "Siji Pangeling (artikel orisinal)",
    tag: "sabar, salat, ujian hidup, ketenangan",
  },
  {
    judul: "Bagaimana mensyukuri nikmat yang sudah terasa biasa?",
    isi: [
      "Nikmat yang paling sulit disyukuri sering kali justru yang paling dekat: badan yang sehat, rumah yang aman, keluarga yang masih berkumpul, pekerjaan yang berjalan. Karena sudah ada setiap hari, nikmat itu terasa seperti latar, bukan seperti pemberian.",
      "Syukur yang diajarkan Al-Qur'an dimulai dari mengingat, bukan dari menunggu nikmat yang lebih besar. Mengingat bahwa apa yang kita miliki hari ini adalah sesuatu yang pernah kita minta, atau sesuatu yang tidak dimiliki banyak orang, membuat hati kembali menyadari nilainya.",
      "Latihan yang sederhana: setiap hari sebutkan tiga nikmat yang masih kita rasakan hari itu, walau kecil, misalnya bisa bangun pagi, bisa makan bersama keluarga, atau bisa menyelesaikan satu pekerjaan. Lalu wujudkan syukur itu dalam perbuatan: gunakan nikmat itu untuk kebaikan, dan jangan gunakan untuk hal yang justru merugikannya.",
      "Syukur juga berarti tidak mengingkari nikmat dengan cara mengeluh terus-menerus seolah tidak ada kebaikan sama sekali. Mengeluh tentang satu kekurangan itu manusiawi, tetapi bila keluhan menutupi semua kebaikan yang ada, hati menjadi sulit melihat nikmat yang sebenarnya masih banyak.",
      PENUTUP,
    ].join("\n\n"),
    kategori: "Akhlak",
    dalil:
      "QS Ibrahim 14:7 — “Dan (ingatlah) ketika Tuhanmu memaklumkan, “Sesungguhnya jika kamu bersyukur, niscaya Aku akan menambah (nikmat) kepadamu, tetapi jika kamu mengingkari (nikmat-Ku), maka pasti azab-Ku sangat berat.”” — QS Al-Baqarah 2:152 — “Maka ingatlah kepada-Ku, Aku pun akan ingat kepadamu. Bersyukurlah kepada-Ku, dan janganlah kamu ingkar kepada-Ku.”",
    sumber: "Siji Pangeling (artikel orisinal)",
    tag: "syukur, nikmat, dzikir, akhlak",
  },
  {
    judul: "Mengapa menuntut ilmu diangkat derajatnya, dan bagaimana adabnya?",
    isi: [
      "Banyak orang mengira menuntut ilmu hanya soal menambah pengetahuan. Al-Qur'an mengaitkan ilmu dengan derajat: orang yang beriman dan diberi ilmu diangkat beberapa derajat. Artinya, ilmu bukan sekadar isi kepala, melainkan sesuatu yang mengubah cara seseorang bersikap dan memutuskan.",
      "Adabnya dimulai dari hal yang tampak sepele: memberi kelapangan di majelis ilmu. Ayat tentang majelis ini mengajarkan bahwa belajar adalah kegiatan bersama; orang yang memberi tempat kepada orang lain, Allah beri kelapangan kepadanya. Di kelas, di pengajian, atau di ruang belajar daring, adab yang sama berlaku: jangan menutup akses belajar orang lain demi kenyamanan sendiri.",
      "Adab berikutnya adalah mendengar sampai selesai sebelum menilai. Ilmu yang baru didengar sering kali terasa bertentangan dengan kebiasaan lama, dan reaksi pertama biasanya menolak. Menunda penilaian sampai penjelasan selesai adalah bentuk kelapangan yang lain, kelapangan pikiran.",
      "Terakhir, ilmu yang sudah didapat perlu diamalkan sesuai kadarnya dan diajarkan kembali dengan jujur, tanpa mengklaim lebih dari yang diketahui. Mengatakan “saya belum tahu” bukan kegagalan belajar, melainkan bagian dari ilmu itu sendiri.",
      PENUTUP,
    ].join("\n\n"),
    kategori: "Ilmu",
    dalil:
      "QS Al-Mujadalah 58:11 — “Wahai orang-orang yang beriman! Apabila dikatakan kepadamu, “Berilah kelapangan di dalam majelis-majelis,” maka lapangkanlah, niscaya Allah akan memberi kelapangan untukmu. Dan apabila dikatakan, “Berdirilah kamu,” maka berdirilah, niscaya Allah akan mengangkat (derajat) orang-orang yang beriman di antaramu dan orang-orang yang diberi ilmu beberapa derajat. Dan Allah Mahateliti atas apa yang kamu kerjakan.”",
    sumber: "Siji Pangeling (artikel orisinal)",
    tag: "ilmu, majelis ilmu, adab, guru, murid",
  },
  {
    judul: "Bepergian jauh, bolehkah salat diqashar?",
    isi: [
      "Qashar artinya meringkas salat yang empat rakaat menjadi dua rakaat. Keringanan ini diberikan bagi orang yang sedang bepergian, supaya perjalanan yang melelahkan tidak menjadi penghalang untuk tetap salat.",
      "Ayat yang menjadi dasarnya menyebut bepergian di bumi sebagai keadaan yang dibolehkan meng-qasar salat. Dari ayat ini para ulama menjelaskan bahwa qashar berkaitan dengan safar, bukan dengan sekadar keluar rumah sebentar. Salat yang diqashar hanyalah salat yang asalnya empat rakaat: Zuhur, Asar, dan Isya; Subuh dan Magrib tidak diqashar.",
      "Di sinilah diperlukan kehati-hatian: para ulama berbeda pendapat tentang rincian safar yang membolehkan qashar, misalnya batas jarak perjalanan dan berapa lama seseorang masih terhitung musafir. Karena itu artikel ini hanya pengantar. Jangan menjadikan satu tulisan singkat sebagai patokan untuk semua keadaan perjalanan.",
      "Bila Anda sedang merencanakan perjalanan jauh, pelajari dulu syarat-syaratnya dari guru atau referensi fikih yang dipercaya, dan tanyakan keadaan spesifik perjalanan itu. Yang tidak boleh hilang dalam semua perbedaan itu adalah salatnya sendiri: keringanan ada untuk memudahkan, bukan untuk meninggalkan.",
      PENUTUP,
    ].join("\n\n"),
    kategori: "Ibadah",
    dalil:
      "QS An-Nisa 4:101 — “Dan apabila kamu bepergian di bumi, maka tidaklah berdosa kamu meng-qasar salat, jika kamu takut diserang orang kafir. Sesungguhnya orang kafir itu adalah musuh yang nyata bagimu.”",
    sumber: "Siji Pangeling (artikel orisinal)",
    tag: "qashar, safar, salat, perjalanan",
  },
];

const reset = process.argv.includes("--reset");
const sudah = (db.query("SELECT COUNT(*) AS n FROM artikel").get() as { n: number }).n;
if (reset && sudah > 0) {
  db.query("DELETE FROM artikel").run();
} else if (sudah > 0) {
  console.log(`Artikel sudah ada ${sudah} baris, dilewati (pakai --reset untuk isi ulang).`);
  process.exit(0);
}

const insert = db.query(
  `INSERT INTO artikel (judul, isi, kategori, dalil, sumber, tag)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const isiSemua = db.transaction((list: Baris[]) => {
  for (const b of list) {
    insert.run(b.judul, b.isi, b.kategori, b.dalil, b.sumber, b.tag);
  }
});
isiSemua(DAFTAR);
console.log(`Artikel pilot: ${DAFTAR.length} artikel diisi.`);
