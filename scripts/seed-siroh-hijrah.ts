// Isi awal modul Siroh: timeline Hijrah Makkah -> Madinah.
// BUKAN impor dari API: tidak ada API siroh terstruktur yang
// terverifikasi seperti Quran.com / hadith-api. Isi ini ditulis
// dari ringkasan Ar-Rahiq al-Makhtum (Shafiyurrahman
// al-Mubarakfuri) yang dirujuk sumber-sumber Indonesia tentang
// jadwal Hijrah, dan tiap baris mencantumkan sumbernya.
//
// Kejujuran tanggal (jangan dihaluskan):
// - Tanggal Hijri dipakai sebagai acuan utama: 27 Safar, 1, 8,
//   dan 12 Rabiul Awal 1 H. Tanggal-tanggal ini konsisten di
//   sumber yang merujuk Mubarakfuri.
// - Konversi ke tanggal Masehi harian BERVARIASI antar sumber
//   (Quba ada yang 20, ada yang 23 September 622; Madinah ada
//   yang 24, ada yang 27 September). Karena itu kolom
//   tahun_masehi hanya menyimpan tahun 622, dan teks peristiwa
//   tidak mengklaim tanggal Masehi harian yang pasti.
// - Hikmah di tiap baris adalah pelajaran yang bisa dipetik,
//   BUKAN kutipan hadits dan bukan bagian dari riwayat.
// - Baiat Aqabah II terjadi sebelum tahun 1 H, jadi
//   tahun_hijriah-nya NULL (ditulis "sebelum Hijrah" di teks).
//
// Pakai:
//   bun run seed:siroh              # isi bila siroh masih kosong
//   bun run seed:siroh -- --reset   # hapus semua siroh, isi ulang
//   SIJI_DB=/tmp/uji.db bun run seed:siroh
import { db } from "../src/db";

const SUMBER =
  "Ar-Rahiq al-Makhtum (Shafiyurrahman al-Mubarakfuri), ringkasan; tanggal Hijri 1 H, tahun Masehi 622 (konversi harian bervariasi antar sumber)";

type Baris = {
  tahun_hijriah: number | null;
  tahun_masehi: number | null;
  judul: string;
  peristiwa: string;
  tempat: string;
  hikmah: string;
  urutan: number;
};

