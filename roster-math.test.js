const assert = require("assert");
const fs = require("fs");
const M = require("./roster-math.js");

const NOW = new Date("2026-11-07T04:00:00Z");

function eq(actual, expected, label) {
  assert.strictEqual(actual, expected, label + " → " + actual + " !== " + expected);
}

const d = M.parseBatchDate("11.6", NOW);
eq(d.ok, true, "11.6 ok");
eq(d.date_iso, "2026-11-06", "11.6 iso");
eq(d.batch_date, "11.6", "11.6 label");
eq(M.parseBatchDate("2025-10-05", NOW).date_iso, "2025-10-05", "full date keeps year");
eq(M.parseBatchDate("2026-02-31", NOW).ok, false, "bad day");

const nov6Path = "/home/ubuntu/.cursor/projects/agent-repos-tourism-kb-mingdan/uploads/nov6_paste_a079.txt";
if (fs.existsSync(nov6Path)) {
  const parsed = M.parseRosterPaste(fs.readFileSync(nov6Path, "utf8"));
  eq(parsed.groups.length, 1, "nov6 one group");
  eq(parsed.groups[0].guests.length, 35, "nov6 guest count");
  eq(parsed.rejects.length, 0, "nov6 no rejects");
}

const captainPaste = [
  "11.6\t周永恩\t231011195603290330\t0\t0\t0\t九五6-9",
  "\t田雪松\t231011195605150323",
  "",
  "\t戴土妹\t320511196409061529\t0\t0\t0\t九五6-9",
  "\t王萍\t320503195510062564",
  "",
  "\t魏艳丽\t140411199705204883\t0\t0\t0\t纯享6-9",
  "\t李天佑\t140429199703150416"
].join("\n");
const captains = M.parseRosterPaste(captainPaste);
eq(captains.dateHint, "11.6", "captain date hint");
eq(captains.groups.length, 3, "three captain groups");
captains.groups.forEach(function (g, i) {
  const s = M.summarizeGroup(g);
  eq(s.guest_count, 2, "captain group size " + i);
  eq(s.billable_headcount, 0, "captain billable " + i);
  eq(s.gift_headcount, 2, "captain gifts " + i);
  eq(s.total_amount, "0", "captain total " + i);
  eq(s.guests.every(function (p) { return p.is_captain && p.is_gift; }), true, "flags " + i);
});
eq(captains.groups[0].route, "九五6-9", "route 1");
eq(captains.groups[2].route, "纯享6-9", "route 3");

const payParsed = M.parseRosterPaste([
  "卜秀芳\t440301195504285618\t2\t80\t160\t九五1-4",
  "林碧芳\t440301195812236965",
  "WU XIAO QI PB1139652"
].join("\n"));
eq(payParsed.rejects.length, 1, "passport line is not auto-parsed");
const pay = M.summarizeGroup(M.withDefaults(payParsed.groups[0], { route: "忽略", per_person: "60" }));
eq(pay.route, "九五1-4", "excel route wins");
eq(pay.per_person, "80", "excel price wins");
eq(pay.guest_count, 2, "passport-less row rejected separately");
eq(pay.billable_headcount, 2, "paying headcount");
eq(pay.total_amount, "160", "paying total");

const nameId = M.parseRosterPaste("张三 11010119900307669X\n李四 11010119900307783X");
const mixed = M.withDefaults(nameId.groups[0], { route: "纯享1-4", per_person: "80" });
mixed.guests[1].is_captain = true;
mixed.guests[1].is_gift = true;
mixed.guests[1].captain_manual = true;
const mixedSum = M.summarizeGroup(mixed);
eq(mixedSum.guest_count, 2, "mixed listed");
eq(mixedSum.billable_headcount, 1, "mixed billable excludes captain");
eq(mixedSum.total_amount, "80", "mixed total excludes captain");
eq(mixedSum.guests[1].is_gift, true, "manual captain kept");

