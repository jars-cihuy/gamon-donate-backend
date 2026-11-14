const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const KEY = "gamon:donations";

async function redis(command) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error("Database belum terhubung (env Upstash/KV kosong)");
  }
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `Redis HTTP ${res.status}`);
  return json.result;
}

const MAX_AMOUNT = 2147483647;

function cleanText(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function normalize(input, base = {}) {
  const d = { ...base };
  if (input.id !== undefined) d.id = cleanText(input.id, 120);
  if (input.donator_name !== undefined || input.username !== undefined) {
    d.donator_name = cleanText(input.donator_name ?? input.username, 80) || "Anonymous";
  }
  if (input.amount_raw !== undefined || input.amount !== undefined) {
    d.amount_raw = Math.floor(Number(input.amount_raw ?? input.amount));
  }
  if (input.message !== undefined) d.message = cleanText(input.message, 300);
  if (input.target !== undefined) d.target = cleanText(input.target, 80);
  if (input.created_at !== undefined) {
    const t = new Date(input.created_at);
    if (!isNaN(t)) d.created_at = t.toISOString();
  }
  return d;
}

function validate(d) {
  if (!d.id) return "id kosong";
  if (!d.donator_name) return "nama donatur kosong";
  if (!Number.isInteger(d.amount_raw) || d.amount_raw < 1 || d.amount_raw > MAX_AMOUNT) {
    return "nominal harus angka bulat 1 - 2.147.483.647";
  }
  return null;
}

async function listAll() {
  const values = (await redis(["HVALS", KEY])) || [];
  const list = [];
  for (const v of values) {
    try { list.push(JSON.parse(v)); } catch { }
  }
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return list;
}

async function getOne(id) {
  const v = await redis(["HGET", KEY, id]);
  return v ? JSON.parse(v) : null;
}

async function addNew(d) {
  return (await redis(["HSETNX", KEY, d.id, JSON.stringify(d)])) === 1;
}

async function put(d) {
  await redis(["HSET", KEY, d.id, JSON.stringify(d)]);
}

async function remove(id) {
  return (await redis(["HDEL", KEY, id])) === 1;
}

function buildPublic(list) {
  const totals = new Map();
  for (const d of list) {
    const k = d.donator_name.toLowerCase();
    const cur = totals.get(k) || { name: d.donator_name, total: 0 };
    cur.total += d.amount_raw;
    totals.set(k, cur);
  }
  const top_donators = {};
  [...totals.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 100)
    .forEach((t) => { top_donators[t.name] = t.total; });

  const recent_donations = list.slice(0, 20).map((d) => ({
    id: d.id,
    username: d.donator_name,
    donator_name: d.donator_name,
    amount: d.amount_raw,
    amount_raw: d.amount_raw,
    message: d.message || "",
    target: d.target || "",
    created_at: d.created_at,
  }));
  return { recent_donations, top_donators };
}

module.exports = { listAll, getOne, addNew, put, remove, normalize, validate, buildPublic };
