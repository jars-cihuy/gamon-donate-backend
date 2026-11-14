const store = require("../lib/store");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const list = await store.listAll();
    res.status(200).json(store.buildPublic(list));
  } catch (e) {
    console.error("get-donations:", e);
    res.status(500).json({ error: "server_error" });
  }
};
