/* 传名单 / 对账共用计算。浏览器挂到 RosterMath，node 可 require。
 * 金额用分（整数）计算，避免 0.1 相加误差。
 * 队长/赠送：is_captain 与 is_gift 同时为真。人均为 0 的整组一律是赠送。
 * 对账金额不含这些人。发给助手买保险的名单仍包含他们。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RosterMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var PRESETS = {
    current: { rebate_80: "35", rebate_reduced: "20", rebate_foreign: "85" },
    early: { rebate_80: "35", rebate_reduced: "25", rebate_foreign: "0" }
  };

  function toCents(value) {
    if (value == null) return null;
    var s = String(value).replace(/,/g, "").replace(/元/g, "").replace(/\s/g, "").trim();
    if (!s) return null;
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    var neg = s.charAt(0) === "-";
    if (neg) s = s.slice(1);
    var bits = s.split(".");
    var yuan = bits[0];
    var frac = bits[1] || "";
    var padded = (frac + "000").slice(0, 3);
    var cents = Number(yuan) * 100 + Number(padded.slice(0, 2));
    if (Number(padded.charAt(2)) >= 5) cents += 1;
    if (!Number.isFinite(cents)) return null;
    return neg ? -cents : cents;
  }

  function fromCents(cents) {
    var n = Number(cents);
    if (!Number.isFinite(n)) return "";
    var sign = n < 0 ? "-" : "";
    var abs = Math.abs(n);
    var yuan = Math.floor(abs / 100);
    var frac = String(abs % 100).padStart(2, "0");
    if (frac === "00") return sign + String(yuan);
    return sign + yuan + "." + frac;
  }

  function isId18(s) {
    return /^[0-9]{17}[0-9Xx]$/.test(String(s || "").trim());
  }

  function id18ChecksumOk(id) {
    var s = String(id || "").trim().toUpperCase();
    if (!isId18(s)) return false;
    var w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    var c = "10X98765432";
    var sum = 0;
    for (var i = 0; i < 17; i++) sum += Number(s.charAt(i)) * w[i];
    return c.charAt(sum % 11) === s.charAt(17);
  }

  function looksLikeDateToken(tok) {
    var t = String(tok || "").trim();
    if (!t) return false;
    if (/^\d{1,2}\.\d{1,2}(\.\d{2,4})?$/.test(t)) return true;
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(t)) return true;
    if (/^\d{1,2}[-/]\d{1,2}$/.test(t)) return true;
    return false;
  }

  function shanghaiParts(now) {
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    var parts = fmt.formatToParts(now || new Date());
    var out = { year: 0, month: 0, day: 0 };
    parts.forEach(function (p) {
      if (p.type === "year") out.year = Number(p.value);
      if (p.type === "month") out.month = Number(p.value);
      if (p.type === "day") out.day = Number(p.value);
    });
    return out;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function isoFromParts(y, m, d) {
    if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return "";
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  function parseBatchDate(text, now) {
    var raw = String(text || "").trim();
    if (!raw) return { ok: false, error: "date_required" };
    var y;
    var m;
    var d;
    var full = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (full) {
      y = Number(full[1]);
      m = Number(full[2]);
      d = Number(full[3]);
    } else {
      var short = raw.match(/^(\d{1,2})[.\-/](\d{1,2})$/);
      if (!short) return { ok: false, error: "date_invalid" };
      y = shanghaiParts(now).year;
      m = Number(short[1]);
      d = Number(short[2]);
    }
    var dateIso = isoFromParts(y, m, d);
    if (!dateIso) return { ok: false, error: "date_invalid" };
    return { ok: true, batch_date: m + "." + d, date_iso: dateIso, year: y };
  }

  function shortDate(dateIso) {
    var parsed = parseBatchDate(dateIso);
    return parsed.ok ? parsed.batch_date : "";
  }

  function addIsoDays(iso, days) {
    var parsed = parseBatchDate(iso);
    if (!parsed.ok) return "";
    var n = Math.round(Number(days) || 0);
    var dt = new Date(Date.UTC(parsed.year, Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n));
    return isoFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  function inclusiveDays(startIso, endIso) {
    var start = parseBatchDate(startIso);
    var end = parseBatchDate(endIso);
    if (!start.ok || !end.ok) return 0;
    var a = Date.parse(start.date_iso + "T00:00:00Z");
    var b = Date.parse(end.date_iso + "T00:00:00Z");
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
    return Math.round((b - a) / 86400000) + 1;
  }

  /* 默认从名单日期的第二天起保，七宝常规保 3 天。止保日含起保当天。 */
  function defaultCoverage(rosterIso) {
    var start = addIsoDays(rosterIso, 1);
    if (!start) return { ok: false, error: "date_invalid" };
    var end = addIsoDays(start, 2);
    return { ok: true, cover_start: start, cover_days: 3, cover_end: end };
  }

  function coverageFromStartDays(startIso, days) {
    var start = parseBatchDate(startIso);
    var n = Math.round(Number(days));
    if (!start.ok || !Number.isFinite(n) || n < 1 || n > 60) return { ok: false, error: "cover_invalid" };
    return { ok: true, cover_start: start.date_iso, cover_days: n, cover_end: addIsoDays(start.date_iso, n - 1) };
  }

  function parseCoverSpan(label, rosterDateText, now) {
    var roster = parseBatchDate(rosterDateText, now);
    var raw = String(label || "").replace(/\s/g, "");
    if (!raw) {
      if (!roster.ok) return { ok: false, error: "cover_invalid" };
      var fallback = defaultCoverage(roster.date_iso);
      fallback.cover_label = "";
      return fallback;
    }
    var days = raw.match(/(\d{1,2})号?(?:[-~到至]|—)(\d{1,2})号?/);
    if (days && roster.ok) {
      var month = Number(roster.date_iso.slice(5, 7));
      var d1 = Number(days[1]);
      var d2 = Number(days[2]);
      var endMonth = month;
      var endYear = roster.year;
      if (d2 < d1) {
        endMonth += 1;
        if (endMonth > 12) { endMonth = 1; endYear += 1; }
      }
      var start = isoFromParts(roster.year, month, d1);
      var end = isoFromParts(endYear, endMonth, d2);
      var n = start && end ? inclusiveDays(start, end) : 0;
      if (!start || !end || n < 1) return { ok: false, error: "cover_invalid", cover_label: raw };
      return { ok: true, cover_start: start, cover_end: end, cover_days: n, cover_label: raw };
    }
    if (roster.ok) {
      var guessed = defaultCoverage(roster.date_iso);
      guessed.cover_label = raw;
      return guessed;
    }
    return { ok: false, error: "cover_invalid", cover_label: raw };
  }

  function coverageFromStartEnd(startIso, endIso) {
    var start = parseBatchDate(startIso);
    var end = parseBatchDate(endIso);
    if (!start.ok || !end.ok) return { ok: false, error: "cover_invalid" };
    var n = inclusiveDays(start.date_iso, end.date_iso);
    if (n < 1 || n > 60) return { ok: false, error: "cover_invalid" };
    return { ok: true, cover_start: start.date_iso, cover_days: n, cover_end: end.date_iso };
  }

  function deriveFromId(id) {
    var s = String(id || "").trim().toUpperCase();
    if (!isId18(s)) return { gender: "", birth: "" };
    var y = s.slice(6, 10);
    var m = s.slice(10, 12);
    var d = s.slice(12, 14);
    if (!(Number(y) >= 1900 && Number(y) <= 2100 && Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31)) {
      return { gender: "", birth: "" };
    }
    return { gender: Number(s.charAt(16)) % 2 === 0 ? "女" : "男", birth: y + "-" + m + "-" + d };
  }

  function splitLine(line) {
    var s = String(line || "").replace(/\u00a0/g, " ").trim();
    if (!s) return [];
    if (s.indexOf("\t") >= 0) return s.split("\t").map(function (x) { return x.trim(); });
    if (s.indexOf(",") >= 0 || s.indexOf("，") >= 0) {
      return s.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
    }
    return s.split(/\s+/).filter(Boolean);
  }

  function joinName(parts) {
    var kept = parts.filter(Boolean);
    if (!kept.length) return "";
    var latin = kept.some(function (p) { return /[A-Za-z]/.test(p); });
    return latin ? kept.join(" ") : kept.join("");
  }

  function isNumToken(t) {
    return /^\d+(\.\d+)?$/.test(String(t || ""));
  }

  function blankGroup() {
    return { route: "", per_person: "", hasMeta: false, guests: [] };
  }

  function readMeta(trailing) {
    var nums = [];
    var i = 0;
    while (i < trailing.length && nums.length < 3) {
      if (!trailing[i]) {
        i += 1;
        continue;
      }
      if (!isNumToken(trailing[i])) break;
      nums.push(trailing[i]);
      i += 1;
    }
    if (nums.length < 2) return null;
    var route = trailing.slice(i).filter(Boolean).join("");
    return { per_person: nums[1], route: route };
  }

  function markZeroRate(group) {
    var cents = toCents(group.per_person);
    var zero = cents === 0;
    (group.guests || []).forEach(function (g) {
      if (zero) {
        g.is_captain = true;
        g.is_gift = true;
        g.captain_locked = true;
      } else if (g.captain_locked) {
        g.captain_locked = false;
        if (!g.captain_manual) {
          g.is_captain = false;
          g.is_gift = false;
        }
      }
    });
    return group;
  }

  function parseRosterPaste(text) {
    var lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var groups = [];
    var rejects = [];
    var dateHint = "";
    var current = null;
    function flush() {
      if (current && current.guests.length) groups.push(current);
      current = null;
    }
    lines.forEach(function (line) {
      if (!String(line).trim()) {
        flush();
        return;
      }
      var parts = splitLine(line);
      while (parts.length && !parts[0]) parts = parts.slice(1);
      while (parts.length && looksLikeDateToken(parts[0])) {
        if (!dateHint) dateHint = parts[0];
        parts = parts.slice(1);
        while (parts.length && !parts[0]) parts = parts.slice(1);
      }
      if (!parts.length) return;
      var idIdx = -1;
      for (var i = 0; i < parts.length; i++) {
        if (isId18(String(parts[i]).replace(/\s+/g, ""))) {
          idIdx = i;
          break;
        }
      }
      if (idIdx < 0) {
        rejects.push(String(line).trim());
        return;
      }
      var idNo = String(parts[idIdx]).replace(/\s+/g, "").toUpperCase();
      var name = joinName(parts.slice(0, idIdx));
      var meta = readMeta(parts.slice(idIdx + 1));
      if (meta && current && current.guests.length && current.hasMeta) flush();
      if (!current) current = blankGroup();
      if (meta) {
        current.hasMeta = true;
        current.per_person = meta.per_person;
        if (meta.route) current.route = meta.route;
      }
      var warn = "";
      if (!name) warn = "缺姓名";
      else if (!id18ChecksumOk(idNo)) warn = "校验位不符，请核对";
      current.guests.push({
        name: name,
        id_no: idNo,
        id_type: "身份证",
        is_captain: false,
        is_gift: false,
        captain_manual: false,
        captain_locked: false,
        warn: warn
      });
    });
    flush();
    groups.forEach(markZeroRate);
    return { groups: groups, rejects: rejects, dateHint: dateHint };
  }

  function normalizeFuzzyText(text) {
    return String(text || "")
      .replace(/[０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xfee0); })
      .replace(/[ｘＸx]/g, "X")
      .replace(/(\d)\s+(?=\d)/g, "$1");
  }

  function fuzzyRosterText(text) {
    var norm = normalizeFuzzyText(text);
    var parsed = parseRosterPaste(norm);
    var found = parsed.groups.reduce(function (n, g) { return n + g.guests.length; }, 0);
    if (found) return parsed;
    var groups = [blankGroup()];
    var seen = {};
    var re = /([\u4e00-\u9fff·]{2,8})\s*([0-9]{17}[0-9X])/g;
    var match;
    while ((match = re.exec(norm))) {
      var idNo = match[2];
      if (seen[idNo]) continue;
      seen[idNo] = true;
      groups[0].guests.push({
        name: match[1].replace(/·/g, ""),
        id_no: idNo,
        id_type: "身份证",
        is_captain: false,
        is_gift: false,
        captain_manual: false,
        captain_locked: false,
        warn: id18ChecksumOk(idNo) ? "" : "校验位不符，请核对"
      });
    }
    if (!groups[0].guests.length) groups = [];
    return { groups: groups, rejects: parsed.rejects, dateHint: parsed.dateHint };
  }

  function groupsFromCells(rows) {
    var list = rows || [];
    var headerIdx = -1;
    var i;
    for (i = 0; i < list.length && i < 8; i++) {
      if (/身份证|客人名单|姓名/.test((list[i].cells || []).join(""))) {
        headerIdx = i;
        break;
      }
    }
    var col = { date: 0, name: 1, id: 2, per: 4, cover: 6 };
    if (headerIdx >= 0) {
      col = { date: -1, name: -1, id: -1, per: -1, cover: -1 };
      (list[headerIdx].cells || []).forEach(function (h, idx) {
        var name = String(h || "").replace(/\s/g, "");
        if (/日期/.test(name) && col.date < 0) col.date = idx;
        else if (/客人|姓名/.test(name) && col.name < 0) col.name = idx;
        else if (/身份证|证件号/.test(name) && col.id < 0) col.id = idx;
        else if (/人均|售卖/.test(name) && col.per < 0) col.per = idx;
        else if (/承包|承保/.test(name) && col.cover < 0) col.cover = idx;
      });
    }
    var groups = [];
    var current = null;
    var dateHint = "";
    var carriedDate = "";
    function flush() {
      if (current && current.guests.length) groups.push(current);
      current = null;
    }
    for (i = (headerIdx >= 0 ? headerIdx + 1 : 0); i < list.length; i++) {
      var row = list[i] || {};
      var cells = row.cells || [];
      if (!cells.join("").trim()) {
        flush();
        continue;
      }
      var dateCell = col.date >= 0 ? String(cells[col.date] || "").trim() : "";
      if (/^\d{5}$/.test(dateCell)) {
        var serial = new Date(Date.UTC(1899, 11, 30) + Number(dateCell) * 86400000);
        dateCell = (serial.getUTCMonth() + 1) + "." + serial.getUTCDate();
      }
      if (looksLikeDateToken(dateCell)) {
        if (carriedDate && dateCell !== carriedDate && current && current.guests.length) flush();
        carriedDate = dateCell;
        dateHint = dateHint || dateCell;
      }
      var idNo = "";
      var idAt = col.id;
      if (idAt >= 0 && isId18(String(cells[idAt] || "").replace(/\s+/g, ""))) {
        idNo = String(cells[idAt]).replace(/\s+/g, "").toUpperCase();
      } else {
        for (var c = 0; c < cells.length; c++) {
          var cand = String(cells[c] || "").replace(/\s+/g, "");
          if (isId18(cand)) { idNo = cand.toUpperCase(); idAt = c; break; }
        }
      }
      var coverCell = col.cover >= 0 ? String(cells[col.cover] || "").trim() : "";
      if (!idNo) {
        flush();
        continue;
      }
      var name = "";
      if (col.name >= 0 && cells[col.name]) name = String(cells[col.name]).trim();
      if (!name && idAt > 0) name = String(cells[idAt - 1] || "").trim();
      var per = col.per >= 0 ? String(cells[col.per] || "").trim() : "";
      if (per && current && current.guests.length && current.hasMeta) flush();
      if (!current) current = blankGroup();
      if (carriedDate && !current.batch_date) current.batch_date = carriedDate;
      if (per) {
        current.per_person = per;
        current.hasMeta = true;
      }
      if (coverCell) current.cover_label = current.cover_label || coverCell;
      var gift = !!row.yellow;
      current.guests.push({
        name: name,
        id_no: idNo,
        id_type: "身份证",
        is_captain: gift,
        is_gift: gift,
        captain_manual: gift,
        captain_locked: false,
        warn: id18ChecksumOk(idNo) ? "" : "校验位不符，请核对"
      });
    }
    flush();
    groups.forEach(markZeroRate);
    return { groups: groups, rejects: [], dateHint: dateHint };
  }

  function withDefaults(group, defaults) {
    var src = defaults || {};
    var copy = {
      route: group.route || "",
      per_person: group.per_person === 0 || group.per_person ? String(group.per_person) : "",
      cover_label: group.cover_label || "",
      batch_date: group.batch_date || "",
      hasMeta: !!group.hasMeta,
      guests: (group.guests || []).map(function (g) {
        return {
          name: g.name || "",
          id_no: g.id_no || "",
          id_type: g.id_type || "身份证",
          gender: g.gender || "",
          birth: g.birth || "",
          is_captain: !!g.is_captain,
          is_gift: !!g.is_gift,
          captain_manual: !!g.captain_manual,
          captain_locked: !!g.captain_locked,
          warn: g.warn || ""
        };
      })
    };
    if (!String(copy.route).trim() && src.route) copy.route = src.route;
    if (String(copy.per_person).trim() === "" && src.per_person != null && String(src.per_person).trim() !== "") {
      copy.per_person = String(src.per_person).trim();
    }
    return markZeroRate(copy);
  }

  /* 同一人、同一承保起止视为同一次购买。没有起止日期时才加上销售日期。 */
  function guestDedupeKey(guest) {
    var idNo = String(guest && guest.id_no || "").replace(/\s+/g, "").trim().toUpperCase();
    if (!idNo) return "";
    var start = String(guest.cover_start || "").slice(0, 10);
    var end = String(guest.cover_end || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return idNo + "|" + start + "|" + end;
    }
    return idNo + "|||" + String(guest.date_iso || "").slice(0, 10);
  }

  function selectNewGuests(guests, known, mode) {
    var seen = {};
    var kept = [];
    var skipped = [];
    var table = known || {};
    (guests || []).forEach(function (g) {
      var key = guestDedupeKey(g);
      var name = String(g.name || "").trim();
      if (!key) {
        skipped.push({ name: name, reason: "missing_id" });
        return;
      }
      if (seen[key]) {
        skipped.push({ name: name, id_no: g.id_no, reason: "duplicate_in_file" });
        return;
      }
      seen[key] = true;
      var status = table[key] || "";
      if (status === "purchased" || status === "submitted") {
        skipped.push({ name: name, id_no: g.id_no, reason: status === "purchased" ? "already_purchased" : "already_submitted" });
        return;
      }
      if (mode === "draft" && status === "draft") {
        skipped.push({ name: name, id_no: g.id_no, reason: "already_draft" });
        return;
      }
      kept.push(g);
    });
    return { kept: kept, skipped: skipped };
  }

  function summarizeGroup(group) {
    var per = toCents(group.per_person);
    var guests = (group.guests || []).map(function (g) {
      var gift = per === 0 || !!(g.is_captain || g.is_gift);
      var idNo = String(g.id_no || "").replace(/\s+/g, "").trim().toUpperCase();
      var derived = deriveFromId(idNo);
      return {
        name: String(g.name || "").trim(),
        id_no: idNo,
        id_type: String(g.id_type || (isId18(idNo) ? "身份证" : "护照")).trim() || "护照",
        gender: derived.gender || String(g.gender || "").trim(),
        birth: derived.birth || String(g.birth || "").trim(),
        is_captain: gift,
        is_gift: gift,
        warn: g.warn || ""
      };
    }).filter(function (g) { return g.name || g.id_no; });
    var giftCount = guests.filter(function (g) { return g.is_gift; }).length;
    var billable = guests.length - giftCount;
    var total = per == null ? null : per * billable;
    return {
      route: String(group.route || "").trim(),
      per_person: per == null ? "" : fromCents(per),
      per_person_cents: per,
      guests: guests,
      guest_count: guests.length,
      gift_headcount: giftCount,
      billable_headcount: billable,
      total_amount: total == null ? "" : fromCents(total)
    };
  }

  function aggregateForRecon(batches) {
    var out = {
      count_80: 0,
      count_reduced: 0,
      count_foreign: 0,
      gift_count: 0,
      insurance_count: 0,
      gifts: [],
      other: [],
      routes: []
    };
    (batches || []).forEach(function (b) {
      var route = String(b.route || "").trim();
      if (route && out.routes.indexOf(route) < 0) out.routes.push(route);
      var per = b.per_person_cents != null ? b.per_person_cents : toCents(b.per_person);
      (b.guests || []).forEach(function (g) {
        out.insurance_count += 1;
        if (g.is_gift || g.is_captain || per === 0) {
          out.gift_count += 1;
          out.gifts.push({ name: g.name || "", id_no: g.id_no || "", route: route });
          return;
        }
        if (per === 8000) out.count_80 += 1;
        else if (per === 6000) out.count_reduced += 1;
        else if (per === 16000) out.count_foreign += 1;
        else out.other.push({
          name: g.name || "",
          id_no: g.id_no || "",
          route: route,
          per_person: per == null ? "" : fromCents(per)
        });
      });
    });
    return out;
  }

  function numCents(value, fallback) {
    if (value == null || value === "") return fallback;
    var c = toCents(value);
    return c == null ? fallback : c;
  }

  function wholeCount(value) {
    var n = Number(String(value == null ? "" : value).trim());
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n);
  }

  /* 与清算表一致：
   * 80总额 = 80人数 × 80元档单价（默认 80）
   * 少总额 = 少人头 × 人头标准（默认 60）
   * 外籍总额 = 外籍人数 × 外籍标准（默认 160）
   * 合计金额 = 80总额 + 少总额 + 外籍总额
   * 系统当日金额 = 系统当日总额 − 系统前日总额（前日空按 0，和表里空白单元格一样）
   * 差额 = 系统当日金额 − 合计金额 + 手续费
   * 返款 = 80人数×返款系数 + 少人头×返款系数 + 外籍人数×返款系数 + 差异金额
   * 现行系数 35 / 20 / 85；表的前半段少人头系数是 25、外籍返款是 0。
   * 差异金额是手填列，差额是算出来的列，返款加的是差异金额。 */
  function computeRecon(input) {
    var src = input || {};
    var count80 = wholeCount(src.count_80);
    var countReduced = wholeCount(src.count_reduced);
    var countForeign = wholeCount(src.count_foreign);
    var rate80 = numCents(src.rate_80, 8000);
    var rateReduced = numCents(src.rate_reduced, 6000);
    var rateForeign = numCents(src.rate_foreign, 16000);
    var rebate80 = numCents(src.rebate_80, 3500);
    var rebateReduced = numCents(src.rebate_reduced, 2000);
    var rebateForeign = numCents(src.rebate_foreign, 8500);
    var systemTotal = numCents(src.system_total, 0);
    var systemPrev = numCents(src.system_prev, 0);
    var fee = numCents(src.fee, 0);
    var diffAmount = numCents(src.diff_amount, 0);
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
      rate_80: fromCents(rate80),
      rate_reduced: fromCents(rateReduced),
      rate_foreign: fromCents(rateForeign),
      rebate_80: fromCents(rebate80),
      rebate_reduced: fromCents(rebateReduced),
      rebate_foreign: fromCents(rebateForeign),
      amount_80: fromCents(amount80),
      amount_reduced: fromCents(amountReduced),
      amount_foreign: fromCents(amountForeign),
      total_amount: fromCents(total),
      system_total: fromCents(systemTotal),
      system_prev: fromCents(systemPrev),
      system_day: fromCents(systemDay),
      fee: fromCents(fee),
      raw_diff: fromCents(rawDiff),
      diff_amount: fromCents(diffAmount),
      diff_note: String(src.diff_note || "").trim(),
      refund_amount: fromCents(refund)
    };
  }

  return {
    PRESETS: PRESETS,
    toCents: toCents,
    fromCents: fromCents,
    isId18: isId18,
    id18ChecksumOk: id18ChecksumOk,
    parseBatchDate: parseBatchDate,
    shortDate: shortDate,
    addIsoDays: addIsoDays,
    defaultCoverage: defaultCoverage,
    parseCoverSpan: parseCoverSpan,
    coverageFromStartDays: coverageFromStartDays,
    coverageFromStartEnd: coverageFromStartEnd,
    deriveFromId: deriveFromId,
    parseRosterPaste: parseRosterPaste,
    fuzzyRosterText: fuzzyRosterText,
    groupsFromCells: groupsFromCells,
    withDefaults: withDefaults,
    summarizeGroup: summarizeGroup,
    guestDedupeKey: guestDedupeKey,
    selectNewGuests: selectNewGuests,
    markZeroRate: markZeroRate,
    aggregateForRecon: aggregateForRecon,
    computeRecon: computeRecon
  };
});
