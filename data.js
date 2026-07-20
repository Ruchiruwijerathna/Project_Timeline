// ============================================================
//  PRIME LAND — DATA LAYER
//  Fetches CSV from Google Sheets, parses it, computes all
//  metrics that the charts need. Called by index.html on load
//  and on auto-refresh timer.
// ============================================================

const TODAY = new Date();
TODAY.setHours(0,0,0,0);

function daysBetween(a, b) {
  if (!a || !b) return null;
  const da = new Date(a), db = new Date(b);
  if (isNaN(da) || isNaN(db)) return null;
  return Math.round((db - da) / 86400000);
}

function parseDate(s) {
  if (!s || s.trim() === "" || s.trim() === "—") return null;
  // handle both YYYY-MM-DD and DD/MM/YYYY
  s = s.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return `${y}-${m}-${d}`;
  }
  return s;
}

function classifyStage(r) {
  if (r.coc)               return "COC Complete";
  if (r.bod_approved)      return "BOD Approved";
  if (r.dev_permit_approved) return "Dev Permit Issued";
  if (r.bod_survey)        return "BOD Survey Done";
  if (r.perimeter_approved)return "Perimeter Approved";
  if (r.committed_deed)    return "Deed Committed";
  return "Early Stage";
}

function stageNum(stage) {
  return ["Early Stage","Deed Committed","Perimeter Approved",
          "BOD Survey Done","Dev Permit Issued","BOD Approved","COC Complete"]
    .indexOf(stage);
}

function stallCat(days, stage) {
  if (stage === "COC Complete") return "ok";
  if (days > 1800) return "critical";
  if (days > 730)  return "warning";
  if (days > CONFIG.STALL_THRESHOLD_DAYS) return "watch";
  return "ok";
}

