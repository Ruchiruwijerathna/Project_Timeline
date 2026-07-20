// ============================================================
//  PRIME LAND — DASHBOARD CONFIG
//  Only edit this file. Never touch index.html directly.
// ============================================================

const CONFIG = {

  // Paste your Google Sheets CSV URL here (from Step 1 above)
  SHEET_CSV_URL: "https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/pub?gid=0&single=true&output=csv",

  // How often to re-fetch data (milliseconds). 300000 = 5 minutes
  REFRESH_INTERVAL_MS: 300000,

  // Days of inactivity before a project is considered stalled (non-COC)
  STALL_THRESHOLD_DAYS: 180,

  // Cycle time outlier threshold (multiples of std-dev above mean)
  OUTLIER_SIGMA: 2.0,

  // Stage labels and colors — edit if you rename stages
  STAGES: [
    { key: "Early Stage",       color: "#484F58" },
    { key: "Deed Committed",    color: "#EF9F27" },
    { key: "Perimeter Approved",color: "#E8B84B" },
    { key: "BOD Survey Done",   color: "#85B7EB" },
    { key: "Dev Permit Issued", color: "#378ADD" },
    { key: "BOD Approved",      color: "#2F81F7" },
    { key: "COC Complete",      color: "#3FB950" },
  ],
};
