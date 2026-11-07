/* Inserted into tourism-kb-id-ocr legacy fetch.
 * Stores 传名单 and 对账 in D1, then notifies 总助 with the existing
 * 保险名单通知 webhook. Does not call chinatourins.com and does not place
 * an insurance order. Money math matches roster-math.js. */
async function handleRosterRecon(request, env, url, origin, cors) {
  if (url.pathname !== "/roster" && url.pathname !== "/recon") return null;
  if (!originAllowed2(env, origin) && origin !== "") {
    return json3({ ok: false, error: "origin_not_allowed" }, 403, cors);
  }
  if (!checkAuth(request, env)) {
    return json3({ ok: false, error: "unauthorized" }, 401, cors);
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return json3({ ok: false, error: "method_not_allowed" }, 405, cors);
  }
  if (!env.DB) return json3({ ok: false, error: "d1_not_configured" }, 503, cors);
  try {
    await ensureRosterSchema(env);
  } catch (err) {
    return json3({ ok: false, error: "d1_schema_failed", detail: String(err && err.message || err) }, 502, cors);
  }
  try {
    if (url.pathname === "/roster" && request.method === "POST") return await postRoster(request, env, cors);
    if (url.pathname === "/roster" && request.method === "GET") return await getRoster(url, env, cors);
    if (url.pathname === "/recon" && request.method === "POST") return await postRecon(request, env, cors);
    if (url.pathname === "/recon" && request.method === "GET") return await getRecon(url, env, cors);
  } catch (err) {
    return json3({ ok: false, error: "roster_failed", detail: String(err && err.message || err) }, 502, cors);
  }
  return json3({ ok: false, error: "not_found" }, 404, cors);
}

var rosterSchemaReady = false;
async function ensureRosterSchema(env) {
  if (rosterSchemaReady) return;
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS signed_rosters (" +
    "id TEXT PRIMARY KEY, batch_date TEXT NOT NULL, date_iso TEXT NOT NULL DEFAULT '', " +
    "route TEXT NOT NULL, per_person TEXT NOT NULL, guest_count INTEGER NOT NULL, " +
    "billable_headcount INTEGER NOT NULL, gift_headcount INTEGER NOT NULL, total_amount TEXT NOT NULL, " +
    "account TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', payload_json TEXT NOT NULL, submitted_at TEXT NOT NULL)"
  ).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS signed_rosters_date_iso ON signed_rosters(date_iso)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS signed_rosters_submitted ON signed_rosters(submitted_at)").run();
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS recon_days (" +
    "date_iso TEXT PRIMARY KEY, batch_date TEXT NOT NULL, payload_json TEXT NOT NULL, " +
    "total_amount TEXT NOT NULL, refund_amount TEXT NOT NULL, account TEXT NOT NULL, updated_at TEXT NOT NULL)"
  ).run();
  rosterSchemaReady = true;
}

function rosterCents(value) {
  if (value == null) return null;
  var s = String(value).replace(/,/g, "").replace(/元/g, "").replace(/\s/g, "").trim();
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  var neg = s.charAt(0) === "-";
  if (neg) s = s.slice(1);
  var bits = s.split(".");
  var padded = ((bits[1] || "") + "000").slice(0, 3);
  var cents = Number(bits[0]) * 100 + Number(padded.slice(0, 2));
  if (Number(padded.charAt(2)) >= 5) cents += 1;
  if (!Number.isFinite(cents)) return null;
  return neg ? -cents : cents;
}

function rosterYuan(cents) {
  var n = Number(cents);
  var sign = n < 0 ? "-" : "";
  var abs = Math.abs(n);
  var yuan = Math.floor(abs / 100);
  var frac = String(abs % 100).padStart(2, "0");
  return frac === "00" ? sign + String(yuan) : sign + yuan + "." + frac;
}

