// Uji parser OpenITI + fungsi DB modul fiqh (scripts/import-fiqih.ts,
// src/db.ts). Impor nyata TIDAK diuji di sini — ia butuh jaringan dan
// diuji terpisah dengan `bun run import:fiqih` ke salinan DB.
// Catatan registry bersama (pelajaran P3): bun test memakai satu
// registry modul untuk semua berkas tes, jadi DB yang terikat bisa
// milik berkas tes lain. Karena itu uji DB di sini memakai kitab
// bernama khas ("Kitab Uji Fiqih") + kata kunci khas, dan menghapus
// baris kitab itu dulu supaya impor berulang tidak menabrak
// UNIQUE(kitab, urut).
import { test, expect, describe } from "bun:test";
import { unlinkSync } from "node:fs";

const TMP_DB = "/tmp/siji-fiqih-test.db";
process.env.SIJI_DB = TMP_DB;
for (const suf of ["", "-wal", "-shm"]) {
  try {
    unlinkSync(TMP_DB + suf);
  } catch {}
}

const dbMod: typeof import("../src/db") = await import("../src/db");
const fiqih: typeof import("../scripts/import-fiqih") = await import("../scripts/import-fiqih");

const META = `######OpenITI#
#META# 000.SortField\t:: JK_000119
#META# 010.AuthorAKA\t:: تقي الدين الحصني
#META#Header#End#
`;

/** Berkas contoh: nKitab kitab x nBab bab, tiap bagian 2 baris teks.
 *  Sengaja >= 100 bagian supaya lolos ambang validasi parser. */
function contohBerkas(nKitab = 11, nBab = 10): string {
  let s = META;
  s += " كتاب كفاية الأخيار في حل غاية الإختصار PageV01P001\n";
  for (let k = 1; k <= nKitab; k++) {
    s += `  ### |  |1 كتاب Uji${k}\n`;
    s += `  pendahuluan kitab ${k} tentang @QB@ الصبر @QE@ PageV01P002\n`;
    for (let b = 1; b <= nBab; b++) {
      s += `  ### || |2 باب Uji${k}-${b} Milestone300\n`;
      s += `  isi bab ${k}-${b} baris pertama\n`;
      s += `  isi bab ${k}-${b} baris kedua PageV01P003\n`;
    }
    if (k === 1) {
      s += " |2 فصل Uji Pasal\n";
      s += "  isi pasal satu baris\n";
    }
  }
  return s;
}

describe("bangunBarisFiqih", () => {
  test("jalan bahagia: 11 kitab x 10 bab + 1 pasal = 122 bagian, token markup dibuang", () => {
    const { baris, statistik } = fiqih.bangunBarisFiqih(contohBerkas());
    expect(statistik.kitab).toBe(11);
    expect(statistik.bab).toBe(110);
    expect(statistik.pasal).toBe(1);
    expect(statistik.bagian).toBe(122);
    expect(baris.length).toBe(122);
    // urut berurutan mulai 1
    expect(baris.map((b) => b.urut)).toEqual(baris.map((_, i) => i + 1));
    // pendahuluan kitab pertama: bab = judul kitab, pasal null
    expect(baris[0]!.bab).toBe("كتاب Uji1");
    expect(baris[0]!.pasal).toBeNull();
    expect(baris[0]!.teks).toBe("pendahuluan kitab 1 tentang الصبر");
    expect(baris[0]!.teks).not.toContain("PageV");
    expect(baris[0]!.teks).not.toContain("@QB@");
    // bab pertama kitab 1
    expect(baris[1]!.bab).toBe("باب Uji1-1");
    expect(baris[1]!.teks).toBe("isi bab 1-1 baris pertama isi bab 1-1 baris kedua");
    expect(baris[1]!.teks).not.toContain("Milestone");
    // pasal lepas di bawah bab terakhir kitab 1
    const pasal = baris.find((b) => b.pasal === "فصل Uji Pasal");
    expect(pasal).toBeDefined();
    expect(pasal!.bab).toBe("باب Uji1-10");
    expect(pasal!.teks).toBe("isi pasal satu baris");
    // semua baris memakai nama kitab + mazhab pilot
    expect(baris.every((b) => b.kitab === "Kifayat al-Akhyar" && b.mazhab === "Syafi'i")).toBe(true);
  });

  test("tanpa penanda akhir META -> throw", () => {
    expect(() => fiqih.bangunBarisFiqih("######OpenITI#\nisi saja\n")).toThrow("penanda akhir META");
  });

  test("header pertama bukan kitab -> throw", () => {
    const teks = META + "  ### || |2 باب Tanpa Kitab\n  isi bab\n";
    expect(() => fiqih.bangunBarisFiqih(teks)).toThrow("bukan kitab");
  });

  test("penanda ### tak dikenal -> throw", () => {
    const teks = META + "  ### |  |1 كتاب Uji1\n  ### | Bagian Tanpa Angka\n  isi\n";
    expect(() => fiqih.bangunBarisFiqih(teks)).toThrow("penanda ### tak dikenal");
  });

  test("terlalu sedikit bagian -> throw (penjaga format berubah)", () => {
    const teks = META + "  ### |  |1 كتاب Uji1\n  isi kitab\n";
    expect(() => fiqih.bangunBarisFiqih(teks)).toThrow("hanya 1 bagian");
  });
});