// ── Main parse + compute function ───────────────────────────
function processCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());

  // find header row — the one starting with project_id
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    if (lines[i].toLowerCase().includes("project_id")) {
      headerIdx = i; break;
    }
  }
  if (headerIdx < 0) throw new Error("Could not find header row with 'project_id'");

  const headers = parseCSVLine(lines[headerIdx]).map(h => h.trim().toLowerCase());
  const col = name => headers.indexOf(name);

  const DATE_COLS = [
    "start_year","committed_letter","committed_agreement","committed_deed",
    "ppc_applied","ppc_approved","ag_applied","ag_approved",
    "perimeter_survey","perimeter_applied","perimeter_approved",
    "water_applied","water_approved","elec_applied","elec_approved",
    "sales_tax_1pct","bod_survey","dev_permit_applied","dev_permit_approved",
    "bod_approved","coc","coc_applied",
    "nbro_applied","nbro_approved","agrarian_applied","agrarian_approved",
    "irrigation_applied","irrigation_approved","archaeology_applied","archaeology_approved",
    "forest_applied","forest_approved","cea_applied","cea_approved",
    "nrmc_applied","nrmc_approved","tea_applied","tea_approved",
    "civil_aviation_applied","civil_aviation_approved",
    "individual_lot_applied","individual_lot_approved",
    "assessment_applied","assessment_tax_paid"
  ];

  const projects = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (!vals[col("project_id")] || vals[col("project_id")].trim() === "") continue;
    if (!vals[col("project_name")] || vals[col("project_name")].trim() === "") continue;

    const r = {};
    headers.forEach((h, idx) => {
      const v = (vals[idx] || "").trim();
      r[h] = DATE_COLS.includes(h) ? parseDate(v) : v;
    });

    // derived
    r.stage = classifyStage(r);
    r.stage_num = stageNum(r.stage);
    r.no_of_lots_n = parseFloat(r.no_of_lots) || 0;

    // cycle start: agreement preferred over deed (BOD can precede deed)
    r.cycle_start = r.committed_agreement || r.committed_deed || r.start_year || null;

    // cycle time
    const cycleDays = daysBetween(r.cycle_start, r.bod_approved);
    r.cycle_days_n = cycleDays && cycleDays > 0 ? cycleDays : null;
    r.cycle_days = r.cycle_days_n !== null ? String(r.cycle_days_n) : "—";

    // age
    const ageRef = r.cycle_start;
    if (ageRef) {
      r.age_days = daysBetween(ageRef, TODAY.toISOString().slice(0,10));
    } else {
      r.age_days = null;
    }

    // latest activity
    let latestTs = null;
    DATE_COLS.forEach(dc => {
      if (r[dc]) {
        const t = new Date(r[dc]).getTime();
        if (!isNaN(t) && t > latestTs) latestTs = t;
      }
    });
    r.latest_activity = latestTs;
    r.days_inactive = latestTs
      ? Math.round((TODAY.getTime() - latestTs) / 86400000)
      : 9999;

    r.stall_cat = stallCat(r.days_inactive, r.stage);
    projects.push(r);
  }

  // ── Compute aggregates ──────────────────────────────────
  const completed = projects.filter(p => p.stage === "COC Complete");
  const inprogress = projects.filter(p => p.stage !== "COC Complete");
  const total_lots = projects.reduce((s,p) => s + p.no_of_lots_n, 0);
  const coc_lots   = completed.reduce((s,p) => s + p.no_of_lots_n, 0);
  const stalled    = inprogress.filter(p => p.stall_cat !== "ok").length;

  const cycleTimes = projects.map(p => p.cycle_days_n).filter(Boolean);
  const sorted = [...cycleTimes].sort((a,b) => a-b);
  const median_cycle = sorted.length ? sorted[Math.floor(sorted.length/2)] : 0;

  // pipeline
  const STAGE_ORDER = CONFIG.STAGES.map(s => s.key);
  const pipeline = CONFIG.STAGES.map(s => ({
    stage: s.key, color: s.color,
    count: projects.filter(p => p.stage === s.key).length,
    lots:  projects.filter(p => p.stage === s.key).reduce((sum,p) => sum + p.no_of_lots_n, 0)
  }));

  // stage durations
  const STAGE_PAIRS = [
    ["ppc_applied","ppc_approved","PPC"],
    ["ag_applied","ag_approved","AG / Gra.N"],
    ["perimeter_applied","perimeter_approved","Perimeter Plan"],
    ["water_applied","water_approved","Water Estimate"],
    ["elec_applied","elec_approved","Electricity CON"],
    ["dev_permit_applied","dev_permit_approved","Dev Permit"],
    ["bod_survey","bod_approved","BOD Survey→Approve"],
  ];
  const stage_stats = {};
  STAGE_PAIRS.forEach(([a, b, label]) => {
    const durations = projects.map(p => daysBetween(p[a], p[b]))
      .filter(d => d !== null && d > 0 && d < 2000);
    if (durations.length >= 2) {
      const ds = [...durations].sort((a,b)=>a-b);
      stage_stats[label] = {
        n: durations.length,
        median: ds[Math.floor(ds.length/2)],
        mean: Math.round(durations.reduce((s,v)=>s+v,0)/durations.length),
        max: Math.max(...durations)
      };
    }
  });

  // LA summary
  const laMap = {};
  projects.forEach(p => {
    const la = p.local_authority || "Unknown";
    if (!laMap[la]) laMap[la] = { projects:0, lots:0, completed:0 };
    laMap[la].projects++;
    laMap[la].lots += p.no_of_lots_n;
    if (p.stage === "COC Complete") laMap[la].completed++;
  });
  const la_data = Object.entries(laMap)
    .map(([la, v]) => ({ local_authority: la, ...v }))
    .sort((a,b) => b.projects - a.projects)
    .slice(0, 15);

  // age buckets
  const age_buckets = {"<1yr":0,"1-2yr":0,"2-3yr":0,"3-5yr":0,"5-8yr":0,"8+yr":0};
  projects.forEach(p => {
    if (p.age_days === null) return;
    const y = p.age_days / 365.25;
    if (y < 1) age_buckets["<1yr"]++;
    else if (y < 2) age_buckets["1-2yr"]++;
    else if (y < 3) age_buckets["2-3yr"]++;
    else if (y < 5) age_buckets["3-5yr"]++;
    else if (y < 8) age_buckets["5-8yr"]++;
    else age_buckets["8+yr"]++;
  });

  // scatter: lots vs cycle time
  const scatter = projects
    .filter(p => p.no_of_lots_n > 0 && p.cycle_days_n !== null)
    .map(p => ({ x: p.no_of_lots_n, y: p.cycle_days_n, name: p.project_name, stage: p.stage }));

  // outlier flags
  const cycMean = cycleTimes.reduce((s,v)=>s+v,0) / (cycleTimes.length||1);
  const cycStd  = Math.sqrt(cycleTimes.reduce((s,v)=>s+(v-cycMean)**2,0) / (cycleTimes.length||1));
  const sigma   = CONFIG.OUTLIER_SIGMA;
  projects.forEach(p => {
    p.flag = "";
    if (p.cycle_days_n && p.cycle_days_n > cycMean + sigma * cycStd) p.flag = "long_cycle";
    else if (p.days_inactive > 730 && p.stage !== "COC Complete") p.flag = "stalled";
    else if (p.days_inactive > CONFIG.STALL_THRESHOLD_DAYS && p.stage !== "COC Complete") p.flag = "inactive";

    p.data_needed = [];
    if (p.stage !== "COC Complete" && p.stage !== "Early Stage") {
      if (!p.no_of_lots || parseFloat(p.no_of_lots) === 0) p.data_needed.push("no_of_lots");
      if (!p.committed_deed && !p.committed_agreement) p.data_needed.push("deed/agreement date");
    }
  });

  return {
    kpis: {
      total: projects.length,
      completed: completed.length,
      total_lots: Math.round(total_lots),
      coc_lots: Math.round(coc_lots),
      stalled,
      median_cycle
    },
    pipeline,
    stage_stats,
    la_data,
    age_buckets,
    scatter,
    projects,
    generated: new Date().toISOString().slice(0,10)
  };
}

// ── Simple CSV line parser (handles quoted fields) ───────
function parseCSVLine(line) {
  const result = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      result.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

// ── Fetch + process ──────────────────────────────────────
async function loadDashboardData() {
  const url = CONFIG.SHEET_CSV_URL;
  if (url.includes("YOUR_SHEET_ID")) {
    // fallback to last cached data in localStorage if available
    const cached = localStorage.getItem("prime_land_data");
    if (cached) return JSON.parse(cached);
    throw new Error("CONFIG_URL_NOT_SET");
  }
  // CORS workaround: Google Sheets CSV is public, fetch directly
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const data = processCSV(text);
  // cache in localStorage as fallback
  try { localStorage.setItem("prime_land_data", JSON.stringify(data)); } catch(e) {}
  return data;
}
