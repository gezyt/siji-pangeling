// Uji fungsi murni bangunBarisKata (scripts/import-kata.ts).
// Impor nyata TIDAK diuji di sini — ia butuh jaringan + DB asli,
// dan diuji terpisah dengan `bun run import:kata` ke salinan DB.
// Pelajaran dari impor tafsir: bun test memakai satu registry modul
// untuk semua berkas tes, jadi skrip impor TIDAK boleh menjalankan
// alur CLI saat diimpor (dijaga `if (import.meta.main)`).
import { describe, expect, test } from "bun:test";
import { bangunBarisKata } from "../scripts/import-kata";

function peta(): Map<string, number> {
  return new Map([
    ["1:1", 1],
    ["1:2", 2],
  ]);
}

function kata(urut: number, arab: string, arti: string, bahasa = "indonesian") {
  return { position: urut, char_type_name: "word", text_uthmani: arab, translation: { text: arti, language_name: bahasa } };
}

function akhir(urut: number, nomor: string) {
  return { position: urut, char_type_name: "end", text_uthmani: nomor, translation: { text: `(${nomor})`, language_name: "indonesian" } };
}

describe("bangunBarisKata", () => {
  test("jalan bahagia: 2 ayat, entri 'end' dilewati, urut dipertahankan", () => {
    const verses = [
      { verse_key: "1:1", verse_number: 1, words: [kata(1, "بِسْمِ", "dengan nama"), kata(2, "ٱللَّهِ", "Allah"), akhir(3, "١")] },
      { verse_key: "1:2", verse_number: 2, words: [kata(1, "ٱلْحَمْدُ", "pujian"), akhir(2, "٢")] },
    ];
    const baris = bangunBarisKata(1, verses as any, peta(), 2);
    expect(baris.length).toBe(3);
    expect(baris[0]).toEqual({ ayat_id: 1, urut: 1, arab: "بِسْمِ", arti: "dengan nama" });
    expect(baris[1]).toEqual({ ayat_id: 1, urut: 2, arab: "ٱللَّهِ", arti: "Allah" });
    expect(baris[2]).toEqual({ ayat_id: 2, urut: 1, arab: "ٱلْحَمْدُ", arti: "pujian" });
  });

  test("jumlah ayat tidak cocok -> throw", () => {
    const verses = [{ verse_key: "1:1", verse_number: 1, words: [kata(1, "بِسْمِ", "dengan nama")] }];
    expect(() => bangunBarisKata(1, verses as any, peta(), 2)).toThrow("jumlah ayat");
  });

  test("ayat tidak ada di peta -> throw", () => {
    const verses = [
      { verse_key: "1:1", verse_number: 1, words: [kata(1, "بِسْمِ", "dengan nama")] },
      { verse_key: "1:9", verse_number: 9, words: [kata(1, "x", "y")] },
    ];
    expect(() => bangunBarisKata(1, verses as any, peta(), 2)).toThrow("tidak ada di tabel ayat");
  });

  test("arti kosong -> throw", () => {
    const verses = [
      { verse_key: "1:1", verse_number: 1, words: [kata(1, "بِسْمِ", "   ")] },
      { verse_key: "1:2", verse_number: 2, words: [kata(1, "ٱلْحَمْدُ", "pujian")] },
    ];
    expect(() => bangunBarisKata(1, verses as any, peta(), 2)).toThrow("arti kosong");
  });

  test("bahasa arti bukan indonesian -> throw", () => {
    const verses = [
      { verse_key: "1:1", verse_number: 1, words: [kata(1, "بِسْمِ", "in the name", "english")] },
      { verse_key: "1:2", verse_number: 2, words: [kata(1, "ٱلْحَمْدُ", "pujian")] },
    ];
    expect(() => bangunBarisKata(1, verses as any, peta(), 2)).toThrow("bukan indonesian");
  });

  test("posisi kata ganda dalam satu ayat -> throw", () => {
    const verses = [
      { verse_key: "1:1", verse_number: 1, words: [kata(1, "بِسْمِ", "dengan nama"), kata(1, "ٱللَّهِ", "Allah")] },
      { verse_key: "1:2", verse_number: 2, words: [kata(1, "ٱلْحَمْدُ", "pujian")] },
    ];
    expect(() => bangunBarisKata(1, verses as any, peta(), 2)).toThrow("kata ganda");
  });

  test("ayat tanpa kata -> throw", () => {
    const verses = [
      { verse_key: "1:1", verse_number: 1, words: [] },
      { verse_key: "1:2", verse_number: 2, words: [kata(1, "ٱلْحَمْدُ", "pujian")] },
    ];
    expect(() => bangunBarisKata(1, verses as any, peta(), 2)).toThrow("tidak ada kata");
  });
});
