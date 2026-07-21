// ─────────────────────────────────────────────────────────
//  PRIME LAND — DASHBOARD CONFIG
//  Only edit this file. Never touch index.html or data.js.
// ─────────────────────────────────────────────────────────
const CONFIG = {
  // Paste your Google Sheets CSV URL here
  SHEET_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6ShaEIFadVDKN3jd9kuIwFnN5xNIg5yTPG6LKSEwrJf-ADvLGt1h2XkUup4PPOlkAjWQMHvzIBsZx/pub?gid=1996765743&single=true&output=csv",

  // Auto-refresh interval (ms). 300000 = 5 minutes
  REFRESH_MS: 300000,

  // Stall threshold — days of inactivity before flagging (non-COC)
  STALL_DAYS: 180,

  // Cycle-time outlier: σ multiplier above mean
  OUTLIER_SIGMA: 2.0,

  STAGE_ORDER: [
    'Early Stage','Deed Committed','Perimeter Approved',
    'BOD Survey Done','Dev Permit Issued','BOD Approved','COC Complete'
  ],
  STAGE_COLORS: {
    'Early Stage':       '#484F58',
    'Deed Committed':    '#EF9F27',
    'Perimeter Approved':'#E8B84B',
    'BOD Survey Done':   '#85B7EB',
    'Dev Permit Issued': '#378ADD',
    'BOD Approved':      '#2F81F7',
    'COC Complete':      '#3FB950',
  }
};
