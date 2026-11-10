// Isi modul Siroh: timeline lengkap dari kelahiran sampai wafat
// (26 peristiwa: 10 Makkah + 8 Hijrah + 8 Madinah).
// BUKAN impor dari API: tidak ada API siroh terstruktur yang
// terverifikasi seperti Quran.com / hadith-api. Isi ini ditulis
// dari ringkasan Ar-Rahiq al-Makhtum (Shafiyurrahman
// al-Mubarakfuri) yang dirujuk sumber-sumber Indonesia, dan tiap
// baris mencantumkan sumbernya. Draf 18 peristiwa baru diaudit
// dan disetujui Pak Gun 2026-11-10 sebelum dibangun.
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
// - Hari kelahiran (12 Rabiul Awal) adalah riwayat yang masyhur,
//   tetapi tanggal pastinya diperselisihkan para sejarawan —
//   teks peristiwa 1 menuliskannya sebagai "menurut riwayat
//   yang masyhur". Tahun Isra Mi'raj diperselisihkan (620 atau
//   621 M) — teks peristiwa 9 mencatat itu. Usia Khadijah saat
//   menikah (40 tahun) juga riwayat yang masyhur.
// - Thaif digabung ke Tahun Kesedihan (peristiwa 8) supaya
//   cakupan tetap 18 peristiwa baru; bila perlu dipecah,
//   totalnya jadi 27.
//
// Pakai:
//   bun run seed:siroh              # isi bila siroh masih kosong
//   bun run seed:siroh -- --reset   # hapus semua siroh, isi ulang
//   SIJI_DB=/tmp/uji.db bun run seed:siroh
// Perhatian: di VPS siroh sudah berisi 8 peristiwa Hijrah, jadi
// perintah tanpa --reset akan DILEWATI (bukan ditambah). Setelah
// deploy kode ini, jalankan dengan --reset agar ke-26 peristiwa
// terisi.
import { db } from "../src/db";

