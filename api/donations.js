const crypto = require("crypto");
const store = require("../lib/store");
const { isAdmin, readBody } = require("../lib/auth");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: "ADMIN_PASSWORD belum di-set" });
  if (!isAdmin(req)) return res.status(401).json({ error: "Password salah" });

  try {
    const id = req.query.id;

    if (req.method === "GET") {
      const list = await store.listAll();
      const total = list.reduce((s, d) => s + d.amount_raw, 0);
      return res.status(200).json({ donations: list, count: list.length, total });
    }

    if (req.method === "POST") {
      const d = store.normalize(
        { ...readBody(req), id: crypto.randomUUID() },
        { created_at: new Date().toISOString() }
      );
      const err = store.validate(d);
      if (err) return res.status(400).json({ error: err });
      await store.addNew(d);
      return res.status(201).json({ ok: true, donation: d });
    }

    if (!id) return res.status(400).json({ error: "id wajib" });

    if (req.method === "PUT") {
      const old = await store.getOne(id);
      if (!old) return res.status(404).json({ error: "tidak ditemukan" });
      const input = readBody(req);
      delete input.id;
      const d = store.normalize(input, old);
      const err = store.validate(d);
      if (err) return res.status(400).json({ error: err });
      await store.put(d);
      return res.status(200).json({ ok: true, donation: d });
    }

    if (req.method === "DELETE") {
      const ok = await store.remove(id);
      return res.status(ok ? 200 : 404).json({ ok });
    }

    res.status(405).json({ error: "method_not_allowed" });
  } catch (e) {
    console.error("donations:", e);
    res.status(500).json({ error: "server_error" });
  }
};
