import { db, cari } from "./db";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

Bun.serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);

    // API
    if (url.pathname === "/api/konten") {
      if (req.method === "GET")
        return json(db.query("SELECT * FROM konten ORDER BY id DESC").all());
      if (req.method === "POST") {
        const b = await req.json();
        if (!b.jenis || !b.judul || !b.isi)
          return json({ error: "jenis, judul, isi wajib" }, 400);
        db.query(
          "INSERT INTO konten (jenis, judul, isi, sumber, tag) VALUES (?, ?, ?, ?, ?)"
        ).run(b.jenis, b.judul, b.isi, b.sumber ?? null, b.tag ?? null);
        return json({ ok: true }, 201);
      }
    }
    if (url.pathname === "/api/cari") {
      const q = url.searchParams.get("q");
      if (!q) return json({ error: "parameter ?q= wajib" }, 400);
      return json(cari(q));
    }

    // Frontend: static files dari /public
    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      const file = Bun.file(`/opt/pangeling/siji/public${path}`);
      if (await file.exists()) return new Response(file);
    } catch {}
    return json({ error: "not found" }, 404);
  },
});

console.log("siji-pangeling jalan di :3001");