const SUMBER =
  "Ar-Rahiq al-Makhtum (Shafiyurrahman al-Mubarakfuri), ringkasan; tanggal Hijri 1 H, tahun Masehi 622 (konversi harian bervariasi antar sumber); tanggal yang diperselisihkan dicatat di teks peristiwa";

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
  // ---- Makkah (1-10) ----
  {
    tahun_hijriah: null,
    tahun_masehi: 570,
    judul: "Kelahiran Nabi",
    peristiwa:
      "Nabi Muhammad shallallahu 'alaihi wasallam lahir di Makkah pada Tahun Gajah, 570 M — tahun ketika Abrahah menyerang Ka'bah dengan pasukan gajah dan digagalkan Allah (QS. Al-Fil 105). Menurut riwayat yang masyhur, kelahiran itu pada 12 Rabiul Awal, meski tanggal pastinya diperselisihkan para sejarawan. Ayah beliau, Abdullah, telah wafat sebelum beliau lahir.",
    tempat: "Makkah",
    hikmah:
      "Awal yang besar tidak selalu ditandai kemegahan: seorang anak yatim yang lahir di tahun penyerangan justru menjadi pembawa risalah.",
    urutan: 1,
  },
  {
    tahun_hijriah: null,
    tahun_masehi: 570,
    judul: "Masa Kecil dan Pengasuhan",
    peristiwa:
      "Beliau disusui Halimah as-Sa'diyah di perkampungan Bani Sa'ad, lalu kembali kepada ibunya, Aminah, sekitar usia empat tahun. Aminah wafat di Abwa dalam perjalanan pulang dari Yathrib ketika beliau berusia enam tahun. Beliau kemudian diasuh kakeknya, Abdul Muthalib, yang wafat saat beliau berusia delapan tahun, lalu diasuh pamannya, Abu Thalib.",
    tempat: "Makkah, Bani Sa'ad, Abwa",
    hikmah:
      "Keberkahan tidak menunggu keadaan sempurna: anak yatim yang berpindah asuhan tiga kali justru tumbuh menjadi pribadi yang paling dipercaya kaumnya.",
    urutan: 2,
  },
  {
    tahun_hijriah: null,
    tahun_masehi: 595,
    judul: "Pernikahan dengan Khadijah",
    peristiwa:
      "Pada usia 25 tahun, beliau menikah dengan Khadijah binti Khuwailid, seorang pedagang Makkah yang terpandang. Sebelumnya beliau mengelola dagangan Khadijah ke Syam bersama pembantunya, Maysarah, yang menyaksikan kejujuran dan keberkahan dagangan beliau. Menurut riwayat yang masyhur, Khadijah saat itu berusia 40 tahun, dan maharnya 20 ekor unta.",
    tempat: "Makkah",
    hikmah:
      "Reputasi dibangun sebelum jabatan datang: kejujuran dalam berdaganglah yang membuat Khadijah memilih beliau, bukan gelar atau harta.",
    urutan: 3,
  },
  {
    tahun_hijriah: null,
    tahun_masehi: 610,
    judul: "Wahyu Pertama di Gua Hira",
    peristiwa:
      "Pada 17 Ramadan 610 M, saat beliau berusia 40 tahun dan sedang menyendiri di Gua Hira, Malaikat Jibril datang dan berkata, \"Iqra\" (bacalah). Turunlah lima ayat pertama QS. Al-'Alaq (96:1-5). Beliau pulang dengan gemetar, dan Khadijah menenangkannya, lalu Waraqah bin Naufal — yang mengenal kitab-kitab terdahulu — membenarkan bahwa yang datang itu adalah malaikat yang sama dengan yang mendatangi Musa.",
    tempat: "Gua Hira, Jabal Nur (Makkah)",
    hikmah:
      "Perintah pertama bukan \"berdakwahlah\", melainkan \"bacalah\": ilmu dan perenungan mendahului gerakan.",
    urutan: 4,
  },
  {
    tahun_hijriah: null,
    tahun_masehi: 610,
    judul: "Dakwah Sembunyi-Sembunyi",
    peristiwa:
      "Selama kurang lebih tiga tahun (610–613 M), dakwah disampaikan sembunyi-sembunyi kepada orang-orang terdekat: Khadijah sebagai orang pertama yang beriman, lalu Ali bin Abi Thalib, Zaid bin Haritsah, dan Abu Bakar. Lewat Abu Bakar, masuk Islam pula Utsman bin Affan, Zubair bin Awwam, Abdurrahman bin Auf, Sa'ad bin Abi Waqqas, dan Thalhah bin Ubaidillah. Mereka berkumpul dan belajar di rumah Arqam bin Abi Arqam.",
    tempat: "Makkah (Darul Arqam)",
    hikmah:
      "Gerakan besar dimulai dari lingkaran kecil yang kuat: keluarga dan sahabat terdekat dulu, sebelum menyapa khalayak.",
    urutan: 5,
  },
  {
    tahun_hijriah: null,
    tahun_masehi: 613,
    judul: "Dakwah Terang-Terangan",
    peristiwa:
      "Pada tahun keempat kenabian (613 M), turun perintah QS. Asy-Syu'ara 26:214: \"Dan berilah peringatan kepada kerabatmu yang terdekat.\" Beliau naik ke Bukit Shafa dan mengumpulkan Bani Hasyim serta Bani Muthalib, lalu menyampaikan peringatan dengan jujur. Abu Lahab — paman beliau sendiri — menolak dengan kasar, dan turunlah QS. Al-Lahab (111) tentangnya.",
    tempat: "Bukit Shafa, Makkah",
    hikmah:
      "Kejujuran dakwah diuji pertama kali di hadapan keluarga sendiri: yang paling dekat bisa menjadi penolak yang paling keras.",
    urutan: 6,
  },
  {
    tahun_hijriah: null,
    tahun_masehi: 617,
    judul: "Pemboikotan Bani Hasyim",
    peristiwa:
      "Pada 617–619 M, kaum Quraisy memboikot Bani Hasyim dan Bani Muthalib: tidak boleh menikah dengan mereka, tidak boleh berjual beli, dan tidak boleh bergaul — sampai mereka menyerahkan Nabi. Piagam boikot itu digantung di dalam Ka'bah. Selama kurang lebih tiga tahun mereka bertahan di lembah Abu Thalib dalam kekurangan, sampai akhirnya piagam itu dimakan rayap (kecuali nama Allah) dan boikot dibatalkan.",
    tempat: "Lembah Abu Thalib (Shi'b Abi Thalib), Makkah",
    hikmah:
      "Tekanan yang dirancang untuk mematahkan justru menguji keteguhan: tiga tahun kekurangan tidak membuat mereka menyerahkan keyakinan.",
    urutan: 7,
  },
  {
    tahun_hijriah: null,
    tahun_masehi: 619,
    judul: "Tahun Kesedihan",
    peristiwa:
      "Pada tahun kesepuluh kenabian (619 M), dua pelindung beliau wafat dalam selang singkat: Abu Thalib, paman yang melindunginya dari kaumnya, lalu Khadijah, istri yang menopangnya sejak awal. Karena itu tahun ini disebut 'Amul Huzni, Tahun Kesedihan. Beliau kemudian pergi ke Thaif mencari perlindungan dan dukungan, tetapi ditolak dan dilempari batu hingga berdarah; beliau tetap mendoakan mereka, bukan membalas.",
    tempat: "Makkah dan Thaif",
    hikmah:
      "Di titik kehilangan terbesar, beliau tidak membalas luka dengan luka: doa untuk Thaif menunjukkan bahwa dakwah lebih besar dari sakit hati.",
    urutan: 8,
  },
  {
    tahun_hijriah: null,
    tahun_masehi: 620,
    judul: "Isra Mi'raj",
    peristiwa:
      "Pada malam hari (tahunnya diperselisihkan, sekitar 620 atau 621 M), beliau diperjalankan dari Masjidil Haram ke Masjidil Aqsa (Isra), lalu naik ke langit (Mi'raj) hingga Sidratul Muntaha. Di sanalah salat lima waktu diwajibkan — awalnya lima puluh waktu, lalu dikurangi atas saran Nabi Musa hingga menjadi lima, dengan pahala tetap lima puluh. Keesokan paginya, kaum Quraisy yang mendengar kisah itu justru mengejeknya.",
    tempat: "Makkah – Baitul Maqdis – langit",
    hikmah:
      "Di tengah ejekan dan kesedihan, datang penghiburan dari langit: kewajiban salat diturunkan langsung, bukan lewat perantara.",
    urutan: 9,
  },
  {
    tahun_hijriah: null,
    tahun_masehi: 621,
    judul: "Baiat Aqabah I",
    peristiwa:
      "Pada musim haji 621 M, dua belas orang Yathrib — sepuluh dari Khazraj dan dua dari Aus — berbaiat di Aqabah. Isi baiatnya: tidak menyekutukan Allah, tidak mencuri, tidak berzina, tidak membunuh anak, tidak berdusta, dan taat dalam kebaikan. Beliau mengutus Mush'ab bin Umair ke Yathrib sebagai dai pertama, dan lewat dakwahnya Islam menyebar ke hampir setiap rumah di kota itu sebelum Hijrah.",
    tempat: "Aqabah, Mina (dekat Makkah)",
    hikmah:
      "Satu dai yang dikirim ke kota yang tepat bisa menyiapkan seluruh masyarakat: Yathrib sudah siap sebelum Nabi tiba.",
    urutan: 10,
  },
  // ---- Hijrah (11-18) — teks tidak berubah dari seed awal, hanya nomor ----
  {
    tahun_hijriah: null,
    tahun_masehi: null,
    judul: "Baiat Aqabah II",
    peristiwa:
      "Sebelum Hijrah, di Aqabah dekat Mina, 73 laki-laki dan 2 perempuan dari Aus dan Khazraj Yathrib berbaiat kepada Nabi Muhammad shallallahu 'alaihi wasallam: mereka berjanji membela beliau sebagaimana membela keluarga mereka sendiri bila beliau datang ke Yathrib.",
    tempat: "Aqabah, Mina (dekat Makkah)",
    hikmah:
      "Perjalanan besar dimulai dari perjanjian, bukan dari keberangkatan mendadak: pastikan dulu ada masyarakat tujuan yang siap menerima.",
    urutan: 11,
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
    urutan: 12,
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
    urutan: 13,
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
    urutan: 14,
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
    urutan: 15,
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
    urutan: 16,
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
    urutan: 17,
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
    urutan: 18,
  },
  // ---- Madinah (19-26) ----
  {
    tahun_hijriah: 1,
    tahun_masehi: 622,
    judul: "Piagam Madinah",
    peristiwa:
      "Setibanya di Madinah (1 H), beliau menulis Piagam Madinah — dokumen yang mengikat Muhajirin, Anshar, dan kabilah-kabilah Yahudi Madinah dalam satu umat. Piagam itu menjamin kebebasan beragama bagi Yahudi, menetapkan bahwa Madinah adalah tanah haram yang tidak boleh diperangi, dan menunjuk Nabi sebagai penengah bila terjadi perselisihan antar pihak.",
    tempat: "Madinah",
    hikmah:
      "Negara tidak dibangun hanya dengan kemenangan, melainkan dengan perjanjian yang tertulis: hak dan kewajiban semua pihak dijaga sejak hari pertama.",
    urutan: 19,
  },
  {
    tahun_hijriah: 2,
    tahun_masehi: 624,
    judul: "Perang Badar",
    peristiwa:
      "Pada 17 Ramadan 2 H (624 M), 313 kaum Muslimin menghadapi sekitar 1.000 pasukan Quraisy di Badar. Meski kalah jumlah dan persenjataan, Muslimin menang. Sebanyak 14 Muslim syahid, sementara 70 Quraisy tewas — termasuk Abu Jahal — dan 70 lainnya ditawan. Kemenangan ini disebut dalam Al-Qur'an sebagai Yaumul Furqan, hari pembeda antara kebenaran dan kebatilan (QS. Al-Anfal 8:41).",
    tempat: "Badar (sumur Badar), sekitar 130 km barat daya Madinah",
    hikmah:
      "Jumlah bukan penentu: 313 orang yang bersatu dan yakin bisa mengalahkan pasukan tiga kali lipatnya.",
    urutan: 20,
  },
  {
    tahun_hijriah: 3,
    tahun_masehi: 625,
    judul: "Perang Uhud",
    peristiwa:
      "Pada Syawal 3 H (625 M), 700 Muslim menghadapi 3.000 Quraisy di Uhud. Awalnya Muslimin unggul, tetapi pasukan pemanah yang ditempatkan di Bukit Rumat turun sebelum waktunya karena mengira perang sudah usai — pasukan Quraisy pun menyerang balik dari belakang. Hamzah bin Abdul Muthalib syahid, Nabi terluka, dan sekitar 70 Muslim gugur. Pelajarannya diabadikan dalam QS. Ali 'Imran 3:152-153.",
    tempat: "Gunung Uhud, Madinah",
    hikmah:
      "Kemenangan bisa berbalik karena satu perintah yang dilanggar: disiplin terhadap arahan pemimpin sama pentingnya dengan keberanian.",
    urutan: 21,
  },
  {
    tahun_hijriah: 5,
    tahun_masehi: 627,
    judul: "Perang Khandaq",
    peristiwa:
      "Pada Syawal 5 H (627 M), gabungan Quraisy, Ghathafan, dan Yahudi Bani Nadhir yang diusir — sekitar 10.000 pasukan — mengepung Madinah. Atas usul Salman al-Farisi, kaum Muslimin menggali parit (khandaq) di sisi kota yang terbuka. Pengepungan berlangsung sekitar sebulan; di tengahnya, Bani Quraizhah membatalkan perjanjian dengan Madinah. Akhirnya badai dingin memporak-porandakan perkemahan musuh dan mereka pulang tanpa hasil.",
    tempat: "Madinah",
    hikmah:
      "Ide dari satu sahabat yang baru masuk Islam — parit — menyelamatkan seluruh kota: gagasan baik tidak mengenal senioritas.",
    urutan: 22,
  },
  {
    tahun_hijriah: 6,
    tahun_masehi: 628,
    judul: "Perjanjian Hudaybiyyah",
    peristiwa:
      "Pada Dzulqa'dah 6 H (628 M), beliau berangkat bersama sekitar 1.400 sahabat untuk umrah, tetapi dicegat Quraisy di Hudaybiyyah. Setelah utusan bolak-balik — dan Baiat Ridwan di bawah pohon ketika tersiar kabar Utsman dibunuh — disepakatilah perjanjian: gencatan senjata sepuluh tahun, Muslimin pulang tahun itu dan boleh berumrah tahun berikutnya, serta klausul pengembalian bagi yang masuk Islam dari Quraisy. Perjanjian yang tampak merugikan itu disebut Al-Qur'an sebagai \"kemenangan yang nyata\" (QS. Al-Fath 48:1).",
    tempat: "Hudaybiyyah (di luar Makkah)",
    hikmah:
      "Kemenangan tidak selalu berbentuk pertempuran: perjanjian yang sabar itu justru membuka pintu dakwah ke seluruh Jazirah.",
    urutan: 23,
  },
  {
    tahun_hijriah: 8,
    tahun_masehi: 630,
    judul: "Fathu Makkah",
    peristiwa:
      "Pada 20 Ramadan 8 H (630 M), beliau memasuki Makkah bersama sekitar 10.000 pasukan — hampir tanpa perlawanan, setelah Quraisy melanggar perjanjian Hudaybiyyah. Di hadapan kaum yang dulu mengusir dan menyiksanya, beliau mengumumkan amnesti umum: \"Pergilah, kalian bebas.\" Sebanyak 360 berhala di sekitar Ka'bah dihancurkan, dan Bilal mengumandangkan azan dari atas Ka'bah.",
    tempat: "Makkah",
    hikmah:
      "Puncak kemenangan dirayakan dengan pengampunan, bukan pembalasan: itulah yang membuat kota yang menentang menjadi kota yang memeluk.",
    urutan: 24,
  },
  {
    tahun_hijriah: 10,
    tahun_masehi: 632,
    judul: "Haji Wada'",
    peristiwa:
      "Pada Dzulhijjah 10 H (632 M), beliau menunaikan haji bersama lebih dari seratus ribu jamaah — haji pertama dan terakhirnya setelah Hijrah. Pada 9 Dzulhijjah di Arafah, beliau menyampaikan khutbah perpisahan: darah, harta, dan kehormatan sesama haram dilanggar; hak perempuan dijaga; dan umat diminta berpegang pada Al-Qur'an dan Sunnah. Di hari-hari itu turun QS. Al-Ma'idah 5:3: \"Pada hari ini telah Kusempurnakan untukmu agamamu...\"",
    tempat: "Makkah – Arafah",
    hikmah:
      "Pesan terakhirnya bukan tentang kekuasaan, melainkan tentang menjaga sesama: darah, harta, dan kehormatan adalah garis yang tidak boleh dilanggar.",
    urutan: 25,
  },
  {
    tahun_hijriah: 11,
    tahun_masehi: 632,
    judul: "Wafat Nabi",
    peristiwa:
      "Pada Senin, 12 Rabiul Awal 11 H (632 M), setelah sakit sekitar dua pekan, Nabi Muhammad shallallahu 'alaihi wasallam wafat di rumah Aisyah, dalam usia 63 tahun. Kabar itu mengguncang Madinah; Umar sempat tidak percaya, sampai Abu Bakar berdiri dan berkata: \"Barangsiapa menyembah Muhammad, sesungguhnya Muhammad telah wafat; dan barangsiapa menyembah Allah, sesungguhnya Allah Maha Hidup dan tidak akan mati.\" Beliau dimakamkan di tempat wafatnya, dan umat memilih Abu Bakar sebagai khalifah pertama.",
    tempat: "Madinah (rumah Aisyah, di samping Masjid Nabawi)",
    hikmah:
      "Risalah tidak berhenti bersama wafatnya pembawa risalah: umat yang ditinggalkan sudah punya kitab, sunnah, dan pemimpin yang dipilih bersama.",
    urutan: 26,
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
console.log(`Siroh lengkap: ${DAFTAR.length} peristiwa diisi (urutan 1-26).`);