function rosterCount(value) {
  var n = Number(String(value == null ? "" : value).trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(5000, Math.round(n));
}

function rosterCentsOr(value, fallback) {
  if (value == null || value === "") return fallback;
  var c = rosterCents(value);
  return c == null ? fallback : c;
}

function computeReconRecord(src) {
  var count80 = rosterCount(src.count_80);
  var countReduced = rosterCount(src.count_reduced);
  var countForeign = rosterCount(src.count_foreign);
  var rate80 = rosterCentsOr(src.rate_80, 8000);
  var rateReduced = rosterCentsOr(src.rate_reduced, 6000);
  var rateForeign = rosterCentsOr(src.rate_foreign, 16000);
  var rebate80 = rosterCentsOr(src.rebate_80, 3500);
  var rebateReduced = rosterCentsOr(src.rebate_reduced, 2000);
  var rebateForeign = rosterCentsOr(src.rebate_foreign, 8500);
  var systemTotal = rosterCentsOr(src.system_total, 0);
  var systemPrev = rosterCentsOr(src.system_prev, 0);
  var fee = rosterCentsOr(src.fee, 0);
  var diffAmount = rosterCentsOr(src.diff_amount, 0);
  var amount80 = count80 * rate80;
  var amountReduced = countReduced * rateReduced;
  var amountForeign = countForeign * rateForeign;
  var total = amount80 + amountReduced + amountForeign;
  var systemDay = systemTotal - systemPrev;
  var rawDiff = systemDay - total + fee;
  var refund = count80 * rebate80 + countReduced * rebateReduced + countForeign * rebateForeign + diffAmount;
  return {
    count_80: count80,
    count_reduced: countReduced,
    count_foreign: countForeign,
    rate_80: rosterYuan(rate80),
    rate_reduced: rosterYuan(rateReduced),
    rate_foreign: rosterYuan(rateForeign),
    rebate_80: rosterYuan(rebate80),
    rebate_reduced: rosterYuan(rebateReduced),
    rebate_foreign: rosterYuan(rebateForeign),
    amount_80: rosterYuan(amount80),
    amount_reduced: rosterYuan(amountReduced),
    amount_foreign: rosterYuan(amountForeign),
    total_amount: rosterYuan(total),
    system_total: rosterYuan(systemTotal),
    system_prev: rosterYuan(systemPrev),
    system_day: rosterYuan(systemDay),
    fee: rosterYuan(fee),
    raw_diff: rosterYuan(rawDiff),
    diff_amount: rosterYuan(diffAmount),
    diff_note: String(src.diff_note || "").trim().slice(0, 200),
    refund_amount: rosterYuan(refund)
  };
}

function validDateIso(value) {
  var s = String(value || "").trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  var y = Number(m[1]);
  var mo = Number(m[2]);
  var d = Number(m[3]);
  var dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "";
  return s;
}

function batchLabel(dateIso) {
  var m = String(dateIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return Number(m[2]) + "." + Number(m[3]);
}

function addIsoDays(iso, days) {
  var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  var dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  var y = dt.getUTCFullYear();
  var mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  var d = String(dt.getUTCDate()).padStart(2, "0");
  return y + "-" + mo + "-" + d;
}

function inclusiveDays(start, end) {
  var a = Date.parse(start + "T00:00:00Z");
  var b = Date.parse(end + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

function resolveCoverage(body, rosterIso) {
  var start = validDateIso(body.cover_start || body.depart || "");
  var end = validDateIso(body.cover_end || body.return_date || "");
  if (!start) start = addIsoDays(rosterIso, 1);
  if (!start) return null;
  if (end) {
    var fromEnd = inclusiveDays(start, end);
    if (fromEnd < 1 || fromEnd > 60) return null;
    return { cover_start: start, cover_end: end, cover_days: fromEnd };
  }
  var days = Math.round(Number(body.cover_days));
  if (!Number.isFinite(days) || days === 0) days = 3;
  if (days < 1 || days > 60) return null;
  return { cover_start: start, cover_days: days, cover_end: addIsoDays(start, days - 1) };
}

function deriveRosterId(idNo) {
  var s = String(idNo || "").toUpperCase();
  if (!/^\d{17}[\dX]$/.test(s)) return { gender: "", birth: "" };
  var y = s.slice(6, 10);
  var m = s.slice(10, 12);
  var d = s.slice(12, 14);
  if (!(Number(y) >= 1900 && Number(y) <= 2100 && Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31)) {
    return { gender: "", birth: "" };
  }
  return { gender: Number(s.charAt(16)) % 2 === 0 ? "女" : "男", birth: y + "-" + m + "-" + d };
}

async function readJson(request) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > 700000) {
    const err = new Error("body_too_large");
    err.code = "body_too_large";
    throw err;
  }
  return await request.json();
}

function normalizeRosterGuests(body, perCents) {
  const input = Array.isArray(body.guests) ? body.guests : [];
  const guests = [];
  for (let i = 0; i < input.length && guests.length < 500; i++) {
    const g = input[i] || {};
    const name = String(g.name || "").trim().slice(0, 60);
    const idNo = String(g.id_no || g.idNo || "").replace(/\s+/g, "").trim().toUpperCase().slice(0, 32);
    if (!name || !idNo) continue;
    if (!/^[0-9A-Z]{5,24}$/.test(idNo)) continue;
    const gift = perCents === 0 || !!(g.is_captain || g.is_gift || g.isCaptain || g.isGift);
    const demo = deriveRosterId(idNo);
    guests.push({
      seq: guests.length + 1,
      name: name,
      id_no: idNo,
      id_type: String(g.id_type || (/^\d{17}[\dX]$/.test(idNo) ? "身份证" : "其他")).trim().slice(0, 20) || "身份证",
      gender: demo.gender || String(g.gender || "").trim().slice(0, 4),
      birth: demo.birth || String(g.birth || "").trim().slice(0, 10),
      is_captain: gift,
      is_gift: gift
    });
  }
  return guests;
}

async function postRoster(request, env, cors) {
  let body;
  try { body = await readJson(request); }
  catch (err) {
    const code = err && err.code === "body_too_large" ? "body_too_large" : "invalid_json";
    return json3({ ok: false, error: code }, 400, cors);
  }
  const dateIso = validDateIso(body.date_iso || body.date);
  const batchDate = String(body.date || body.batch_date || "").trim().slice(0, 32) || batchLabel(dateIso);
  if (!dateIso) return json3({ ok: false, error: "date_required" }, 400, cors);
  const route = String(body.route || "").trim().slice(0, 80);
  if (!route) return json3({ ok: false, error: "route_required" }, 400, cors);
  const perCents = rosterCents(body.per_person);
  if (perCents == null || perCents < 0) return json3({ ok: false, error: "per_person_required" }, 400, cors);
  const guests = normalizeRosterGuests(body, perCents);
  if (!guests.length) return json3({ ok: false, error: "guests_required" }, 400, cors);
  const cover = resolveCoverage(body, dateIso);
  if (!cover) return json3({ ok: false, error: "cover_invalid" }, 400, cors);
  const giftCount = guests.filter((g) => g.is_gift).length;
  const billable = guests.length - giftCount;
  const totalCents = perCents * billable;
  const now = new Date().toISOString();
  const id = "ros_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  const record = {
    id: id,
    type: "signed_roster",
    purpose: "assistant_insurance_purchase",
    auto_order: false,
    date: batchDate,
    date_iso: dateIso,
    route: route,
    cover_start: cover.cover_start,
    cover_end: cover.cover_end,
    cover_days: cover.cover_days,
    per_person: rosterYuan(perCents),
    guest_count: guests.length,
    billable_headcount: billable,
    gift_headcount: giftCount,
    total_amount: rosterYuan(totalCents),
    account: String(body.account || "").trim().slice(0, 64) || "(未填)",
    note: String(body.note || "").trim().slice(0, 200),
    guests: guests,
    raw_paste: String(body.raw_paste || "").slice(0, 20000),
    submitted_at: now,
    source: "roster-upload",
    delivered: false,
    webhook_configured: false
  };
  await env.DB.prepare(
    "INSERT INTO signed_rosters (id, batch_date, date_iso, route, per_person, guest_count, billable_headcount, gift_headcount, total_amount, account, note, payload_json, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, batchDate, dateIso, route, record.per_person, guests.length, billable, giftCount, record.total_amount, record.account, record.note, JSON.stringify(record), now).run();
  const delivery = await notifyRosterAssistant(env, record);
  record.delivered = !!delivery.delivered;
  record.webhook_configured = !!delivery.webhook_configured;
  record.delivery_status = delivery.status || 0;
  record.delivery_error = delivery.error || "";
  try {
    await env.DB.prepare("UPDATE signed_rosters SET payload_json = ? WHERE id = ?").bind(JSON.stringify(record), id).run();
  } catch (_) {}
  return json3({
    ok: true,
    id: id,
    sent_to_assistant: record.delivered,
    delivered: record.delivered,
    webhook_configured: record.webhook_configured,
    auto_order: false,
    record: record
  }, 200, cors);
}

function rosterNoticeText(record) {
  const lines = record.guests.map((g) => [g.seq || "", g.name || "", g.id_type || "", g.id_no || "", g.gender || "", g.birth || ""].join("\t"));
  const captains = record.guests.filter((g) => g.is_gift).map((g) => (g.name || "") + "\t" + (g.id_no || ""));
  return [
    "[保险名单通知]",
    "来源=传名单",
    "id=" + record.id,
    "账号=" + record.account,
    "人数=" + record.guest_count,
    "出团=" + record.cover_start,
    "回团=" + record.cover_end,
    "名单日期=" + record.date,
    "参加线路=" + record.route,
    "起保日=" + record.cover_start,
    "止保日=" + record.cover_end,
    "承保天数=" + record.cover_days,
    "人均=" + record.per_person,
    "对账人数=" + record.billable_headcount,
    "对账总金额=" + record.total_amount,
    "队长赠送=" + record.gift_headcount + "（买保险要包含，对账不计）",
    "时间=" + record.submitted_at,
    "说明=" + (record.note || ""),
    "自动下单=否",
    "名单=",
    lines.join("\n"),
    captains.length ? "队长赠送名单=\n" + captains.join("\n") : ""
  ].filter(Boolean).join("\n");
}

async function notifyRosterAssistant(env, record) {
  const whUrl = String(env.INSURANCE_ROUTINE_WEBHOOK_URL || "").trim();
  const whHeaders = insuranceWebhookAuthHeaders(env);
  const configured = !!(whUrl && whHeaders);
  if (!configured) return { delivered: false, webhook_configured: false, error: "webhook_not_configured" };
  const payload = {
    type: "insurance_list",
    event: "insurance_list_submitted",
    source: "tourism-kb-id-ocr",
    via: "roster",
    auto_order: false,
    id: record.id,
    account: record.account,
    depart: record.cover_start,
    return_date: record.cover_end,
    cover_start: record.cover_start,
    cover_end: record.cover_end,
    cover_days: record.cover_days,
    roster_date: record.date,
    date_iso: record.date_iso,
    route: record.route,
    per_person: record.per_person,
    billable_headcount: record.billable_headcount,
    gift_headcount: record.gift_headcount,
    total_amount: record.total_amount,
    note: record.note,
    guests: record.guests,
    guest_count: record.guest_count,
    submitted_at: record.submitted_at,
    text: rosterNoticeText(record)
  };
  const delivery = await postWebhookWithRetry(whUrl, whHeaders, payload);
  try {
    if (env.DRAFTS) {
      await env.DRAFTS.put("meta:v1:last_roster_webhook", JSON.stringify({
        at: new Date().toISOString(),
        via: "roster",
        id: record.id,
        delivery: delivery
      }), { expirationTtl: 60 * 60 * 24 * 14 });
    }
  } catch (_) {}
  return {
    delivered: !!(delivery && delivery.ok),
    webhook_configured: true,
    status: delivery && delivery.status,
    error: delivery && delivery.ok ? "" : (delivery && delivery.error || "webhook_failed")
  };
}

function parsePayloadRows(rows) {
  const out = [];
  for (const row of rows || []) {
    try { out.push(JSON.parse(row.payload_json)); } catch (_) {}
  }
  return out;
}

async function getRoster(url, env, cors) {
  const id = String(url.searchParams.get("id") || "").trim();
  if (id) {
    if (!/^ros_[A-Za-z0-9_]{4,40}$/.test(id)) return json3({ ok: false, error: "not_found" }, 404, cors);
    const row = await env.DB.prepare("SELECT payload_json FROM signed_rosters WHERE id = ?").bind(id).first();
    if (!row) return json3({ ok: false, error: "not_found" }, 404, cors);
    return json3({ ok: true, record: JSON.parse(row.payload_json) }, 200, cors);
  }
  const dateIso = validDateIso(url.searchParams.get("date_iso") || url.searchParams.get("date") || "");
  if (dateIso) {
    const listed = await env.DB.prepare(
      "SELECT payload_json FROM signed_rosters WHERE date_iso = ? ORDER BY submitted_at ASC LIMIT 200"
    ).bind(dateIso).all();
    return json3({ ok: true, date_iso: dateIso, batches: parsePayloadRows(listed.results) }, 200, cors);
  }
  const recent = await env.DB.prepare(
    "SELECT payload_json FROM signed_rosters ORDER BY submitted_at DESC LIMIT 20"
  ).all();
  const batches = parsePayloadRows(recent.results).map((rec) => {
    const copy = Object.assign({}, rec);
    delete copy.raw_paste;
    return copy;
  });
  return json3({ ok: true, batches: batches }, 200, cors);
}

async function postRecon(request, env, cors) {
  let body;
  try { body = await readJson(request); }
  catch (err) {
    const code = err && err.code === "body_too_large" ? "body_too_large" : "invalid_json";
    return json3({ ok: false, error: code }, 400, cors);
  }
  const dateIso = validDateIso(body.date_iso || body.date);
  if (!dateIso) return json3({ ok: false, error: "date_required" }, 400, cors);
  const math = computeReconRecord(body);
  const now = new Date().toISOString();
  const record = Object.assign({}, math, {
    type: "recon_day",
    date_iso: dateIso,
    date: String(body.date || "").trim().slice(0, 32) || batchLabel(dateIso),
    account: String(body.account || "").trim().slice(0, 64) || "(未填)",
    gift_count: rosterCount(body.gift_count),
    insurance_count: rosterCount(body.insurance_count),
    other_count: rosterCount(body.other_count),
    routes: Array.isArray(body.routes) ? body.routes.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 40) : [],
    updated_at: now,
    source: "recon-page",
    captains_excluded: true
  });
  await env.DB.prepare(
    "INSERT INTO recon_days (date_iso, batch_date, payload_json, total_amount, refund_amount, account, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(date_iso) DO UPDATE SET batch_date = excluded.batch_date, payload_json = excluded.payload_json, total_amount = excluded.total_amount, refund_amount = excluded.refund_amount, account = excluded.account, updated_at = excluded.updated_at"
  ).bind(dateIso, record.date, JSON.stringify(record), record.total_amount, record.refund_amount, record.account, now).run();
  return json3({ ok: true, record: record }, 200, cors);
}

async function getRecon(url, env, cors) {
  const dateIso = validDateIso(url.searchParams.get("date_iso") || url.searchParams.get("date") || "");
  if (!dateIso) {
    const listed = await env.DB.prepare(
      "SELECT date_iso, batch_date, total_amount, refund_amount, account, updated_at FROM recon_days ORDER BY date_iso DESC LIMIT 60"
    ).all();
    return json3({ ok: true, days: listed.results || [] }, 200, cors);
  }
  const row = await env.DB.prepare("SELECT payload_json FROM recon_days WHERE date_iso = ?").bind(dateIso).first();
  const prev = await env.DB.prepare(
    "SELECT date_iso, payload_json FROM recon_days WHERE date_iso < ? ORDER BY date_iso DESC LIMIT 1"
  ).bind(dateIso).first();
  let previous = null;
  if (prev) {
    try {
      const rec = JSON.parse(prev.payload_json);
      previous = { date_iso: prev.date_iso, system_total: rec.system_total || "" };
    } catch (_) {}
  }
  let record = null;
  if (row) {
    try { record = JSON.parse(row.payload_json); } catch (_) {}
  }
  return json3({ ok: true, date_iso: dateIso, record: record, previous: previous }, 200, cors);
}