const DAFTAR: Baris[] = [
  {
    tahun_hijriah: null,
    tahun_masehi: null,
    judul: "Baiat Aqabah II",
    peristiwa:
      "Sebelum Hijrah, di Aqabah dekat Mina, 73 laki-laki dan 2 perempuan dari Aus dan Khazraj Yathrib berbaiat kepada Nabi Muhammad shallallahu 'alaihi wasallam: mereka berjanji membela beliau sebagaimana membela keluarga mereka sendiri bila beliau datang ke Yathrib.",
    tempat: "Aqabah, Mina (dekat Makkah)",
    hikmah:
      "Perjalanan besar dimulai dari perjanjian, bukan dari keberangkatan mendadak: pastikan dulu ada masyarakat tujuan yang siap menerima.",
    urutan: 1,
  },
  {
    tahun_hijriah: null,
    tahun_masehi: null,
    judul: "Persiapan Hijrah di Makkah",
    peristiwa:
      "Nabi memerintahkan para sahabat hijrah ke Yathrib secara bertahap dan diam-diam. Di Makkah tinggal Nabi, Abu Bakar, dan Ali bin Abi Thalib. Abu Bakar menyiapkan dua ekor unta, dan ditunjuk seorang penunjuk jalan yang dipercaya untuk perjalanan itu. Pada malam pengepungan, Ali tidur di tempat Nabi.",
    tempat: "Makkah",
    hikmah:
      "Hijrah direncanakan matang-matang: perbekalan, penunjuk jalan, dan pengorbanan sahabat disiapkan dulu, bukan nekat tanpa rencana.",
    urutan: 2,
  },
  {
    tahun_hijriah: 1,
    tahun_masehi: 622,
    judul: "Keluar dari Makkah",
    peristiwa:
      "Pada malam 27 Safar 1 H, Nabi bersama Abu Bakar keluar dari Makkah. Mereka tidak langsung menuju Yathrib, melainkan ke arah berlawanan, ke selatan, menuju Gua Tsur, agar para pengejar terkecoh.",
    tempat: "Makkah",
    hikmah:
      "Kehati-hatian dan strategi tidak bertentangan dengan tawakal: usaha manusia yang rapi adalah bagian dari ikhtiar.",
    urutan: 3,
  },
  {
    tahun_hijriah: 1,
    tahun_masehi: 622,
    judul: "Tiga Malam di Gua Tsur",
    peristiwa:
      "Nabi dan Abu Bakar bersembunyi di Gua Tsur selama tiga malam. Abdullah bin Abu Bakar datang memberi kabar dari Makkah, Amir bin Fuhairah menggembalakan kambing untuk menghapus jejak, dan Asma membawakan bekal.",
    tempat: "Gua Tsur, Jabal Tsur (selatan Makkah)",
    hikmah:
      "Menunggu waktu yang tepat adalah bagian dari perjalanan: bersembunyi tiga malam bukan berhenti, melainkan menjaga keselamatan rombongan.",
    urutan: 4,
  },
  {
    tahun_hijriah: 1,
    tahun_masehi: 622,
    judul: "Berangkat lewat Jalur Pesisir",
    peristiwa:
      "Pada malam Senin 1 Rabiul Awal 1 H, rombongan keluar dari Gua Tsur bersama Abu Bakar, Amir bin Fuhairah, dan penunjuk jalan, menempuh jalur pesisir yang tidak biasa dilalui, menuju Yathrib.",
    tempat: "Jalur pesisir Makkah - Yathrib",
    hikmah:
      "Jalan yang tidak biasa kadang justru jalan yang selamat: gunakan keahlian penunjuk jalan yang dipercaya, apa pun latarnya.",
    urutan: 5,
  },
  {
    tahun_hijriah: 1,
    tahun_masehi: 622,
    judul: "Tiba di Quba, Masjid Pertama",
    peristiwa:
      "Pada Senin 8 Rabiul Awal 1 H, rombongan tiba di Quba, di selatan Yathrib, dan singgah di rumah Kulsum bin al-Hidm. Ali bin Abi Thalib menyusul dan bertemu di Quba. Di sini Nabi membangun Masjid Quba, dan rombongan tinggal selama empat hari, Senin sampai Kamis.",
    tempat: "Quba (selatan Yathrib)",
    hikmah:
      "Sebelum membangun rumah, bangun dulu pusat komunitas: masjid didirikan sebagai tempat berkumpul dan menguatkan jamaah.",
    urutan: 6,
  },
  {
    tahun_hijriah: 1,
    tahun_masehi: 622,
    judul: "Salat Jumat Pertama dalam Perjalanan",
    peristiwa:
      "Pada Jumat 12 Rabiul Awal 1 H, dalam perjalanan dari Quba menuju Madinah, Nabi memimpin salat Jumat pertama di tengah perjalanan, sebelum memasuki kota.",
    tempat: "Perjalanan Quba - Madinah",
    hikmah:
      "Ibadah tidak ditunda karena sedang dalam perjalanan: kewajiban tetap ditegakkan di mana pun rombongan berada.",
    urutan: 7,
  },
  {
    tahun_hijriah: 1,
    tahun_masehi: 622,
    judul: "Tiba di Madinah",
    peristiwa:
      "Pada Jumat 12 Rabiul Awal 1 H, Nabi tiba di Madinah dan disambut penduduknya. Unta beliau berhenti di tanah Bani Najjar, beliau tinggal di rumah Abu Ayyub al-Anshari, kemudian dibangun Masjid Nabawi, dan dijalin persaudaraan antara Muhajirin dan Anshar. Sejak itu Yathrib disebut Madinah.",
    tempat: "Madinah (Yathrib)",
    hikmah:
      "Kota baru tidak dibangun hanya dengan bangunan, melainkan dengan ikatan: sambutan dan persaudaraan yang membuat pendatang menjadi warga.",
    urutan: 8,
  },
];

const reset = process.argv.includes("--reset");
const sudah = (db.query("SELECT COUNT(*) AS n FROM siroh").get() as { n: number }).n;
if (reset && sudah > 0) {
  db.query("DELETE FROM siroh").run();
} else if (sudah > 0) {
  console.log(`Siroh sudah ada ${sudah} baris, dilewati (pakai --reset untuk isi ulang).`);
  process.exit(0);
}

const insert = db.query(
  `INSERT INTO siroh (tahun_hijriah, tahun_masehi, judul, peristiwa, tempat, hikmah, sumber, urutan)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const isiSemua = db.transaction((list: Baris[]) => {
  for (const b of list) {
    insert.run(b.tahun_hijriah, b.tahun_masehi, b.judul, b.peristiwa, b.tempat, b.hikmah, SUMBER, b.urutan);
  }
});
isiSemua(DAFTAR);
console.log(`Siroh Hijrah: ${DAFTAR.length} peristiwa diisi (urutan 1-8).`);
