import {
  db, cari, listKonten, hitungKonten, daftarJenis,
  listAyat, hitungAyat, getAyat, cariAyat,
  listHadits, hitungHadits, cariHadits,
  listSiroh, hitungSiroh, cariSiroh,
  listArtikel, hitungArtikel, cariArtikel, cariSemua,
} from "./db";
import { join, dirname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Folder public relatif terhadap root proyek, bukan hardcoded /opt/...
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const JENIS_RE = /^[a-z0-9-]{1,30}$/;

function ambilJenis(url: URL): string | undefined {
  const j = (url.searchParams.get("jenis") ?? "").trim().toLowerCase();
  if (!j || j === "semua") return undefined;
  if (!JENIS_RE.test(j)) return undefined;
  return j;
}

function ambilLimitOffset(url: URL) {
  return {
    limit: url.searchParams.get("limit") ?? "20",
    offset: url.searchParams.get("offset") ?? "0",
  };
}

function halaman(url: URL, data: unknown, total: number) {
  const { limit, offset } = ambilLimitOffset(url);
  return json({
    data,
    total,
    limit: Math.min(100, Math.max(1, Number(limit) || 20)),
    offset: Math.max(0, Number(offset) || 0),
  });
}

function ambilSurah(url: URL): number | undefined {
  const n = Number(url.searchParams.get("surah"));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

Bun.serve({
  // Hanya localhost: publik diakses lewat Caddy (reverse proxy).
  hostname: "127.0.0.1",
  port: process.env.PORT ? Number(process.env.PORT) : 3001,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health") return json({ ok: true });

    // API: daftar jenis untuk chip filter di frontend
    if (url.pathname === "/api/jenis" && req.method === "GET") {
      return json(daftarJenis());
    }

    // API: daftar konten, TERPAGINASI (bukan seluruh 6236 ayat sekaligus)
    if (url.pathname === "/api/konten") {
      if (req.method === "GET") {
        const limit = url.searchParams.get("limit") ?? "20";
        const offset = url.searchParams.get("offset") ?? "0";
        const jenis = ambilJenis(url);
        return json({
          data: listKonten(limit, offset, jenis),
          total: hitungKonten(jenis),
          limit: Math.min(100, Math.max(1, Number(limit) || 20)),
          offset: Math.max(0, Number(offset) || 0),
        });
      }
      if (req.method === "POST") {
        // POST tanpa auth adalah lubang lama: siapa pun bisa mengotori DB.
        // Aturan baru: POST hanya jalan bila SIJI_ADMIN_TOKEN disetel di
        // server DAN pemanggil mengirim header x-admin-token yang sama.
        // Bila token belum disetel, POST dinonaktifkan total (403).
        const token = process.env.SIJI_ADMIN_TOKEN;
        if (!token) {
          return json(
            { error: "POST dinonaktifkan: SIJI_ADMIN_TOKEN belum disetel di server" },
            403
          );
        }
        if (req.headers.get("x-admin-token") !== token) {
          return json({ error: "token admin tidak valid" }, 403);
        }
        let b: any;
        try {
          b = await req.json();
        } catch {
          return json({ error: "body JSON tidak valid" }, 400);
        }
        const jenis = String(b.jenis ?? "").trim().toLowerCase();
        const judul = String(b.judul ?? "").trim();
        const isi = String(b.isi ?? "").trim();
        if (!JENIS_RE.test(jenis) || !judul || !isi) {
          return json(
            { error: "jenis (huruf/angka/tanda -, maks 30), judul, isi wajib" },
            400
          );
        }
        if (judul.length > 300 || isi.length > 50000) {
          return json({ error: "judul maks 300 karakter, isi maks 50000 karakter" }, 400);
        }
        db.query(
          "INSERT INTO konten (jenis, judul, isi, sumber, tag) VALUES (?, ?, ?, ?, ?)"
        ).run(
          jenis,
          judul,
          isi,
          String(b.sumber ?? "").trim() || null,
          String(b.tag ?? "").trim() || null
        );
        return json({ ok: true }, 201);
      }
      return json({ error: "method tidak diizinkan" }, 405);
    }

    if (url.pathname === "/api/cari" && req.method === "GET") {
      const q = url.searchParams.get("q");
      if (!q) return json({ error: "parameter ?q= wajib" }, 400);
      return json(
        cari(q, ambilJenis(url), url.searchParams.get("limit") ?? "20", url.searchParams.get("offset") ?? "0")
      );
    }

    // API baru per modul (baca saja). Tanpa ?q= mengembalikan halaman
    // {data,total,limit,offset}; dengan ?q= mengembalikan array hasil
    // cari, sama seperti /api/cari lama.
    if (url.pathname === "/api/ayat" && req.method === "GET") {
      const { limit, offset } = ambilLimitOffset(url);
      const surah = ambilSurah(url);
      const ayatNo = Number(url.searchParams.get("ayat"));
      if (surah && Number.isFinite(ayatNo) && ayatNo > 0) {
        const satu = getAyat(surah, Math.floor(ayatNo));
        return satu ? json(satu) : json({ error: "ayat tidak ditemukan" }, 404);
      }
      const q = url.searchParams.get("q");
      if (q) return json(cariAyat(q, limit, offset, surah));
      return halaman(url, listAyat(limit, offset, surah), hitungAyat(surah));
    }

    if (url.pathname === "/api/hadits" && req.method === "GET") {
      const { limit, offset } = ambilLimitOffset(url);
      const kitab = url.searchParams.get("kitab") || undefined;
      const status = url.searchParams.get("status_sanad") || undefined;
      const q = url.searchParams.get("q");
      if (q) return json(cariHadits(q, limit, offset, kitab, status));
      return halaman(url, listHadits(limit, offset, kitab, status), hitungHadits(kitab, status));
    }

    if (url.pathname === "/api/siroh" && req.method === "GET") {
      const { limit, offset } = ambilLimitOffset(url);
      const q = url.searchParams.get("q");
      if (q) return json(cariSiroh(q, limit, offset));
      return halaman(url, listSiroh(limit, offset), hitungSiroh());
    }

    if (url.pathname === "/api/artikel" && req.method === "GET") {
      const { limit, offset } = ambilLimitOffset(url);
      const kategori = url.searchParams.get("kategori") || undefined;
      const q = url.searchParams.get("q");
      if (q) return json(cariArtikel(q, limit, offset, kategori));
      return halaman(url, listArtikel(limit, offset, kategori), hitungArtikel(kategori));
    }

    if (url.pathname === "/api/cari-semua" && req.method === "GET") {
      const q = url.searchParams.get("q");
      if (!q) return json({ error: "parameter ?q= wajib" }, 400);
      return json(cariSemua(q, url.searchParams.get("limit") ?? "20"));
    }

    if (url.pathname === "/api/modul" && req.method === "GET") {
      return json({
        ayat: hitungAyat(),
        hadits: hitungHadits(),
        siroh: hitungSiroh(),
        artikel: hitungArtikel(),
        konten: hitungKonten(),
      });
    }

    // Frontend: file statis, dengan pengaman traversal (../ tidak boleh
    // keluar dari folder public).
    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      const decoded = decodeURIComponent(path);
      const aman = normalize(join(publicDir, decoded));
      if (!aman.startsWith(publicDir + sep) && aman !== publicDir) {
        return json({ error: "not found" }, 404);
      }
      const file = Bun.file(aman);
      if (await file.exists()) return new Response(file);
    } catch {
      // jatuh ke 404 di bawah
    }
    return json({ error: "not found" }, 404);
  },
});

console.log(`siji-pangeling jalan di 127.0.0.1:${process.env.PORT ?? 3001} (lewat Caddy untuk publik)`);
