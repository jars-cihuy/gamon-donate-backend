const crypto = require("crypto");
const store = require("../lib/store");
const { safeEqual, readBody } = require("../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: "WEBHOOK_SECRET belum di-set" });
  if (!safeEqual(req.query.key || "", secret)) return res.status(401).json({ error: "unauthorized" });

  try {
    const body = readBody(req);
    if (body.type && body.type !== "donation") return res.status(200).json({ ok: true, ignored: body.type });

    const d = store.normalize(
      {
        id: body.id || crypto.randomUUID(),
        donator_name: body.donator_name || "Anonymous",
        amount_raw: body.amount_raw ?? body.amount,
        message: body.message || "",
        created_at: body.created_at || new Date().toISOString(),
      },
      { created_at: new Date().toISOString() }
    );

    const err = store.validate(d);
    if (err) return res.status(400).json({ error: err });

    const created = await store.addNew(d);
    res.status(200).json({ ok: true, duplicate: !created });
  } catch (e) {
    console.error("saweria-webhook:", e);
    res.status(500).json({ error: "server_error" });
  }
};
