import { db, cari } from "./db";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

Bun.serve({
  port: 3001,
  routes: {
    "/": () => json({ app: "siji-pangeling", status: "ok" }),
    "/api/konten": {
      GET: () => json(db.query("SELECT * FROM konten ORDER BY id DESC").all()),
      POST: async (req: any) => {
        const b = await req.json();
        if (!b.jenis || !b.judul || !b.isi)
          return json({ error: "jenis, judul, isi wajib" }, 400);
        db.query(
          "INSERT INTO konten (jenis, judul, isi, sumber, tag) VALUES (?, ?, ?, ?, ?)"
        ).run(b.jenis, b.judul, b.isi, b.sumber ?? null, b.tag ?? null);
        return json({ ok: true }, 201);
      },
    },
    "/api/cari": (req: any) => {
      const q = new URL(req.url).searchParams.get("q");
      if (!q) return json({ error: "parameter ?q= wajib" }, 400);
      return json(cari(q));
    },
  },
  fetch: () => json({ error: "not found" }, 404),
});

console.log("siji-pangeling jalan di :3001");