describe("fungsi DB fiqh", () => {
  const KITAB_UJI = "Kitab Uji Fiqih";
  const insert = dbMod.db.query(
    "INSERT INTO fiqh (kitab, mazhab, bab, pasal, teks, urut, sumber) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );

  test("list/hitung/cari/get/daftar kitab", () => {
    dbMod.db.query("DELETE FROM fiqh WHERE kitab = ?").run(KITAB_UJI);
    insert.run(KITAB_UJI, "Syafi'i", "كتاب الطهارة", null, "teks kunyitfiqih tentang air", 1, "uji");
    insert.run(KITAB_UJI, "Syafi'i", "باب أقسام المياه", null, "air suci mensucikan", 2, "uji");
    insert.run(KITAB_UJI, "Syafi'i", "باب أقسام المياه", "فصل Uji", "pasal tentang kunyitfiqih", 3, "uji");

    expect(dbMod.hitungFiqih(KITAB_UJI)).toBe(3);
    const daftar = dbMod.listFiqih(20, 0, KITAB_UJI) as any[];
    expect(daftar.length).toBe(3);
    expect(daftar[0]!.bab).toBe("كتاب الطهارة");
    expect(dbMod.daftarKitabFiqih()).toContain(KITAB_UJI);

    const cari = dbMod.cariFiqih("kunyitfiqih", 20, 0, KITAB_UJI);
    expect(cari.length).toBe(2);
    const satu = dbMod.getFiqih(cari[0].id);
    expect(satu.teks).toContain("kunyitfiqih");
    expect(dbMod.getFiqih(999999999)).toBeNull();
    expect(dbMod.cariFiqih("tidakadayangcocok123", 20, 0, KITAB_UJI)).toEqual([]);

    // Cerminan /api/surah: daftar bab + isi satu bab + satu bagian
    // lewat urutnya (tautan dalam #fiqih/{kitab}/{urut}).
    expect(dbMod.daftarBabFiqih(KITAB_UJI)).toEqual([
      { bab: "كتاب الطهارة", urut: 1 },
      { bab: "باب أقسام المياه", urut: 2 },
    ]);
    const bab = dbMod.listFiqihBab(KITAB_UJI, "باب أقسام المياه") as any[];
    expect(bab.length).toBe(2);
    expect(bab[0]!.urut).toBe(2);
    expect(bab[1]!.pasal).toBe("فصل Uji");
    expect(dbMod.getFiqihByUrut(KITAB_UJI, 3).pasal).toBe("فصل Uji");
    expect(dbMod.getFiqihByUrut(KITAB_UJI, 99)).toBeNull();
    expect(dbMod.listFiqihBab(KITAB_UJI, "باب yang tidak ada")).toEqual([]);

    dbMod.db.query("DELETE FROM fiqh WHERE kitab = ?").run(KITAB_UJI);
    expect(dbMod.hitungFiqih(KITAB_UJI)).toBe(0);
  });
});
