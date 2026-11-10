import { describe, expect, test } from "bun:test";
import { bangunBarisTafsir } from "../scripts/import-tafsir";

// Peta ayat palsu: surah 1 (7 ayat), id 1-7.
const peta = new Map<string, number>(
  Array.from({ length: 7 }, (_, i) => [`1:${i + 1}`, i + 1] as [string, number]),
);

function dataSurah1(teks = (n: number) => `Tafsir ayat ${n} yang panjang berparagraf.`) {
  return {
    nomor: 1,
    jumlahAyat: 7,
    tafsir: Array.from({ length: 7 }, (_, i) => ({ ayat: i + 1, teks: teks(i + 1) })),
  };
}

describe("bangunBarisTafsir", () => {
  test("surah lengkap -> 7 baris, tingkat mendalam, sumber Kemenag via equran.id", () => {
    const baris = bangunBarisTafsir(dataSurah1(), peta);
    expect(baris).toHaveLength(7);
    expect(baris[0]).toEqual({
      ayat_id: 1,
      tingkat: "mendalam",
      isi: "Tafsir ayat 1 yang panjang berparagraf.",
      sumber: "Tafsir Kemenag (via equran.id)",
    });
    expect(baris[6]!.ayat_id).toBe(7);
  });

  test("jumlah entri != jumlahAyat -> throw", () => {
    const data = dataSurah1();
    data.tafsir = data.tafsir.slice(0, 6);
    expect(() => bangunBarisTafsir(data, peta)).toThrow("6 != jumlahAyat 7");
  });

  test("teks kosong -> throw", () => {
    const data = dataSurah1((n) => (n === 3 ? "   " : `Tafsir ayat ${n}.`));
    expect(() => bangunBarisTafsir(data, peta)).toThrow("ayat 3: teks tafsir kosong");
  });

  test("ayat tidak ada di peta -> throw", () => {
    const petaKecil = new Map(peta);
    petaKecil.delete("1:5");
    expect(() => bangunBarisTafsir(dataSurah1(), petaKecil)).toThrow(
      "ayat 5: tidak ada di tabel ayat",
    );
  });

  test("respons tanpa daftar tafsir -> throw", () => {
    expect(() => bangunBarisTafsir({ nomor: 1, jumlahAyat: 7, tafsir: null as any }, peta)).toThrow(
      "tidak berisi daftar tafsir",
    );
  });
});
