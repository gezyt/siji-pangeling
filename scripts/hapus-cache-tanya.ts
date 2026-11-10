// Hapus entri cache Tanya Jawab untuk pertanyaan-pertanyaan tertentu.
//
// Latar: jawaban "tidak ditemukan" tersimpan di tanya_cache selama
// 7 hari. Setelah jawaban baku ditambah atau retrieval diperbaiki,
// pertanyaan yang dulu ditolak harus dicari ulang — kalau tidak,
// cache terus mengembalikan penolakan lama. (Jawaban baku sendiri
// dicek SEBELUM cache, jadi keempat pertanyaan baku tidak butuh ini;
// skrip ini untuk redaksi lain yang jawabannya ikut membaik setelah
// perbaikan retrieval, mis. "hadits tentang niat beramal" yang dulu
// dijawab seadanya, dan "kursi dibandingkan dengan arsy..." yang dulu
// tidak menemukan sumber sama sekali.)
//
// Pakai: bun run hapus-cache-tanya
//   (atau: bun run hapus-cache-tanya "pertanyaan lain" — ditambahkan
//    ke daftar di bawah)
// Di VPS: cd /opt/pangeling/siji && bun run hapus-cache-tanya
// Tidak perlu restart service — cache dibaca dari database setiap ada
// pertanyaan masuk.
import { hapusTanyaCache } from "../src/db";
import { hashPertanyaan } from "../src/tanya";

const DAFTAR = [
  "Hadits tentang niat",
  "Siapa saja mustahik zakat?",
  "Siapa yang paling dicintai Allah?",
  "Apa makhluk yang paling besar?",
  "hadits tentang niat beramal",
  "kursi dibandingkan dengan arsy seperti cincin di padang pasir",
  // 2026-11-10: penolakan berparafrasa + 10 sumber tak relevan ikut
  // tersimpan di cache; hapus supaya pertanyaan ini dicari ulang
  // setelah perbaikan deteksi penolakan dan peta konsep korupsi.
  "carikan hadits tentang korupsi",
  ...process.argv.slice(2),
];

let hapus = 0;
let tidakAda = 0;
for (const q of DAFTAR) {
  if (hapusTanyaCache(hashPertanyaan(q))) {
    console.log(`dihapus: ${q}`);
    hapus++;
  } else {
    console.log(`tidak ada di cache: ${q}`);
    tidakAda++;
  }
}
console.log(`hapus cache tanya: ${hapus} dihapus, ${tidakAda} tidak ada`);