const agg = M.aggregateForRecon([
  mixedSum,
  M.summarizeGroup(captains.groups[0]),
  M.summarizeGroup(M.withDefaults({ route: "外籍团", per_person: "160", guests: [
    { name: "A", id_no: "PB1139652", id_type: "护照" },
    { name: "B", id_no: "PB2000707", id_type: "护照" }
  ] }, {})),
  M.summarizeGroup(M.withDefaults({ route: "少人", per_person: "60", guests: [
    { name: "C", id_no: "11010119900307875X" }
  ] }, {}))
]);
eq(agg.count_80, 1, "agg 80");
eq(agg.count_reduced, 1, "agg 60");
eq(agg.count_foreign, 2, "agg 160");
eq(agg.gift_count, 3, "agg gifts");
eq(agg.insurance_count, 7, "agg insurance still counts gifts");
eq(agg.other.length, 0, "no other");

const early = Object.assign({ count_80: 81, count_reduced: 3, system_total: "6650.87" }, M.PRESETS.early);
const row2 = M.computeRecon(early);
eq(row2.amount_80, "6480", "row2 80总额");
eq(row2.amount_reduced, "180", "row2 少总额");
eq(row2.total_amount, "6660", "row2 合计");
eq(row2.system_day, "6650.87", "row2 系统当日金额");
eq(row2.raw_diff, "-9.13", "row2 差额");
eq(row2.refund_amount, "2910", "row2 返款 35/25");

const row10 = M.computeRecon(Object.assign({
  count_80: 127,
  count_reduced: 8,
  system_total: "50409.87",
  system_prev: "41618.09",
  fee: "8.22",
  diff_amount: "-1840"
}, M.PRESETS.early));
eq(row10.amount_80, "10160", "row10 80总额");
eq(row10.amount_reduced, "480", "row10 少总额");
eq(row10.total_amount, "10640", "row10 合计");
eq(row10.system_day, "8791.78", "row10 系统当日金额");
eq(row10.raw_diff, "-1840", "row10 差额");
eq(row10.refund_amount, "2805", "row10 返款");

const row318 = M.computeRecon(Object.assign({
  count_80: 79,
  count_reduced: 4,
  count_foreign: 1
}, M.PRESETS.current));
eq(row318.total_amount, "6720", "row318 合计含外籍");
eq(row318.refund_amount, "2930", "row318 返款 35/20/85");

const row329 = M.computeRecon(Object.assign({
  count_80: 7,
  count_foreign: 2,
  system_total: "19970.58",
  system_prev: "19090.58"
}, M.PRESETS.current));
eq(row329.amount_foreign, "320", "row329 外籍总额");
eq(row329.total_amount, "880", "row329 合计");
eq(row329.system_day, "880", "row329 系统当日金额");
eq(row329.raw_diff, "0", "row329 差额");
eq(row329.refund_amount, "415", "row329 返款");

const zero = M.summarizeGroup(M.withDefaults({ per_person: "0", route: "九五6-9", guests: [
  { name: "周永恩", id_no: "231011195603290330" },
  { name: "田雪松", id_no: "231011195605150323" }
] }, { per_person: "80" }));
eq(zero.per_person, "0", "explicit 0 is not replaced by default 80");
eq(zero.total_amount, "0", "zero rate total");
eq(zero.billable_headcount, 0, "zero rate headcount");

const cover = M.defaultCoverage("2026-11-06");
eq(cover.cover_start, "2026-11-07", "default cover starts next day");
eq(cover.cover_days, 3, "default 3 days");
eq(cover.cover_end, "2026-11-09", "default end inclusive");
const longer = M.coverageFromStartDays("2026-11-07", 5);
eq(longer.cover_end, "2026-11-11", "5 days ends on the 11th");
const edited = M.coverageFromStartEnd("2026-11-07", "2026-11-12");
eq(edited.cover_days, 6, "edited end recomputes days");
eq(M.coverageFromStartEnd("2026-11-10", "2026-11-07").ok, false, "end before start");
const demo = M.deriveFromId("110101199001011234");
eq(demo.birth, "1990-01-01", "birth from id");
eq(demo.gender === "男" || demo.gender === "女", true, "gender from id");

console.log("roster-math tests ok");
