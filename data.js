// ─────────────────────────────────────────────────────────
//  PRIME LAND — DATA LAYER  (data.js)
//  Fetches Google Sheets CSV → parses → computes all metrics
// ─────────────────────────────────────────────────────────

function daysBetween(a, b) {
  if (!a || !b) return null;
  const da = new Date(a), db = new Date(b);
  if (isNaN(da) || isNaN(db)) return null;
  const d = Math.round((db - da) / 86400000);
  return d > 0 ? d : null;
}

function parseDate(s) {
  if (!s || !s.trim() || s.trim() === '—') return null;
  s = s.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d,m,y] = s.split('/'); return `${y}-${m}-${d}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = new Date(s).getTime();
  return isNaN(t) ? null : new Date(s).toISOString().slice(0,10);
}

function classifyStage(r) {
  if (r.coc)                 return 'COC Complete';
  if (r.bod_approved)        return 'BOD Approved';
  if (r.dev_permit_approved) return 'Dev Permit Issued';
  if (r.bod_survey)          return 'BOD Survey Done';
  if (r.perimeter_approved)  return 'Perimeter Approved';
  if (r.committed_deed)      return 'Deed Committed';
  return 'Early Stage';
}

function stageNum(s) {
  return CONFIG.STAGE_ORDER.indexOf(s);
}

function stallCat(days, stage) {
  if (stage === 'COC Complete') return 'ok';
  if (days > 1800) return 'critical';
  if (days > 730)  return 'warning';
  if (days > CONFIG.STALL_DAYS) return 'watch';
  return 'ok';
}

function parseCSVLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ; }
    else if (c === ',' && !inQ) { out.push(cur); cur=''; }
    else cur += c;
  }
  out.push(cur); return out;
}

const DATE_COLS = new Set([
  'start_year','committed_letter','committed_agreement','committed_deed',
  'ppc_applied','ppc_approved','ag_applied','ag_approved',
  'perimeter_survey','perimeter_applied','perimeter_approved',
  'water_applied','water_approved','elec_applied','elec_approved',
  'sales_tax_1pct','bod_survey','dev_permit_applied','dev_permit_approved',
  'bod_approved','coc_applied','coc',
  'nbro_applied','nbro_approved','agrarian_applied','agrarian_approved',
  'irrigation_applied','irrigation_approved','archaeology_applied','archaeology_approved',
  'forest_applied','forest_approved','cea_applied','cea_approved',
  'nrmc_applied','nrmc_approved','tea_applied','tea_approved',
  'civil_aviation_applied','civil_aviation_approved',
  'individual_lot_applied','individual_lot_approved',
  'assessment_applied','assessment_tax_paid'
]);

function processCSV(csv) {
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  let hi = -1;
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    if (lines[i].toLowerCase().includes('project_id')) { hi = i; break; }
  }
  if (hi < 0) throw new Error('Header row with project_id not found');

  const headers = parseCSVLine(lines[hi]).map(h => h.trim().toLowerCase());
  const col = name => headers.indexOf(name);

  const projects = [];
  for (let i = hi + 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const pid = (vals[col('project_id')] || '').trim();
    const pname = (vals[col('project_name')] || '').trim();
    if (!pid || !pname || pid === '' || pname === '') continue;

    const r = {};
    headers.forEach((h, idx) => {
      const v = (vals[idx] || '').trim();
      r[h] = DATE_COLS.has(h) ? parseDate(v) : v;
    });

    r.stage = classifyStage(r);
    r.stage_num = stageNum(r.stage);
    r.no_of_lots_n = parseFloat(r.no_of_lots) || 0;
    r.cycle_start = r.committed_agreement || r.committed_deed || r.start_year || null;
    r.cycle_days_n = daysBetween(r.cycle_start, r.bod_approved);

    // Latest activity across all date fields
    let latest = null;
    DATE_COLS.forEach(dc => {
      if (r[dc]) {
        const t = new Date(r[dc]).getTime();
        if (!isNaN(t) && (latest === null || t > latest)) latest = t;
      }
    });
    const todayMs = new Date().setHours(0,0,0,0);
    r.days_inactive = latest ? Math.round((todayMs - latest) / 86400000) : 9999;
    r.stall_cat = stallCat(r.days_inactive, r.stage);
    r.age_days = r.cycle_start ? Math.round((todayMs - new Date(r.cycle_start)) / 86400000) : null;
    projects.push(r);
  }

  if (!projects.length) throw new Error('No valid project rows found — check column headers match schema');

  // ── KPIs ──────────────────────────────────────────────────
  const completed = projects.filter(p => p.stage === 'COC Complete');
  const inprog    = projects.filter(p => p.stage !== 'COC Complete');
  const totalLots  = projects.reduce((s,p) => s+p.no_of_lots_n, 0);
  const cocLots    = completed.reduce((s,p) => s+p.no_of_lots_n, 0);
  const stalled    = inprog.filter(p => p.stall_cat !== 'ok');
  const stalledLots= stalled.reduce((s,p) => s+p.no_of_lots_n, 0);
  const cycleTimes = projects.map(p=>p.cycle_days_n).filter(Boolean);
  const sortedCyc  = [...cycleTimes].sort((a,b)=>a-b);
  const medCyc     = sortedCyc.length ? sortedCyc[Math.floor(sortedCyc.length/2)] : 0;

  // ── Pipeline funnel ────────────────────────────────────────
  const pipeline = CONFIG.STAGE_ORDER.map(s => ({
    stage: s, color: CONFIG.STAGE_COLORS[s],
    count: projects.filter(p=>p.stage===s).length,
    lots:  Math.round(projects.filter(p=>p.stage===s).reduce((sum,p)=>sum+p.no_of_lots_n,0))
  }));

  // ── Stage durations ────────────────────────────────────────
  const PAIRS = [
    ['ppc_applied','ppc_approved','PPC'],
    ['ag_applied','ag_approved','AG / Gra.N'],
    ['perimeter_applied','perimeter_approved','Perimeter Plan'],
    ['water_applied','water_approved','Water Estimate'],
    ['elec_applied','elec_approved','Electricity CON'],
    ['dev_permit_applied','dev_permit_approved','Dev Permit'],
    ['bod_survey','bod_approved','BOD Survey→Approve'],
  ];
  const stage_stats = {};
  PAIRS.forEach(([a,b,label]) => {
    const durs = projects.map(p=>daysBetween(p[a],p[b])).filter(d=>d&&d>0&&d<2000);
    const sorted = [...durs].sort((x,y)=>x-y);
    stage_stats[label] = {
      n: durs.length,
      median: sorted.length ? sorted[Math.floor(sorted.length/2)] : 0,
      mean:   durs.length ? Math.round(durs.reduce((s,v)=>s+v,0)/durs.length) : 0,
      max:    durs.length ? Math.max(...durs) : 0,
      low_n:  durs.length < 10
    };
  });

  // ── Yearly intake vs COC trend ────────────────────────────
  const yearly = {};
  for (let yr = 2018; yr <= new Date().getFullYear(); yr++) {
    const s = projects.filter(p=>p.cycle_start&&new Date(p.cycle_start).getFullYear()===yr).length;
    const c = projects.filter(p=>p.coc&&new Date(p.coc).getFullYear()===yr).length;
    if (s>0||c>0) yearly[yr] = {started:s, coc:c};
  }

  // ── LA summary ────────────────────────────────────────────
  const laMap = {};
  projects.forEach(p => {
    const la = p.local_authority || 'Unknown';
    if (!laMap[la]) laMap[la] = {projects:0,lots:0,completed:0};
    laMap[la].projects++;
    laMap[la].lots += p.no_of_lots_n;
    if (p.stage==='COC Complete') laMap[la].completed++;
  });
  const la_data = Object.entries(laMap)
    .map(([la,v])=>({local_authority:la, projects:v.projects, lots:Math.round(v.lots), completed:v.completed}))
    .sort((a,b)=>b.projects-a.projects).slice(0,12);

  // ── Scatter: lot size vs cycle time ───────────────────────
  const scatter = projects
    .filter(p=>p.no_of_lots_n>0&&p.cycle_days_n)
    .map(p=>({x:p.no_of_lots_n, y:p.cycle_days_n, name:p.project_name, stage:p.stage}));

  // ── Age buckets ────────────────────────────────────────────
  const age_buckets = {'<1yr':0,'1-2yr':0,'2-3yr':0,'3-5yr':0,'5-8yr':0,'8+yr':0};
  projects.forEach(p => {
    if (!p.age_days||p.age_days<=0) return;
    const y = p.age_days/365.25;
    if (y<1) age_buckets['<1yr']++;
    else if (y<2) age_buckets['1-2yr']++;
    else if (y<3) age_buckets['2-3yr']++;
    else if (y<5) age_buckets['3-5yr']++;
    else if (y<8) age_buckets['5-8yr']++;
    else age_buckets['8+yr']++;
  });

  // ── Stalled list ───────────────────────────────────────────
  const stalled_list = stalled
    .sort((a,b)=>b.days_inactive-a.days_inactive)
    .map(p=>({
      id: p.project_id, name: p.project_name,
      la: p.local_authority||'—', stage: p.stage,
      days_inactive: p.days_inactive,
      lots: p.no_of_lots_n,
      stall_cat: p.stall_cat
    }));

  // ── Outlier flags ──────────────────────────────────────────
  const cycMean = cycleTimes.reduce((s,v)=>s+v,0)/(cycleTimes.length||1);
  const cycStd  = Math.sqrt(cycleTimes.reduce((s,v)=>s+(v-cycMean)**2,0)/(cycleTimes.length||1));
  projects.forEach(p => {
    p.flag = '';
    if (p.cycle_days_n && p.cycle_days_n > cycMean + CONFIG.OUTLIER_SIGMA * cycStd) p.flag = 'long_cycle';
    else if (p.days_inactive > 730 && p.stage!=='COC Complete') p.flag = 'stalled';
    else if (p.days_inactive > CONFIG.STALL_DAYS && p.stage!=='COC Complete') p.flag = 'inactive';
    p.data_needed = [];
    if (!['COC Complete','Early Stage'].includes(p.stage)) {
      if (!p.no_of_lots_n) p.data_needed.push('lots count');
      if (!p.committed_deed && !p.committed_agreement) p.data_needed.push('deed/agmt date');
    }
  });

  // ── Special clearances ─────────────────────────────────────
  const CLEAR = [
    ['NBRO','nbro_applied','nbro_approved'],
    ['Agrarian','agrarian_applied','agrarian_approved'],
    ['Irrigation','irrigation_applied','irrigation_approved'],
    ['Archaeology','archaeology_applied','archaeology_approved'],
    ['Forest','forest_applied','forest_approved'],
    ['CEA','cea_applied','cea_approved'],
    ['NRMC','nrmc_applied','nrmc_approved'],
    ['Tea/Rubber','tea_applied','tea_approved'],
    ['Civil Aviation','civil_aviation_applied','civil_aviation_approved'],
    ['Individual Lot','individual_lot_applied','individual_lot_approved'],
    ['Assessment','assessment_applied','assessment_tax_paid'],
  ];
  const clearances = CLEAR.map(([name,a,b])=>({
    name,
    applied:  projects.filter(p=>p[a]).length,
    approved: projects.filter(p=>p[b]).length,
  }));
  clearances.forEach(c=>c.pending=c.applied-c.approved);

  const special_projs = projects
    .filter(p=>CLEAR.slice(0,9).some(([,a])=>p[a]))
    .map(p=>{
      const row = {id:p.project_id, name:p.project_name};
      CLEAR.slice(0,9).forEach(([name,a,b])=>{
        row[name] = p[b]?'approved':p[a]?'applied':'';
      });
      return row;
    });

  return {
    kpis:{
      total:projects.length, completed:completed.length,
      in_progress:inprog.length, total_lots:Math.round(totalLots),
      coc_lots:Math.round(cocLots), pipeline_lots:Math.round(totalLots-cocLots),
      stalled_count:stalled.length, stalled_lots:Math.round(stalledLots),
      median_cycle:medCyc,
      bod_median: stage_stats['BOD Survey→Approve']?.median || 0
    },
    pipeline, stage_stats, yearly, la_data, scatter, age_buckets,
    stalled_list, projects, clearances, special_projs,
    generated: new Date().toISOString().slice(0,10)
  };
}

async function loadDashboardData() {
  const url = CONFIG.SHEET_CSV_URL;
  if (url.includes('YOUR_SHEET_ID')) {
    const cached = localStorage.getItem('pl_cache');
    if (cached) return JSON.parse(cached);
    throw new Error('CONFIG_URL_NOT_SET');
  }
  const res = await fetch(url, {cache:'no-store'});
  if (!res.ok) throw new Error(`HTTP ${res.status} — check Sheet is published as CSV`);
  const text = await res.text();
  const data = processCSV(text);
  try { localStorage.setItem('pl_cache', JSON.stringify(data)); } catch(e){}
  return data;
}
