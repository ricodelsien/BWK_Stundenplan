/* BWK Stundenplan – script.js
   - local first (localStorage)
   - ISO week based
   - 4 Blöcke / Tag, Mo–Fr
   - quick place mode + drag&drop
   - print A4 landscape
   - v.0.6 Nico Siedler (ricodelsien)
*/

(() => {
  'use strict';

  const STORAGE_KEY = 'bwk_stundenplan_v2';
  const HOLIDAY_CACHE_KEY = 'bwk_stundenplan_holiday_cache_v1';
  const PUBLIC_HOLIDAY_CACHE_KEY = 'bwk_stundenplan_public_holiday_cache_v1';
  const APP_VERSION = '0.13';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---- State ----
  let data = null;
  let view = {
    isoYear: 2024,
    isoWeek: 1,
    stateCode: 'BE',
    placement: null, // {type:'subject'|'special', id}
    pendingImport: null,
  };

  let saveTimer = null;
  let holidayCache = loadHolidayCache();
  let publicHolidayCache = loadPublicHolidayCache();
  
  // Embedded school holidays (Berlin) – offline/reference list
  // Source: Senatsverwaltung für Bildung, Jugend und Familie (Berlin.de) – Ferienordnung 2024/2025 bis 2029/2030
  const EMBEDDED_SCHOOL_HOLIDAYS_BE = {
  "2024": [
    {
      "name": "Herbstferien",
      "startDate": "2024-10-21",
      "endDate": "2024-11-02"
    },
    {
      "name": "Weihnachtsferien",
      "startDate": "2024-12-23",
      "endDate": "2024-12-31"
    }
  ],
  "2025": [
    {
      "name": "Winterferien",
      "startDate": "2025-02-03",
      "endDate": "2025-02-08"
    },
    {
      "name": "Osterferien",
      "startDate": "2025-04-14",
      "endDate": "2025-04-25"
    },
    {
      "name": "Pfingstferien",
      "startDate": "2025-06-10",
      "endDate": "2025-06-10"
    },
    {
      "name": "Sommerferien",
      "startDate": "2025-07-24",
      "endDate": "2025-09-06"
    },
    {
      "name": "Herbstferien",
      "startDate": "2025-10-20",
      "endDate": "2025-11-01"
    },
    {
      "name": "Weihnachtsferien",
      "startDate": "2025-12-22",
      "endDate": "2026-01-02"
    }
  ],
  "2026": [
    {
      "name": "Winterferien",
      "startDate": "2026-02-02",
      "endDate": "2026-02-07"
    },
    {
      "name": "Osterferien",
      "startDate": "2026-03-30",
      "endDate": "2026-04-10"
    },
    {
      "name": "Pfingstferien",
      "startDate": "2026-05-26",
      "endDate": "2026-05-26"
    },
    {
      "name": "Sommerferien",
      "startDate": "2026-07-09",
      "endDate": "2026-08-22"
    },
    {
      "name": "Herbstferien",
      "startDate": "2026-10-19",
      "endDate": "2026-10-31"
    },
    {
      "name": "Weihnachtsferien",
      "startDate": "2026-12-23",
      "endDate": "2027-01-02"
    }
  ],
  "2027": [
    {
      "name": "Winterferien",
      "startDate": "2027-02-01",
      "endDate": "2027-02-06"
    },
    {
      "name": "Osterferien",
      "startDate": "2027-03-22",
      "endDate": "2027-04-02"
    },
    {
      "name": "Pfingstferien",
      "startDate": "2027-05-18",
      "endDate": "2027-05-18"
    },
    {
      "name": "Sommerferien",
      "startDate": "2027-07-01",
      "endDate": "2027-08-14"
    },
    {
      "name": "Herbstferien",
      "startDate": "2027-10-11",
      "endDate": "2027-10-23"
    },
    {
      "name": "Weihnachtsferien",
      "startDate": "2027-12-22",
      "endDate": "2027-12-31"
    }
  ],
  "2028": [
    {
      "name": "Winterferien",
      "startDate": "2028-01-31",
      "endDate": "2028-02-05"
    },
    {
      "name": "Osterferien",
      "startDate": "2028-04-10",
      "endDate": "2028-04-22"
    },
    {
      "name": "Pfingstferien",
      "startDate": "2028-06-01",
      "endDate": "2028-06-02"
    },
    {
      "name": "Sommerferien",
      "startDate": "2028-07-01",
      "endDate": "2028-08-12"
    },
    {
      "name": "Herbstferien",
      "startDate": "2028-10-02",
      "endDate": "2028-10-14"
    },
    {
      "name": "Weihnachtsferien",
      "startDate": "2028-12-22",
      "endDate": "2029-01-02"
    }
  ],
  "2029": [
    {
      "name": "Winterferien",
      "startDate": "2029-01-29",
      "endDate": "2029-02-03"
    },
    {
      "name": "Osterferien",
      "startDate": "2029-03-26",
      "endDate": "2029-04-06"
    },
    {
      "name": "Pfingstferien",
      "startDate": "2029-05-22",
      "endDate": "2029-05-22"
    },
    {
      "name": "Sommerferien",
      "startDate": "2029-07-01",
      "endDate": "2029-08-11"
    },
    {
      "name": "Herbstferien",
      "startDate": "2029-10-01",
      "endDate": "2029-10-12"
    },
    {
      "name": "Weihnachtsferien",
      "startDate": "2029-12-21",
      "endDate": "2030-01-04"
    }
  ],
  "2030": [
    {
      "name": "Winterferien",
      "startDate": "2030-02-04",
      "endDate": "2030-02-09"
    },
    {
      "name": "Osterferien",
      "startDate": "2030-04-15",
      "endDate": "2030-04-26"
    },
    {
      "name": "Pfingstferien",
      "startDate": "2030-06-07",
      "endDate": "2030-06-07"
    },
    {
      "name": "Sommerferien",
      "startDate": "2030-07-04",
      "endDate": "2030-08-17"
    }
  ]
};


  let lastHolidayRenderKey = '';

  let weekDayISO = ['','','','',''];

  // Berlin legal holidays (dateISO -> name)
  let berlinHolidayMap = new Map();
  let lastBerlinHolidayKey = '';

  // Accent palette (background tint + focus/highlights)
  // - dark: deeper, muted tones
  // - light: pastel variants with enough contrast
  const ACCENT_PRESETS = {
    blue:   { dark: '#5c7da8', light: '#7fa2cc' },
    green:  { dark: '#5b8f76', light: '#86b7a2' },
    wine:   { dark: '#8a4a5b', light: '#c08b97' },
    violet: { dark: '#6f5a8e', light: '#a99bc4' },
    brown:  { dark: '#7a6455', light: '#b7a69a' },
    mustard:{ dark: '#8a7a42', light: '#c2b26a' },
  };
  
  // ---- Plan title color (by class name) ----
const PLAN_TITLE_COLOR_MAP = [
  { match: /^AVöD\s*I\b/i,  cls: 'title-blue' },
  { match: /^AVöD\s*II\b/i, cls: 'title-red'  },
  // { match: /^AVöD\s*III\b/i, cls: 'title-green' },
];

function getPlanTitleClass(planName){
  if(!planName) return '';
  const hit = PLAN_TITLE_COLOR_MAP.find(x => x.match.test(planName));
  return hit ? hit.cls : '';
}

function applyPlanTitleColor(planName){
  const el = document.querySelector('#planTitle');
  if(!el) return;

  // remove any existing title-* classes
  [...el.classList].forEach(c => {
    if(c.startsWith('title-')) el.classList.remove(c);
  });

  const cls = getPlanTitleClass(planName);
  if(cls) el.classList.add(cls);
}

  function isLightTheme(){
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  }

  function accentHexFor(key){
    const k = (key && ACCENT_PRESETS[key]) ? key : 'blue';
    const preset = ACCENT_PRESETS[k] || ACCENT_PRESETS.blue;
    return isLightTheme() ? preset.light : preset.dark;
  }

  let entryTeacherTouched = false;

  const STATE_OPTIONS = [
    { code: 'BE', name: 'Berlin' },
    { code: 'BB', name: 'Brandenburg' },
  ];

  const HOLIDAY_STATE_CODES = ['BE', 'BB'];

  const HOLIDAY_NAME_MAP = {
    winterferien: 'Winterferien',
    osterferien: 'Osterferien',
    sommerferien: 'Sommerferien',
    herbstferien: 'Herbstferien',
    weihnachtsferien: 'Weihnachtsferien',
    pfingstferien: 'Pfingstferien',
    fruehjahrsferien: 'Frühjahrsferien',
    frühjahrsferien: 'Frühjahrsferien',
  };

  // ---- Utilities ----

function ensureDate(x){
  if (x instanceof Date) return x;
  // ISO "YYYY-MM-DD" wird sonst teils als UTC interpretiert.
  // Für lokale Darstellung ist das hier stabiler:
  if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) {
    return new Date(x + 'T00:00:00');
  }
  return new Date(x);
}

function formatDateShort(d){
  const dt = ensureDate(d);
  return dt.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
}

function formatDateDMY(d){
  const dt = ensureDate(d);
  return dt.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function formatDateLong(d){
  const dt = ensureDate(d);
  return dt.toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' });
}

  function uid(prefix='id'){
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function toast(msg){
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function safeJsonParse(str){
    try { return JSON.parse(str); } catch { return null; }
  }

  function pad2(n){ return String(n).padStart(2,'0'); }

  function dateOnly(d){
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function formatDateShort(d){
    return d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
  }

  function formatDateDMY(d){
    return d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
  }

  function formatDateLong(d){
    return d.toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' });
  }

  function formatRange(a, b){
    // inclusive range
    return `${formatDateShort(a)}–${formatDateShort(b)}`;
  }

  function prettyHolidayName(name){
    if(!name) return '';
    const key = String(name).toLowerCase();
    if(HOLIDAY_NAME_MAP[key]) return HOLIDAY_NAME_MAP[key];
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  function hexToRgba(hex, alpha){
    if(!hex || typeof hex !== 'string') return `rgba(255,255,255,${alpha})`;
    let h = hex.trim();
    if(h.startsWith('#')) h = h.slice(1);
    if(h.length === 3) h = h.split('').map(ch => ch+ch).join('');
    const num = parseInt(h, 16);
    if(Number.isNaN(num)) return `rgba(255,255,255,${alpha})`;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function hexToRgbParts(hex){
    if(!hex || typeof hex !== 'string') return { r: 106, g: 166, b: 255 };
    let h = hex.trim();
    if(h.startsWith('#')) h = h.slice(1);
    if(h.length === 3) h = h.split('').map(ch => ch+ch).join('');
    const num = parseInt(h, 16);
    if(Number.isNaN(num)) return { r: 106, g: 166, b: 255 };
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function pickTextColor(hex){
    const { r, g, b } = hexToRgbParts(hex);

    // WCAG contrast: choose the text color (black/white) with the higher contrast ratio.
    const toLin = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? (s / 12.92) : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const L = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);

    const contrastWithWhite = (1.0 + 0.05) / (L + 0.05);
    const contrastWithBlack = (L + 0.05) / 0.05;

    return (contrastWithBlack >= contrastWithWhite) ? '#000' : '#fff';
  }

  function applyEntryColorToCell(cell, entry){
    if(!cell) return;
    cell.classList.remove('has-color');
    cell.style.removeProperty('--cell-bg');
    cell.style.removeProperty('--cell-hover');
    cell.style.removeProperty('--cell-pill-bg');
    cell.style.removeProperty('--cell-pill-bd');
    cell.style.color = '';

    // do not override holiday styling
    if(cell.classList.contains('is-holiday')) return;

    if(!entry || !entry.type) return;

    let color = null;
    if(entry.type === 'subject'){
      const subj = data.subjects.find(s => s.id === entry.subjectId);
      color = subj?.color || null;
    }
    if(entry.type === 'special'){
      const sp = data.specials.find(s => s.id === entry.specialId);
      color = sp?.color || null;
    }

    if(!color) return;

    const fg = pickTextColor(color);
    cell.classList.add('has-color');
    cell.style.setProperty('--cell-bg', color);
    cell.style.setProperty('--cell-hover', color);
    cell.style.color = fg;

    if(fg === '#fff'){
      cell.style.setProperty('--cell-pill-bg', 'rgba(0,0,0,.22)');
      cell.style.setProperty('--cell-pill-bd', 'rgba(0,0,0,.22)');
    } else {
      cell.style.setProperty('--cell-pill-bg', 'rgba(255,255,255,.45)');
      cell.style.setProperty('--cell-pill-bd', 'rgba(0,0,0,.18)');
    }
  }

  function applyAccent(){
    const key = (data?.settings?.accentKey && ACCENT_PRESETS[data.settings.accentKey]) ? data.settings.accentKey : 'blue';
    const hex = accentHexFor(key);
    const { r, g, b } = hexToRgbParts(hex);
    document.documentElement.style.setProperty('--accent', hex);
    document.documentElement.style.setProperty('--accent-rgb', `${r},${g},${b}`);
  }

  // ---- ISO week helpers (UTC-based) ----

  function getIsoWeekYear(date){
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    // Thursday in current week decides the year.
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const isoYear = d.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { isoYear, isoWeek: weekNo };
  }

  function weeksInIsoYear(isoYear){
    // Dec 28 is always in last ISO week of the year.
    const d = new Date(Date.UTC(isoYear, 11, 28));
    return getIsoWeekYear(d).isoWeek;
  }

  function isoWeekStartDate(isoYear, isoWeek){
    // Monday of ISO week
    const jan4 = new Date(Date.UTC(isoYear, 0, 4));
    const day = jan4.getUTCDay() || 7; // 1..7
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - day + 1 + (isoWeek - 1) * 7);
    return monday;
  }

  function getWeekDates(isoYear, isoWeek){
    const startUTC = isoWeekStartDate(isoYear, isoWeek);
    const days = [];
    for(let i=0;i<5;i++){
      const d = new Date(startUTC);
      d.setUTCDate(startUTC.getUTCDate() + i);
      days.push(new Date(d.getTime()));
    }
    return {
      start: new Date(startUTC.getTime()),
      end: new Date(new Date(startUTC.getTime() + 4*86400000).getTime()),
      days,
    };
  }

  function weekKey(isoYear, isoWeek){
    return `${isoYear}-W${pad2(isoWeek)}`;
  }

  // ---- Data model ----

  function defaultData(){
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: {
        stateCode: 'BE',
        slotLabels: ['Block 1', 'Block 2', 'Block 3', 'Block 4'],
        pauseLabels: ['', '', ''],
        accentKey: 'blue',
        activePlanId: '',
      },
      plans: {}, // { [planId]: { id, name, leaderId, weeks: { [weekKey]: { cells, note } } } }
      teachers: [],
      subjects: [],
      specials: [],
      // legacy single-plan storage (migrated into plans)
      weeks: {},
    };
  }

  function normalizeData(d){
    if(!d || typeof d !== 'object') return defaultData();
    const base = defaultData();
    const out = {
      ...base,
      ...d,
      settings: { ...base.settings, ...(d.settings||{}) },
      plans: (d.plans && typeof d.plans === 'object') ? d.plans : {},
      teachers: Array.isArray(d.teachers) ? d.teachers : [],
      subjects: Array.isArray(d.subjects) ? d.subjects : [],
      specials: Array.isArray(d.specials) ? d.specials : [],
      weeks: (d.weeks && typeof d.weeks === 'object') ? d.weeks : {},
    };
    // ensure slotLabels length 4
    if(!Array.isArray(out.settings.slotLabels)) out.settings.slotLabels = base.settings.slotLabels.slice();
    out.settings.slotLabels = out.settings.slotLabels.slice(0,4);
    while(out.settings.slotLabels.length < 4) out.settings.slotLabels.push(base.settings.slotLabels[out.settings.slotLabels.length]);

    // ensure pauseLabels length 3 (Pause nach Block 1..3)
    if(!Array.isArray(out.settings.pauseLabels)) out.settings.pauseLabels = base.settings.pauseLabels.slice();
    out.settings.pauseLabels = out.settings.pauseLabels.slice(0,3);
    while(out.settings.pauseLabels.length < 3) out.settings.pauseLabels.push('');

    // accent
    if(!out.settings.accentKey || !ACCENT_PRESETS[out.settings.accentKey]){
      out.settings.accentKey = base.settings.accentKey;
    }

    // ensure unique ids
    out.teachers = out.teachers.filter(t => t && t.id && t.name);
    out.subjects = out.subjects.filter(s => s && s.id && s.name);
    out.specials = out.specials.filter(s => s && s.id && s.title);

    // normalize plan storage + migrate legacy weeks
    migratePlans(out);

    
    // normalize holiday state codes from older builds
    if(out.settings && typeof out.settings.stateCode === 'string'){
      const sc = out.settings.stateCode.toUpperCase();
      if(sc === 'BER') out.settings.stateCode = 'BE';
      if(sc === 'BRB') out.settings.stateCode = 'BB';
    }
return out;
  }

  function migratePlans(out){
    // Ensure at least one plan exists.
    const plansObj = (out.plans && typeof out.plans === 'object') ? out.plans : {};
    out.plans = plansObj;

    // Normalize existing plans
    for(const [pid, p] of Object.entries(out.plans)){
      if(!p || typeof p !== 'object'){
        delete out.plans[pid];
        continue;
      }
      if(!p.id) p.id = pid;
      if(!p.name) p.name = 'Klasse';
      if(typeof p.leaderId !== 'string') p.leaderId = '';
      if(!p.weeks || typeof p.weeks !== 'object') p.weeks = {};
      // normalize weeks in each plan
      for(const [k, wk] of Object.entries(p.weeks || {})){
        if(!wk || typeof wk !== 'object'){
          p.weeks[k] = { cells: {}, note: '' };
          continue;
        }
        if(!wk.cells || typeof wk.cells !== 'object') wk.cells = {};
        if(typeof wk.note !== 'string') wk.note = '';
      }
    }

    // If no plans yet, migrate legacy out.weeks into a default plan
    const planIds = Object.keys(out.plans);
    if(planIds.length === 0){
      const pid = uid('plan');
      out.plans[pid] = {
        id: pid,
        name: 'AVöD I',
        weeks: (out.weeks && typeof out.weeks === 'object') ? out.weeks : {},
      };
      out.settings.activePlanId = pid;
      out.weeks = {}; // keep empty after migration
    }

    // Pick active plan
    if(!out.settings.activePlanId || !out.plans[out.settings.activePlanId]){
      out.settings.activePlanId = Object.keys(out.plans)[0];
    }
  }

  function loadData(){
    const raw = localStorage.getItem(STORAGE_KEY);
    let parsed = raw ? safeJsonParse(raw) : null;
    if(!parsed){
      // migrate from older key if present
      const legacyRaw = localStorage.getItem('bwk_stundenplan_v1');
      const legacy = legacyRaw ? safeJsonParse(legacyRaw) : null;
      if(legacy){
        parsed = legacy;
      }
    }
    return normalizeData(parsed);
  }

  function saveData(immediate=false){
    data.updatedAt = new Date().toISOString();
    const write = () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      $('#saveInfo').textContent = `Zuletzt gespeichert: ${new Date().toLocaleString('de-DE')}`;
    };

    if(immediate){
      write();
      return;
    }

    clearTimeout(saveTimer);
    saveTimer = setTimeout(write, 250);
  }

  function downloadJSON(obj, filename){
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  }

  // ---- Holiday cache ----

  function loadHolidayCache(){
    const raw = localStorage.getItem(HOLIDAY_CACHE_KEY);
    const parsed = raw ? safeJsonParse(raw) : null;
    if(!parsed || typeof parsed !== 'object') return {};
    return parsed;
  }

  function saveHolidayCache(){
    try{
      localStorage.setItem(HOLIDAY_CACHE_KEY, JSON.stringify(holidayCache));
    }catch{ /* ignore */ }
  }

  // ---- Public holiday cache (Berlin) ----

  function loadPublicHolidayCache(){
    const raw = localStorage.getItem(PUBLIC_HOLIDAY_CACHE_KEY);
    const parsed = raw ? safeJsonParse(raw) : null;
    if(!parsed || typeof parsed !== 'object') return {};
    return parsed;
  }

  function savePublicHolidayCache(){
    try{
      localStorage.setItem(PUBLIC_HOLIDAY_CACHE_KEY, JSON.stringify(publicHolidayCache));
    }catch{ /* ignore */ }
  }

  async function fetchBerlinPublicHolidays(year){
    const cacheKey = `BE-${year}`;
    const cached = publicHolidayCache[cacheKey];
    if(cached && Array.isArray(cached.items) && cached.fetchedAt){
      return cached.items;
    }

    let items = [];

    // 1) Feiertage-API: object keyed by holiday name.
    try{
      const url = `https://feiertage-api.de/api/?jahr=${encodeURIComponent(year)}&nur_land=BE`;
      const res = await fetch(url, { cache: 'no-store' });
      if(res.ok){
        const json = await res.json();
        if(json && typeof json === 'object'){
          for(const [name, info] of Object.entries(json)){
            const date = info && typeof info.datum === 'string' ? info.datum : null;
            if(!date) continue;
            items.push({ date, name });
          }
        }
      }
    }catch{ /* ignore */ }

    // 2) Fallback: Nager.Date (nationwide + DE-BE)
    if(!items.length){
      const url = `https://date.nager.at/api/v3/PublicHolidays/${encodeURIComponent(year)}/DE`;
      const res = await fetch(url, { cache: 'no-store' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if(Array.isArray(json)){
        for(const h of json){
          const date = typeof h?.date === 'string' ? h.date : null;
          if(!date) continue;
          const counties = Array.isArray(h?.counties) ? h.counties : null;
          const appliesToBerlin = !counties || counties.includes('DE-BE');
          if(!appliesToBerlin) continue;
          const name = (typeof h?.localName === 'string' && h.localName.trim()) ? h.localName : (h?.name || 'Feiertag');
          items.push({ date, name });
        }
      }
    }

    publicHolidayCache[cacheKey] = { fetchedAt: new Date().toISOString(), items };
    savePublicHolidayCache();
    return items;
  }

  function toISODate(d){
    return new Date(d).toISOString().slice(0,10);
  }

  async function fetchHolidays(stateCode, year){
      // Offline fallback: embedded Berlin school holidays (2024–2030)
    if(stateCode === 'BE'){
      const embedded = EMBEDDED_SCHOOL_HOLIDAYS_BE[String(year)];
      if(Array.isArray(embedded) && embedded.length){
        return embedded.map(h => ({ ...h, type: 'SchoolHoliday', source: 'embedded' }));
      }
    }

    const cacheKey = `${stateCode}-${year}`;
    const cached = holidayCache[cacheKey];
    if(cached && Array.isArray(cached.items) && cached.fetchedAt){
      return cached.items;
    }

    const subdivisionCode = stateCode === 'BE' ? 'DE-BE' : (stateCode === 'BB' ? 'DE-BB' : `DE-${stateCode}`);
    const validFrom = `${year}-01-01`;
    const validTo = `${year}-12-31`;

    // Primary source: OpenHolidays API (school holidays)
    try{
      const urlOH = `https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&subdivisionCode=${encodeURIComponent(subdivisionCode)}&languageIsoCode=DE&validFrom=${validFrom}&validTo=${validTo}`;
      const res = await fetch(urlOH, { cache: 'no-store', headers: { 'accept': 'text/json' } });
      if(res.ok){
        const json = await res.json();
        if(Array.isArray(json)){
          const items = json.map((h) => {
            const name =
              (Array.isArray(h.name) ? (h.name.find(n => String(n.languageIsoCode||'').toUpperCase() === 'DE')?.text || h.name[0]?.text) : null) ||
              h.name?.text || h.name || h.title || h.type || 'Ferien';
            const startDate = String(h.startDate || h.validFrom || '').slice(0,10);
            const endDate = String(h.endDate || h.validTo || '').slice(0,10);
            const slug = h.id || `${subdivisionCode}-${startDate}-${endDate}-${name}`.toLowerCase().replace(/\s+/g,'-');
            return { slug, name, startDate, endDate, source: 'openholidays' };
          }).filter(x => x.startDate && x.endDate);

          holidayCache[cacheKey] = { fetchedAt: new Date().toISOString(), items };
          saveHolidayCache();
          return items;
        }
      }
    } catch(_e){ /* fallback below */ }

    // Fallback: ferien-api.de (may fail on some setups due to CORS / file:// origin)
    const url = `https://ferien-api.de/api/v1/holidays/${stateCode}/${year}`;
    const res2 = await fetch(url, { cache: 'no-store' });
    if(!res2.ok) throw new Error(`HTTP ${res2.status}`);
    const json2 = await res2.json();
    if(!Array.isArray(json2)) return [];

    holidayCache[cacheKey] = { fetchedAt: new Date().toISOString(), items: json2 };
    saveHolidayCache();
    return json2;
  }

  function holidayToRange(h){
    // Normalized OpenHolidays items already have startDate/endDate.
    if(h && h.startDate && h.endDate){
      return { ...h, startDate: String(h.startDate).slice(0,10), endDate: String(h.endDate).slice(0,10) };
    }
    // ferien-api.de returns UTC timestamps (start/end).
    const start = dateOnly(new Date(h.start));
    const end = dateOnly(new Date(h.end));
    return { ...h, startDate: start, endDate: end };
  }

  function rangesOverlap(aStart, aEnd, bStart, bEnd){
    // inclusive overlap for date-only values
    return aStart <= bEnd && bStart <= aEnd;
  }

  // ---- DOM: populate selects ----

  function fillWeekSelect(){
    const sel = $('#weekSelect');
    const maxWeeks = weeksInIsoYear(view.isoYear);
    sel.innerHTML = '';
    for(let w=1; w<=maxWeeks; w++){
      const opt = document.createElement('option');
      opt.value = String(w);
      opt.textContent = `KW ${w}`;
      sel.appendChild(opt);
    }
    view.isoWeek = clamp(view.isoWeek, 1, maxWeeks);
    sel.value = String(view.isoWeek);
  }

  function fillPlanSelect(){
    const sel = $('#planSelect');
    if(!sel) return;
    sel.innerHTML = '';
    const plans = allPlans();
    for(const p of plans){
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name || 'Klasse';
      sel.appendChild(opt);
    }
    const active = data.settings.activePlanId;
    if(active && data.plans[active]){
      sel.value = active;
    } else if(plans[0]){
      sel.value = plans[0].id;
      data.settings.activePlanId = plans[0].id;
      saveData(true);
    }
  }

  function fillPlanLeaderSelect(){
    const sel = $('#planLeaderSelect');
    if(!sel) return;
    sel.innerHTML = '';

    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = '—';
    sel.appendChild(optNone);

    const teachers = (data.teachers || []).slice().sort((a,b) => (a.name||'').localeCompare(b.name||'', 'de'));
    for(const t of teachers){
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.short ? `${t.name} (${t.short})` : t.name;
      sel.appendChild(opt);
    }

    const plan = getActivePlan();
    sel.value = plan?.leaderId || '';
    sel.disabled = !plan;
  }

  function addPlan(){
    const name = prompt('Name der Klasse (z. B. AVöD I):', 'AVöD II');
    if(!name) return;
    const pid = uid('plan');
    data.plans[pid] = { id: pid, name: name.trim(), leaderId: '', weeks: {} };
    data.settings.activePlanId = pid;
    saveData(true);
    fillPlanSelect();
    renderAll();
    toast('Klasse angelegt');
  }

  function renameActivePlan(){
    const plan = getActivePlan();
    if(!plan) return;
    const name = prompt('Klasse umbenennen:', plan.name || 'Klasse');
    if(!name) return;
    plan.name = name.trim();
    saveData(true);
    fillPlanSelect();
    renderAll();
    toast('Klasse umbenannt');
  }

  function deleteActivePlan(){
    const plan = getActivePlan();
    if(!plan) return;
    const planIds = Object.keys(data.plans || {});
    const isLast = planIds.length <= 1;

    const ok = confirm(isLast
      ? `Die letzte Klasse kann nicht komplett entfernt werden.

Möchtest du "${plan.name || 'Klasse'}" stattdessen zurücksetzen?

Alle Einträge & Notizen dieser Klasse werden gelöscht und durch eine neue leere Klasse ersetzt.`
      : `Klasse wirklich entfernen?

"${plan.name || 'Klasse'}"

Alle Einträge & Notizen dieser Klasse werden gelöscht.`
    );
    if(!ok) return;

    if(isLast){
      // reset by replacing with a fresh empty plan (keeps the "at least one class" rule)
      const pid = uid('plan');
      data.plans = {};
      data.plans[pid] = { id: pid, name: 'Klasse', leaderId: '', weeks: {} };
      data.settings.activePlanId = pid;
      saveData(true);
      fillPlanSelect();
      renderAll();
      toast('Klasse zurückgesetzt');
      return;
    }

    // remove
    const currentId = plan.id;
    delete data.plans[currentId];

    // choose next active
    const remaining = Object.keys(data.plans);
    data.settings.activePlanId = remaining[0] || '';
    saveData(true);
    fillPlanSelect();
    renderAll();
    toast('Klasse entfernt');
  }

  function onPlanLeaderChange(){
    const sel = $('#planLeaderSelect');
    const plan = getActivePlan();
    if(!sel || !plan) return;
    plan.leaderId = sel.value || '';
    saveData(true);
    renderAll();
  }

  function fillTeacherSelects(){
    const opts = [{ value: '', label: '—' }].concat(
      data.teachers.map(t => ({ value: t.id, label: t.short ? `${t.name} (${t.short})` : t.name }))
    );

    const entryTeacher = $('#entryTeacher');
    const subjDefaultTeacher = $('#subjectDefaultTeacher');

    entryTeacher.innerHTML = '';
    subjDefaultTeacher.innerHTML = '';

    for(const o of opts){
      const opt1 = document.createElement('option');
      opt1.value = o.value;
      opt1.textContent = o.label;
      entryTeacher.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = o.value;
      opt2.textContent = o.label;
      subjDefaultTeacher.appendChild(opt2);
    }
  }

  function fillSubjectSelect(){
    const sel = $('#entrySubject');
    sel.innerHTML = '';
    for(const s of data.subjects){
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    }
  }

  function fillSpecialSelect(){
    const sel = $('#entrySpecial');
    sel.innerHTML = '';
    for(const s of data.specials){
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.title;
      sel.appendChild(opt);
    }
  }

  // ---- Rendering ----

  function renderAll(){
    renderTop();
    renderSidebar();
    renderTimetable();

    // Berlin legal holidays (async) – updates timetable when loaded
    ensureBerlinHolidayMap();

    const hKey = `${view.stateCode}|${view.isoYear}|${view.isoWeek}`;
    if(hKey !== lastHolidayRenderKey){
      lastHolidayRenderKey = hKey;
      renderHolidays();
    }
    updatePlacementUI();
    syncWeekNotesUI();
  }

  function renderTop(){
    $('#yearInput').value = String(view.isoYear);

    fillPlanLeaderSelect();

    // holiday reference (Berlin)
    const beBtn = $('#btnStateBE');
    if(beBtn){ beBtn.classList.add('active'); }
    view.stateCode = 'BE';

    syncHolidayCollapseUI();

    const wd = getWeekDates(view.isoYear, view.isoWeek);
    $('#weekRangeLabel').textContent = `${formatRange(new Date(wd.start), new Date(wd.end))}`;

    const plan = getActivePlan();
    const planName = plan?.name ? plan.name : 'Klasse';
    // include class name so printouts stay unambiguous
    $('#planTitle').textContent = `Stundenplan – ${planName} – KW ${view.isoWeek} / ${view.isoYear}`;
	
	//NEW: title color by class name
	applyPlanTitleColor(planName);
    const mon = new Date(wd.days[0]);
    const fri = new Date(wd.days[4]);
    $('#planSub').textContent = '';
	
	const leaderId = (getActivePlan() && getActivePlan().leaderId) ? getActivePlan().leaderId : '';
    const leader = leaderId ? data.teachers.find(t => t.id === leaderId) : null;
    const leaderLabel = leader ? ` Klassenleitung: ${leader.name}` : '';
	$('#planState').textContent = `${leaderLabel}`;

//    const stateName = STATE_OPTIONS.find(s => s.code === view.stateCode)?.name || view.stateCode;
//    $('#planState').textContent = `Feiertags-Referenz: ${stateName}`;

    $('#appInfo').textContent = `Version ${APP_VERSION} · Nico Siedler · lokal im Browser gespeichert`;

    // keep selector in sync (e.g., after import)
    fillPlanSelect();
  }

  function renderSidebar(){
    // sort teachers alphabetisch nach Name (stabil für Anzeige, ohne IDs zu ändern)
    data.teachers.sort((a, b) => {
      const na = (a.name || '').toLocaleLowerCase('de-DE');
      const nb = (b.name || '').toLocaleLowerCase('de-DE');
      return na.localeCompare(nb, 'de-DE');
    });

    // Counts
    $('#countTeachers').textContent = String(data.teachers.length);
    $('#countSubjects').textContent = String(data.subjects.length);
    $('#countSpecials').textContent = String(data.specials.length);

    // Teachers list
    const tList = $('#teacherList');
    tList.innerHTML = '';
    if(data.teachers.length === 0){
      tList.appendChild(makeEmptyItem('Noch keine Lehrkräfte.'));
    } else {
      for(const t of data.teachers){
        const row = document.createElement('div');
        row.className = 'item teacher-item';

        row.innerHTML = `
          <div class="item-main">
            <div class="item-title"></div>
          </div>
          <button class="icon-btn" title="Bearbeiten" aria-label="Lehrkraft bearbeiten">✎</button>
        `;

        row.querySelector('.item-title').textContent = t.name;

        row.addEventListener('click', (ev) => {
          if(ev.target && ev.target.closest && ev.target.closest('button')) return;
          openTeacherDialog(t.id);
        });

        row.querySelector('button').addEventListener('click', () => openTeacherDialog(t.id));
        tList.appendChild(row);
      }
    }

    // Subjects list
    const sList = $('#subjectList');
    sList.innerHTML = '';
    if(data.subjects.length === 0){
      sList.appendChild(makeEmptyItem('Noch keine Fächer.'));
    } else {
      for(const s of data.subjects){
        const row = document.createElement('div');
        row.className = 'item';

        const defaultTeacher = s.defaultTeacherId ? data.teachers.find(t => t.id === s.defaultTeacherId) : null;

        const token = document.createElement('div');
        token.className = 'token';
        token.draggable = true;
        token.dataset.type = 'subject';
        token.dataset.id = s.id;
        token.innerHTML = `
          <span class="dot" style="background:${s.color}; border-color:${hexToRgba(s.color,.45)}"></span>
          <span class="item-title" style="font-weight:760">${escapeHtml(s.name)}</span>
        `;

        token.addEventListener('click', () => togglePlacement('subject', s.id));
        token.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ type:'subject', id: s.id }));
          e.dataTransfer.effectAllowed = 'copy';
        });

        const main = document.createElement('div');
        main.className = 'item-main';
        main.innerHTML = `
          <div class="item-sub">
            ${defaultTeacher ? `<span class="pill">${escapeHtml(defaultTeacher.short || defaultTeacher.name)}</span>` : `<span class="pill">Standard: —</span>`}
          </div>
        `;

        const edit = document.createElement('button');
        edit.className = 'icon-btn';
        edit.title = 'Bearbeiten';
        edit.setAttribute('aria-label', 'Fach bearbeiten');
        edit.textContent = '✎';
        edit.addEventListener('click', () => openSubjectDialog(s.id));

        row.appendChild(token);
        row.appendChild(main);
        row.appendChild(edit);
        sList.appendChild(row);
      }
    }

    // Specials list
    const spList = $('#specialList');
    spList.innerHTML = '';
    if(data.specials.length === 0){
      spList.appendChild(makeEmptyItem('Noch keine Sondermodule.'));
    } else {
      for(const sp of data.specials){
        const row = document.createElement('div');
        row.className = 'item';

        const token = document.createElement('div');
        token.className = 'token';
        token.draggable = true;
        token.dataset.type = 'special';
        token.dataset.id = sp.id;
        token.innerHTML = `
          <span class="dot" style="background:${sp.color}; border-color:${hexToRgba(sp.color,.45)}"></span>
          <span class="item-title" style="font-weight:760">${escapeHtml(sp.title)}</span>
        `;

        token.addEventListener('click', () => togglePlacement('special', sp.id));
        token.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ type:'special', id: sp.id }));
          e.dataTransfer.effectAllowed = 'copy';
        });

        const main = document.createElement('div');
        main.className = 'item-main';
        main.innerHTML = `<div class="item-sub"><span class="pill">Sonder</span></div>`;

        const edit = document.createElement('button');
        edit.className = 'icon-btn';
        edit.title = 'Bearbeiten';
        edit.setAttribute('aria-label', 'Sondermodul bearbeiten');
        edit.textContent = '✎';
        edit.addEventListener('click', () => openSpecialDialog(sp.id));

        row.appendChild(token);
        row.appendChild(main);
        row.appendChild(edit);
        spList.appendChild(row);
      }
    }

    // Save info
    const last = data.updatedAt ? new Date(data.updatedAt) : null;
    $('#saveInfo').textContent = last ? `Zuletzt gespeichert: ${last.toLocaleString('de-DE')}` : '—';

    fillTeacherSelects();
    fillSubjectSelect();
    fillSpecialSelect();
  }

  function makeEmptyItem(text){
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <div class="item-main">
        <div class="item-title" style="opacity:.7; font-weight:650">${escapeHtml(text)}</div>
      </div>
    `;
    return el;
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function getActivePlan(){
    const pid = data?.settings?.activePlanId;
    if(pid && data.plans && data.plans[pid]) return data.plans[pid];
    const first = data && data.plans ? Object.values(data.plans)[0] : null;
    if(first){
      data.settings.activePlanId = first.id;
      return first;
    }
    return null;
  }

  function allPlans(){
    return data && data.plans ? Object.values(data.plans) : [];
  }

  function forEachWeekInAllPlans(fn){
    for(const p of allPlans()){
      if(!p?.weeks) continue;
      for(const wk of Object.values(p.weeks)){
        fn(wk, p);
      }
    }
  }

  function getWeekObj(){
    const key = weekKey(view.isoYear, view.isoWeek);
    const plan = getActivePlan();
    if(!plan.weeks[key]) plan.weeks[key] = { cells: {}, note: '', classReps: '', qnOwner: '' };
    if(!plan.weeks[key].cells) plan.weeks[key].cells = {};
    if(typeof plan.weeks[key].note !== 'string') plan.weeks[key].note = '';
    if(typeof plan.weeks[key].classReps !== 'string') plan.weeks[key].classReps = '';
    if(typeof plan.weeks[key].qnOwner !== 'string') plan.weeks[key].qnOwner = '';
    return plan.weeks[key];
  }

  function getWeekNote(){
    return getWeekObj().note || '';
  }

  function setWeekNote(note){
    const wk = getWeekObj();
    wk.note = String(note || '');
    saveData();
  }


  function getWeekClassReps(){
    return getWeekObj().classReps || '';
  }

  function setWeekClassReps(val){
    const wk = getWeekObj();
    wk.classReps = String(val || '');
    saveData();
  }

  function getWeekQnOwner(){
    return getWeekObj().qnOwner || '';
  }

  function setWeekQnOwner(val){
    const wk = getWeekObj();
    wk.qnOwner = String(val || '');
    saveData();
  }

  function syncWeekNotesUI(){
    const noteInput = $('#weekNotesInput');
    const notePrint = $('#weekNotesPrint');
    const repsInput = $('#weekClassRepsInput');
    const repsPrint = $('#weekClassRepsPrint');
    const qnInput = $('#weekQnOwnerInput');
    const qnPrint = $('#weekQnOwnerPrint');

    const note = getWeekNote();
    const reps = getWeekClassReps();
    const qn = getWeekQnOwner();

    if(noteInput && document.activeElement !== noteInput) noteInput.value = note;
    if(repsInput && document.activeElement !== repsInput) repsInput.value = reps;
    if(qnInput && document.activeElement !== qnInput) qnInput.value = qn;

    if(notePrint) notePrint.textContent = note.trim();
    if(repsPrint) repsPrint.textContent = reps.trim();
    if(qnPrint) qnPrint.textContent = qn.trim();

    // For print: hide empty blocks
    const noteField = $('#weekNoteField');
    const repsField = $('#weekClassRepsField');
    const qnField = $('#weekQnOwnerField');

    if(noteField) noteField.classList.toggle('print-empty', note.trim().length === 0);
    if(repsField) repsField.classList.toggle('print-empty', reps.trim().length === 0);
    if(qnField) qnField.classList.toggle('print-empty', qn.trim().length === 0);
  }


  function getEntry(day, slot){
    const wk = getWeekObj();
    return wk.cells[`${day}-${slot}`] || null;
  }

  function setEntry(day, slot, entry){
    const wk = getWeekObj();
    const k = `${day}-${slot}`;
    if(!entry || entry.type === 'empty'){
      delete wk.cells[k];
    } else {
      wk.cells[k] = entry;
    }
    saveData();
    renderTimetable();
    renderLegend();
  }

  function setEntries(day, slots, entry){
    const wk = getWeekObj();
    for(const slot of slots){
      const k = `${day}-${slot}`;
      if(!entry || entry.type === 'empty'){
        delete wk.cells[k];
      } else {
        wk.cells[k] = { ...entry };
      }
    }
    saveData();
    renderTimetable();
    renderLegend();
  }

  function clearWeek(){
    const key = weekKey(view.isoYear, view.isoWeek);
    const plan = getActivePlan();
    if(plan?.weeks) delete plan.weeks[key];
    saveData(true);
    renderTimetable();
    renderLegend();
    syncWeekNotesUI();
    toast('Woche geleert');
  }

  function renderTimetable(){
    const el = $('#timetable');
    el.innerHTML = '';

    const wd = getWeekDates(view.isoYear, view.isoWeek);
    weekDayISO = wd.days.map(toISODate);

    // header row
    const corner = document.createElement('div');
    corner.className = 'tt-head tt-corner';
    corner.innerHTML = `<small>Unterrichtsstunden</small>`;
    el.appendChild(corner);

    const dayNames = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
    for(let i=0;i<5;i++){
      const d = new Date(wd.days[i]);
      const hd = document.createElement('div');
      hd.className = 'tt-head';

      const day = i+1;
      const holidayName = getBerlinHolidayNameForDay(day);
      if(holidayName){
        hd.classList.add('is-holiday');
        hd.innerHTML = `${dayNames[i]}<span class="tt-date">${formatDateDMY(d)}</span><span class="holiday-badge">${escapeHtml(holidayName)}</span>`;
        hd.title = holidayName;
      } else {
        hd.innerHTML = `${dayNames[i]}<span class="tt-date">${formatDateDMY(d)}</span>`;
      }
      el.appendChild(hd);
    }

    // rows (4 blocks)
    for(let slot=0; slot<4; slot++){
      const rl = document.createElement('div');
      rl.className = 'tt-rowlabel';
      const label = data.settings.slotLabels[slot] || `Block ${slot+1}`;
      rl.innerHTML = `<div>${escapeHtml(label)}</div>`;
      el.appendChild(rl);

      for(let day=1; day<=5; day++){
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'tt-cell';
        cell.dataset.day = String(day);
        cell.dataset.slot = String(slot);

        const holidayName = getBerlinHolidayNameForDay(day);
        if(holidayName){
          cell.classList.add('is-holiday');
          cell.dataset.holiday = '1';
          cell.dataset.holidayName = holidayName;
          cell.title = holidayName;
        }

        const entry = getEntry(day, slot);
        cell.innerHTML = renderCellHTML(entry);
        applyEntryColorToCell(cell, entry);

        // click
        cell.addEventListener('click', (ev) => {
          ev.preventDefault();
          const d = Number(cell.dataset.day);
          const s = Number(cell.dataset.slot);
          if(cell.dataset.holiday === '1'){
            toast(`Feiertag (Berlin): ${cell.dataset.holidayName || 'Planung gesperrt'}`);
            return;
          }
          if(view.placement){
            applyPlacementToCell(d, s);
          } else {
            openEntryDialog(d, s);
          }
        });

        // dblclick -> clear
        cell.addEventListener('dblclick', (ev) => {
          ev.preventDefault();
          if(cell.dataset.holiday === '1'){
            toast('Feiertag – Feld kann nicht geleert werden.');
            return;
          }
          setEntry(Number(cell.dataset.day), Number(cell.dataset.slot), null);
        });

        // drag over/drop
        cell.addEventListener('dragover', (e) => {
          e.preventDefault();
          if(cell.dataset.holiday === '1'){
            e.dataTransfer.dropEffect = 'none';
            return;
          }
          e.dataTransfer.dropEffect = 'copy';
        });
        cell.addEventListener('drop', (e) => {
          e.preventDefault();
          if(cell.dataset.holiday === '1'){
            toast('Feiertag – Planung gesperrt.');
            return;
          }
          const txt = e.dataTransfer.getData('text/plain');
          const payload = safeJsonParse(txt);
          if(payload && (payload.type === 'subject' || payload.type === 'special') && payload.id){
            view.placement = { type: payload.type, id: payload.id };
            applyPlacementToCell(Number(cell.dataset.day), Number(cell.dataset.slot), true);
          }
        });

        el.appendChild(cell);
      }

      // pause row between blocks (optional, printable)
      if(slot < 3){
        const pr = document.createElement('div');
        pr.className = 'tt-pauselabel';
        const ptxt = (data.settings.pauseLabels && data.settings.pauseLabels[slot]) ? String(data.settings.pauseLabels[slot]).trim() : '';
        pr.innerHTML = `
          <div class="tt-pause-wrap">
            <span class="tt-pause-tag">Pause</span>
            <span class="tt-pause-fill">${escapeHtml(ptxt)}</span>
          </div>
        `;
        el.appendChild(pr);

        for(let day=1; day<=5; day++){
          const gap = document.createElement('div');
          gap.className = 'tt-gap';
          gap.setAttribute('aria-hidden', 'true');
          el.appendChild(gap);
        }
      }
    }

    renderLegend();
  }

  function renderCellHTML(entry){
    if(!entry){
      return `<div class="tt-empty">＋</div>`;
    }

    if(entry.type === 'subject'){
      const subj = data.subjects.find(s => s.id === entry.subjectId);
      const t = entry.teacherId ? data.teachers.find(x => x.id === entry.teacherId) : null;
      return `
        <div class="tt-entry">
          <div class="line1">${escapeHtml(subj?.name || 'Fach')}</div>
          <div class="line2">
            ${t ? `<span class="pill">${escapeHtml(t.short || t.name)}</span>` : ''}
            ${entry.room ? `<span class="pill">${escapeHtml(entry.room)}</span>` : ''}
            ${entry.note ? `<span class="pill">${escapeHtml(entry.note)}</span>` : ''}
          </div>
        </div>
      `;
    }

    if(entry.type === 'special'){
      const sp = data.specials.find(s => s.id === entry.specialId);
      const t = entry.teacherId ? data.teachers.find(x => x.id === entry.teacherId) : null;
      return `
        <div class="tt-entry">
          <div class="line1">${escapeHtml(sp?.title || 'Sonder')}</div>
          <div class="line2">
            ${t ? `<span class="pill">${escapeHtml(t.short || t.name)}</span>` : ''}
            ${entry.room ? `<span class="pill">${escapeHtml(entry.room)}</span>` : ''}
            ${entry.note ? `<span class="pill">${escapeHtml(entry.note)}</span>` : ''}
          </div>
        </div>
      `;
    }

    return `<div class="tt-empty">＋</div>`;
  }

  function renderLegend(){
    const legend = $('#legend');
    legend.innerHTML = '';

    // show only subjects/specials used this week (plus optionally all subjects if empty)
    const wk = getWeekObj();
    const usedSubj = new Set();
    const usedSpec = new Set();

    for(const k of Object.keys(wk.cells || {})){
      const e = wk.cells[k];
      if(!e) continue;
      if(e.type === 'subject' && e.subjectId) usedSubj.add(e.subjectId);
      if(e.type === 'special' && e.specialId) usedSpec.add(e.specialId);
    }

    const items = [];
    for(const id of usedSubj){
      const s = data.subjects.find(x => x.id === id);
      if(s) items.push({ label: s.name, color: s.color });
    }
    for(const id of usedSpec){
      const s = data.specials.find(x => x.id === id);
      if(s) items.push({ label: s.title, color: s.color });
    }

    if(items.length === 0 && data.subjects.length){
      // give a lightweight overview
      for(const s of data.subjects.slice(0, 12)){
        items.push({ label: s.name, color: s.color });
      }
    }

    for(const it of items){
      const el = document.createElement('div');
      el.className = 'legend-item';
      el.innerHTML = `
        <span class="legend-dot" style="background:${it.color}; border-color:${hexToRgba(it.color,.45)}"></span>
        <span>${escapeHtml(it.label)}</span>
      `;
      legend.appendChild(el);
    }
  }


  // ---- Printing ----

  function openPrintDialog(){
    const dlg = $('#printDialog');
    if(!dlg) return window.print();
    const cur = dlg.querySelector('input[name="printMode"][value="current"]');
    if(cur) cur.checked = true;
    dlg.showModal();
  }

  function onPrintSubmit(e){
    e.preventDefault();
    const dlg = $('#printDialog');
    const mode = document.querySelector('#printDialog input[name="printMode"]:checked')?.value || 'current';

    if(mode === 'all'){
      preparePrintAll();
      document.body.classList.add('print-mode-all');
    } else {
      document.body.classList.remove('print-mode-all');
      clearPrintAll();
    }

    if(dlg) dlg.close('ok');

    setTimeout(() => {
      window.print();
    }, 40);
  }

  function clearPrintAll(){
    const c = $('#printAllContainer');
    if(c) c.innerHTML = '';
  }

  function preparePrintAll(){
    const container = $('#printAllContainer');
    if(!container) return;

    container.innerHTML = '';

    const wd = getWeekDates(view.isoYear, view.isoWeek);
    weekDayISO = wd.days.map(toISODate);

    const plans = Object.values(data.plans || {}).filter(Boolean)
      .sort((a,b) => String(a.name||'').localeCompare(String(b.name||''), 'de'));

    for(const plan of plans){
      const section = document.createElement('section');
      section.className = 'print-plan';

      const leader = plan.leaderId ? data.teachers.find(t => t.id === plan.leaderId) : null;
      const leaderLabel = leader ? `Klassenleitung: ${leader.name}` : '';

      const meta = document.createElement('div');
      meta.className = 'plan-meta';
      meta.innerHTML = `
        <div>
          <div class="title">Stundenplan – ${escapeHtml(plan.name || 'Klasse')} – KW ${view.isoWeek} / ${view.isoYear}</div>
        </div>
        <div class="sub">${escapeHtml(leaderLabel)}</div>
      `;

      // apply same color-coding as single-plan title
      const titleEl = meta.querySelector('.title');
      const titleCls = getPlanTitleClass(plan.name || '');
      if(titleEl && titleCls){
        titleEl.classList.add(titleCls);
      }

      section.appendChild(meta);

      const grid = buildTimetableGridForPlan(plan, wd);
      section.appendChild(grid);

      const wk = peekWeekObjForPlan(plan, view.isoYear, view.isoWeek);
      const note = String(wk.note || '').trim();
      const qn = String(wk.qnOwner || '').trim();

      if(note || qn){
        const notesWrap = document.createElement('div');
        notesWrap.className = 'week-notes';

        if(note){
          const f = document.createElement('div');
          f.className = 'week-field';
          f.innerHTML = `
            <div class="week-notes-title">Freitext (optional)</div>
            <div class="week-notes-print">${escapeHtml(note)}</div>
          `;
          notesWrap.appendChild(f);
        }

        if(qn){
          const f = document.createElement('div');
          f.className = 'week-field';
          f.innerHTML = `
            <div class="week-notes-title">Qualifizierungsnachweise – verantwortlich (optional)</div>
            <div class="week-notes-print">${escapeHtml(qn)}</div>
          `;
          notesWrap.appendChild(f);
        }

        section.appendChild(notesWrap);
      }

      container.appendChild(section);
    }
  }

  function peekWeekObjForPlan(plan, isoYear, isoWeek){
    const key = weekKey(isoYear, isoWeek);
    const wk = plan && plan.weeks ? plan.weeks[key] : null;
    if(wk && typeof wk === 'object') return wk;
    return { cells: {}, note: '', classReps: '', qnOwner: '' };
  }

  function buildTimetableGridForPlan(plan, wd){
    const el = document.createElement('div');
    el.className = 'timetable';

    const corner = document.createElement('div');
    corner.className = 'tt-head tt-corner';
    corner.innerHTML = `<span>Block</span>`;
    el.appendChild(corner);

    const dayNames = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
    for(let i=0;i<5;i++){
      const d = new Date(wd.days[i]);
      const hd = document.createElement('div');
      hd.className = 'tt-head';

      const day = i+1;
      const holidayName = getBerlinHolidayNameForDay(day);
      if(holidayName){
        hd.classList.add('is-holiday');
        hd.innerHTML = `${dayNames[i]}<span class="tt-date">${formatDateDMY(d)}</span><span class="holiday-badge">${escapeHtml(holidayName)}</span>`;
        hd.title = holidayName;
      } else {
        hd.innerHTML = `${dayNames[i]}<span class="tt-date">${formatDateDMY(d)}</span>`;
      }
      el.appendChild(hd);
    }

    const wk = peekWeekObjForPlan(plan, view.isoYear, view.isoWeek);

    for(let slot=0; slot<4; slot++){
      const rl = document.createElement('div');
      rl.className = 'tt-rowlabel';
      const label = data.settings.slotLabels[slot] || `Block ${slot+1}`;
      rl.innerHTML = `<div>${escapeHtml(label)}</div>`;
      el.appendChild(rl);

      for(let day=1; day<=5; day++){
        const cell = document.createElement('div');
        cell.className = 'tt-cell';

        const holidayName = getBerlinHolidayNameForDay(day);
        if(holidayName){
          cell.classList.add('is-holiday');
          cell.title = holidayName;
        }

        const entry = (wk.cells && wk.cells[`${day}-${slot}`]) ? wk.cells[`${day}-${slot}`] : null;
        cell.innerHTML = renderCellHTML(entry);
        applyEntryColorToCell(cell, entry);

        el.appendChild(cell);
      }

      if(slot < 3){
        const pr = document.createElement('div');
        pr.className = 'tt-pauselabel';
        const ptxt = (data.settings.pauseLabels && data.settings.pauseLabels[slot]) ? String(data.settings.pauseLabels[slot]).trim() : '';
        pr.innerHTML = `
          <div class="tt-pause-wrap">
            <span class="tt-pause-tag">Pause</span>
            <span class="tt-pause-fill">${escapeHtml(ptxt)}</span>
          </div>
        `;
        el.appendChild(pr);

        for(let day=1; day<=5; day++){
          const gap = document.createElement('div');
          gap.className = 'tt-gap';
          gap.setAttribute('aria-hidden', 'true');
          el.appendChild(gap);
        }
      }
    }

    return el;
  }

  // ---- Placement mode ----

  function togglePlacement(type, id){
    if(view.placement && view.placement.type === type && view.placement.id === id){
      view.placement = null;
    } else {
      view.placement = { type, id };
    }
    updatePlacementUI();
  }

  function updatePlacementUI(){
    // token highlight
    $$('.token').forEach(t => t.classList.remove('armed'));
    if(view.placement){
      const token = document.querySelector(`.token[data-type="${view.placement.type}"][data-id="${view.placement.id}"]`);
      if(token) token.classList.add('armed');
      $('#placeHint').textContent = 'Einfügen aktiv: Feld im Plan antippen oder in den Plan ziehen (Esc zum Abbrechen).';
    } else {
      $('#placeHint').textContent = 'Fach/Sondermodul antippen – anschließend ein Feld im Plan. Oder das Fach direkt in das Wunschfeld ziehen.';
    }
  }

  function applyPlacementToCell(day, slot, keepPlacement=false){
    if(isBerlinHolidayDay(day)){
      toast(`Feiertag (Berlin): ${getBerlinHolidayNameForDay(day) || 'Planung gesperrt'}`);
      return;
    }
    const p = view.placement;
    if(!p) return;

    if(p.type === 'subject'){
      const subj = data.subjects.find(s => s.id === p.id);
      if(!subj) return;
      const entry = {
        type: 'subject',
        subjectId: subj.id,
        teacherId: subj.defaultTeacherId || '',
        room: '',
        note: '',
      };
      setEntry(day, slot, entry);
      toast(`${subj.name} eingefügt`);
    }

    if(p.type === 'special'){
      const sp = data.specials.find(s => s.id === p.id);
      if(!sp) return;
      const entry = {
        type: 'special',
        specialId: sp.id,
        teacherId: '',
        room: '',
        note: '',
      };
      setEntry(day, slot, entry);
      toast(`${sp.title} eingefügt`);
    }

    if(!keepPlacement) view.placement = null;
    updatePlacementUI();
  }

  // ---- Dialogs: Teachers / Subjects / Specials ----

  function openTeacherDialog(id=null){
    const dlg = $('#teacherDialog');
    const t = id ? data.teachers.find(x => x.id === id) : null;

    $('#teacherDialogTitle').textContent = t ? 'Lehrkraft bearbeiten' : 'Lehrkraft hinzufügen';
    $('#teacherName').value = t?.name || '';
    $('#teacherShort').value = t?.short || '';
    $('#teacherEditId').value = t?.id || '';
    $('#teacherDeleteBtn').style.display = t ? 'inline-flex' : 'none';

    dlg.showModal();
  }

  function openSubjectDialog(id=null){
    const dlg = $('#subjectDialog');
    const s = id ? data.subjects.find(x => x.id === id) : null;

    fillTeacherSelects();

    $('#subjectDialogTitle').textContent = s ? 'Fach bearbeiten' : 'Fach hinzufügen';
    $('#subjectName').value = s?.name || '';
    $('#subjectColor').value = s?.color || '#6aa6ff';
    $('#subjectDefaultTeacher').value = s?.defaultTeacherId || '';
    $('#subjectEditId').value = s?.id || '';
    $('#subjectDeleteBtn').style.display = s ? 'inline-flex' : 'none';

    dlg.showModal();
  }

  function openSpecialDialog(id=null){
    const dlg = $('#specialDialog');
    const s = id ? data.specials.find(x => x.id === id) : null;

    $('#specialDialogTitle').textContent = s ? 'Sondermodul bearbeiten' : 'Sonderveranstaltung hinzufügen';
    $('#specialTitle').value = s?.title || '';
    $('#specialColor').value = s?.color || '#ffb86b';
    $('#specialEditId').value = s?.id || '';
    $('#specialDeleteBtn').style.display = s ? 'inline-flex' : 'none';

    dlg.showModal();
  }

  // ---- Dialog: Entry (cell editor) ----

  function openEntryDialog(day, slot){
    if(isBerlinHolidayDay(day)){
      toast(`Feiertag (Berlin): ${getBerlinHolidayNameForDay(day) || 'Planung gesperrt'}`);
      return;
    }
    const dlg = $('#entryDialog');
    const entry = getEntry(day, slot);

    $('#entryDialogTitle').textContent = `Eintrag – ${['Mo','Di','Mi','Do','Fr'][day-1]} / Block ${slot+1}`;

    fillTeacherSelects();
    fillSubjectSelect();
    fillSpecialSelect();

    const type = entry?.type || 'empty';
    $('#entryType').value = type;

    $('#entrySubject').value = entry?.subjectId || (data.subjects[0]?.id || '');
    $('#entrySpecial').value = entry?.specialId || (data.specials[0]?.id || '');
    $('#entryTeacher').value = entry?.teacherId || '';
    $('#entryRoom').value = entry?.room || '';
    $('#entryNote').value = entry?.note || '';

    $('#entryCellKey').value = `${day}-${slot}`;
    $('#entryDeleteBtn').style.display = entry ? 'inline-flex' : 'none';

    // apply-to-blocks UI (same weekday)
    buildApplyGrid(slot);

    // reset teacher-touch state (used for default teacher preselection)
    entryTeacherTouched = false;
    if(type === 'subject'){
      // if teacher is empty, prefill from subject default
      maybeApplyDefaultTeacher(true);
    }

    syncEntryFields();

    dlg.showModal();
  }

  function buildApplyGrid(currentSlot){
    const grid = $('#applyGrid');
    if(!grid) return;
    grid.innerHTML = '';

    const labels = data.settings.slotLabels || ['Block 1','Block 2','Block 3','Block 4'];
    for(let s=0; s<4; s++){
      const lab = document.createElement('label');
      lab.className = 'apply-chip';
      const title = labels[s] || `Block ${s+1}`;
      lab.title = title;
      lab.innerHTML = `<input type="checkbox" name="applySlot" value="${s}" /><span>B${s+1}</span>`;
      const cb = lab.querySelector('input');
      if(s === currentSlot){
        cb.checked = true;
        cb.disabled = true;
      }
      grid.appendChild(lab);
    }
  }

  function maybeApplyDefaultTeacher(force=false){
    const type = $('#entryType')?.value;
    if(type !== 'subject') return;

    const subjectId = $('#entrySubject')?.value;
    if(!subjectId) return;

    const subj = data.subjects.find(s => s.id === subjectId);
    if(!subj?.defaultTeacherId) return;

    const teacherSel = $('#entryTeacher');
    if(!teacherSel) return;

    if(force){
      if(!teacherSel.value) teacherSel.value = subj.defaultTeacherId;
      return;
    }

    if(!entryTeacherTouched){
      teacherSel.value = subj.defaultTeacherId;
    }
  }

  function syncEntryFields(){
    const type = $('#entryType').value;
    const hasSubjects = data.subjects.length > 0;
    const hasSpecials = data.specials.length > 0;

    $('#entrySubjectWrap').style.display = (type === 'subject') ? 'block' : 'none';
    $('#entryTeacherRow').style.display = (type === 'subject' || type === 'special') ? 'grid' : 'none';
    $('#entrySpecialWrap').style.display = (type === 'special') ? 'block' : 'none';
    $('#applyWrap').style.display = (type === 'subject' || type === 'special') ? 'block' : 'none';

    // graceful disable
    $('#entrySubject').disabled = !hasSubjects;
    $('#entrySpecial').disabled = !hasSpecials;

    if(type === 'subject' && !hasSubjects){
      toast('Lege zuerst ein Fach an.');
      $('#entryType').value = 'empty';
    }
    if(type === 'special' && !hasSpecials){
      toast('Lege zuerst eine Sonderveranstaltung an.');
      $('#entryType').value = 'empty';
    }

    if($('#entryType').value === 'subject'){
      maybeApplyDefaultTeacher(false);
    }
  }

  // ---- Settings ----

  function normalizePauseText(s){
    let v = String(s || '').trim();
    v = v.replace(/^pause[\s:\-–—]*/i, '');
    return v.trim();
  }

  function openSettingsDialog(){
    const dlg = $('#settingsDialog');
    const labels = data.settings.slotLabels || ['Block 1','Block 2','Block 3','Block 4'];
    $('#slot1').value = labels[0] || '';
    $('#slot2').value = labels[1] || '';
    $('#slot3').value = labels[2] || '';
    $('#slot4').value = labels[3] || '';

    const pauses = data.settings.pauseLabels || ['', '', ''];
    const p1 = $('#pause1'); const p2 = $('#pause2'); const p3 = $('#pause3');
    if(p1) p1.value = pauses[0] || '';
    if(p2) p2.value = pauses[1] || '';
    if(p3) p3.value = pauses[2] || '';

    const acc = $('#accentSelect');
    if(acc){
      acc.value = data.settings.accentKey || 'blue';
    }
    dlg.showModal();
  }

  // ---- Holidays ----

  function normalizeHolidayState(){
    if(!HOLIDAY_STATE_CODES.includes(view.stateCode)) view.stateCode = 'BE';
    data.settings.stateCode = view.stateCode;
  }

  function setHolidayState(code){
    if(!HOLIDAY_STATE_CODES.includes(code)) code = 'BE';
    view.stateCode = code;
    data.settings.stateCode = code;
    saveData(true);
    renderTop();
    renderHolidays();
  }

  function syncHolidayCollapseUI(){
    const body = $('#holidayBody');
    const btn = $('#btnToggleHolidays');
    if(!body || !btn) return;
    const collapsed = !!data.settings.holidaysCollapsed;
    body.style.display = collapsed ? 'none' : 'block';
    btn.textContent = collapsed ? '▸' : '▾';
  }

  async function ensureBerlinHolidayMap(){
    // fetch for all years that appear in the currently visible week
    const wd = getWeekDates(view.isoYear, view.isoWeek);
    const years = Array.from(new Set(wd.days.map(d => new Date(d).getUTCFullYear()))).sort((a,b) => a-b);
    const key = years.join(',');
    if(key === lastBerlinHolidayKey) return;
    lastBerlinHolidayKey = key;

    try{
      const sets = await Promise.all(years.map(y => fetchBerlinPublicHolidays(y).catch(() => [])));
      const map = new Map();
      for(const it of sets.flat()){
        if(it && it.date) map.set(it.date, it.name || 'Feiertag');
      }
      berlinHolidayMap = map;
    }catch{
      berlinHolidayMap = new Map();
    }

    // re-render to apply day locks (if data arrived after first paint)
    renderTimetable();
  }

  function getBerlinHolidayNameForDay(day){
    const iso = weekDayISO[day-1];
    if(!iso) return '';
    return berlinHolidayMap.get(iso) || '';
  }

  function isBerlinHolidayDay(day){
    return !!getBerlinHolidayNameForDay(day);
  }

  async function renderHolidays(){
    const list = $('#holidayList');
    const status = $('#holidayStatus');
    const hint = $('#holidayHint');

    list.innerHTML = '';
    status.textContent = 'lädt…';
    hint.textContent = '';

    const wd = getWeekDates(view.isoYear, view.isoWeek);
    const weekStart = dateOnly(new Date(wd.days[0]));
    const weekEnd = dateOnly(new Date(wd.days[4]));

    // Reference list: Berliner Schulferien (offline/embedded)
    if(view.stateCode === 'BE'){
      const y = Number(view.isoYear);
      const base = (EMBEDDED_SCHOOL_HOLIDAYS_BE[String(y)] || []).map(h => ({ ...h, type: 'SchoolHoliday', source: 'embedded' }));
      const holidays = base.map(holidayToRange).sort((a,b)=> String(a.startDate).localeCompare(String(b.startDate)));
      status.textContent = `Berlin · ${y}`;
      if(!holidays.length){
        list.appendChild(makeEmptyItem('Keine Daten für dieses Jahr (Liste endet 2030).'));
      } else {
        for(const h of holidays){
          list.appendChild(renderHolidayRow(h, false));
        }
      }
      hint.textContent = 'Quelle: berlin.de (Ferienordnung) – Anzeige als Referenzliste.';
      return;
    }

try{
      // fetch year-1/year/year+1 to cover cross-year holidays
      const years = [view.isoYear - 1, view.isoYear, view.isoYear + 1];
      const sets = await Promise.all(years.map(y => fetchHolidays(view.stateCode, y).catch(() => [])));
      const all = sets.flat().map(holidayToRange);

      // de-dup by slug
      const bySlug = new Map();
      for(const h of all){
        if(h.slug) bySlug.set(h.slug, h);
      }
      const holidays = Array.from(bySlug.values()).sort((a,b) => String(a.startDate).localeCompare(String(b.startDate)));

      const overlapping = holidays.filter(h => rangesOverlap(h.startDate, h.endDate, weekStart, weekEnd));
      const upcoming = holidays.filter(h => h.startDate > weekEnd).slice(0, 4);

      status.textContent = overlapping.length ? `${overlapping.length} in dieser Woche` : 'keine in dieser Woche';

      if(overlapping.length){
        for(const h of overlapping){
          list.appendChild(renderHolidayRow(h, true));
        }
      }

      if(upcoming.length){
        if(overlapping.length) list.appendChild(separatorRow('Nächste Ferien'));
        for(const h of upcoming){
          list.appendChild(renderHolidayRow(h, false));
        }
      }

      if(!overlapping.length && !upcoming.length){
        list.appendChild(makeEmptyItem('Keine Daten gefunden.'));
      }

      hint.textContent = 'Quelle: OpenHolidays API (Schulferien) – Fallback: ferien-api.de';

    } catch(err){
      status.textContent = 'offline';
      list.appendChild(makeEmptyItem('Ferien konnten nicht geladen werden (keine Verbindung oder API blockiert).'));
      hint.textContent = 'Tipp: Wenn du offline planst: kein Problem – Stundenplan funktioniert komplett lokal.';
    }
  }

  function separatorRow(text){
    const el = document.createElement('div');
    el.className = 'item';
    el.style.background = 'rgba(255,255,255,.02)';
    el.innerHTML = `<div class="item-main"><div class="item-title" style="font-size:12px; opacity:.75; font-weight:760">${escapeHtml(text)}</div></div>`;
    return el;
  }

  function renderHolidayRow(h, highlight){
    const el = document.createElement('div');
    el.className = 'item';
    const accent = accentHexFor(data.settings.accentKey);
    if(highlight) el.style.borderColor = hexToRgba(accent, .55);

    const name = prettyHolidayName(h.name);
    const range = `${formatDateShort(h.startDate)}–${formatDateShort(h.endDate)}`;

    el.innerHTML = `
      <div class="dot" style="background:${hexToRgba(accent, .25)}"></div>
      <div class="item-main">
        <div class="item-title">${escapeHtml(name)}</div>
        <div class="item-sub"><span class="pill">${escapeHtml(range)}</span><span class="pill">${escapeHtml(h.stateCode || view.stateCode)}</span></div>
      </div>
    `;
    return el;
  }

  // ---- Events wiring ----

  function init(){
    data = loadData();

    applyAccent();

    // Keep accent in sync if the OS theme changes while the app is open
    try{
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        applyAccent();
      });
    } catch {}

    // default view week/year
    const now = new Date();
    const iso = getIsoWeekYear(now);
    view.isoYear = Math.max(2024, iso.isoYear);
    view.isoWeek = iso.isoWeek;

    view.stateCode = data.settings.stateCode || 'BE';
    normalizeHolidayState();

    $('#yearInput').value = String(view.isoYear);

    fillWeekSelect();

    // class/plan selector
    fillPlanSelect();

    // listeners
    $('#btnToggleSidebar').addEventListener('click', toggleSidebar);

    // right pane (holidays) hide/show
    $('#btnToggleHolidayPane').addEventListener('click', toggleHolidayPane);

    $('#btnPrevWeek').addEventListener('click', () => shiftWeek(-1));
    $('#btnNextWeek').addEventListener('click', () => shiftWeek(1));

    $('#btnToday').addEventListener('click', goToToday);
    $('#btnHelp').addEventListener('click', () => $('#helpDialog')?.showModal());
    $('#btnReload').addEventListener('click', () => location.reload());

    $('#yearInput').addEventListener('change', () => {
      view.isoYear = clamp(Number($('#yearInput').value || 2024), 2024, 2099);
      fillWeekSelect();
      saveSettings();
      renderAll();
    });

    $('#weekSelect').addEventListener('change', () => {
      view.isoWeek = clamp(Number($('#weekSelect').value || 1), 1, weeksInIsoYear(view.isoYear));
      renderAll();
    });

    $('#planSelect').addEventListener('change', () => {
      const pid = $('#planSelect').value;
      if(pid && data.plans[pid]){
        data.settings.activePlanId = pid;
        saveData(true);
        renderAll();
      }
    });

    $('#btnAddPlan').addEventListener('click', (e) => { e.preventDefault(); addPlan(); });
    $('#btnRenamePlan').addEventListener('click', (e) => { e.preventDefault(); renameActivePlan(); });
    $('#btnDeletePlan').addEventListener('click', (e) => { e.preventDefault(); deleteActivePlan(); });
    $('#planLeaderSelect')?.addEventListener('change', onPlanLeaderChange);

    // holiday reference (Berlin)
    const beBtn = $('#btnStateBE');
    if(beBtn) beBtn.addEventListener('click', () => setHolidayState('BE'));

    $('#btnToggleHolidays').addEventListener('click', () => {
      data.settings.holidaysCollapsed = !data.settings.holidaysCollapsed;
      saveData(true);
      syncHolidayCollapseUI();
    });

    // "Abbrechen" buttons: close the nearest dialog (submit handlers won't swallow them)
    $$('[data-cancel]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dlg = btn.closest('dialog');
        if(dlg && typeof dlg.close === 'function') dlg.close('cancel');
      });
    });

    $('#btnAddTeacher').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openTeacherDialog(); });
    $('#btnAddSubject').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openSubjectDialog(); });
    $('#btnAddSpecial').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openSpecialDialog(); });

    $('#btnSettings').addEventListener('click', openSettingsDialog);

    $('#btnSaveNow').addEventListener('click', () => { saveData(true); toast('Gespeichert'); });

    $('#btnExport').addEventListener('click', () => {
      const plan = getActivePlan();
      const safeName = (plan?.name || 'Klasse').replace(/[^a-z0-9\-_. ]/gi,'').trim().replace(/\s+/g,'_');
      const fn = `BWK_Stundenplan_${safeName}_${weekKey(view.isoYear, view.isoWeek)}.json`;
      downloadJSON(data, fn);
      toast('Export erstellt');
    });

    $('#btnImport').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', onImportFile);

    $('#btnPrint').addEventListener('click', openPrintDialog);

    // week notes
    $('#weekNotesInput').addEventListener('input', (e) => {
      setWeekNote(e.target.value);
      syncWeekNotesUI();
    });

    // week meta (optional)
    $('#weekClassRepsInput')?.addEventListener('input', (e) => {
      setWeekClassReps(e.target.value);
      syncWeekNotesUI();
    });

    $('#weekQnOwnerInput')?.addEventListener('input', (e) => {
      setWeekQnOwner(e.target.value);
      syncWeekNotesUI();
    });

    // ensure print only shows notes if filled
    window.addEventListener('beforeprint', () => {
      const note = getWeekNote().trim();
      const reps = getWeekClassReps().trim();
      const qn = getWeekQnOwner().trim();
      document.body.classList.toggle('print-has-meta', (note.length + reps.length + qn.length) > 0);
      syncWeekNotesUI();
    });

    window.addEventListener('afterprint', () => {
      document.body.classList.remove('print-mode-all');
      clearPrintAll();
    });

    $('#btnClearWeek').addEventListener('click', () => {
      const ok = confirm(`Woche KW ${view.isoWeek}/${view.isoYear} wirklich leeren?`);
      if(ok) clearWeek();
    });

    // dialog submit handlers
    $('#teacherForm').addEventListener('submit', onTeacherSubmit);
    $('#teacherDeleteBtn').addEventListener('click', onTeacherDelete);

    $('#subjectForm').addEventListener('submit', onSubjectSubmit);
    $('#subjectDeleteBtn').addEventListener('click', onSubjectDelete);

    $('#specialForm').addEventListener('submit', onSpecialSubmit);
    $('#specialDeleteBtn').addEventListener('click', onSpecialDelete);

    $('#entryType').addEventListener('change', syncEntryFields);
    $('#entrySubject').addEventListener('change', () => maybeApplyDefaultTeacher(false));
    $('#entryTeacher').addEventListener('change', () => { entryTeacherTouched = true; });
    $('#entryForm').addEventListener('submit', onEntrySubmit);
    $('#printForm')?.addEventListener('submit', onPrintSubmit);
    $('#entryDeleteBtn').addEventListener('click', onEntryDelete);

    $('#settingsForm').addEventListener('submit', onSettingsSubmit);

    // import dialog actions
    $('#importCancel').addEventListener('click', () => $('#importDialog').close());
    $('#importReplace').addEventListener('click', () => applyImport('replace'));
    $('#importMerge').addEventListener('click', () => applyImport('merge'));

    // Escape cancels placement
    window.addEventListener('keydown', (e) => {
      if(e.key === 'Escape' && view.placement){
        view.placement = null;
        updatePlacementUI();
      }
    });

    // initial save info
    $('#saveInfo').textContent = data.updatedAt ? `Zuletzt gespeichert: ${new Date(data.updatedAt).toLocaleString('de-DE')}` : '—';

    // initial holiday pane state
    syncHolidayPaneUI();

    renderAll();
  }

  function setHolidayPaneHidden(hidden){
    data.settings.holidaysPaneHidden = !!hidden;
    saveData(true);
    syncHolidayPaneUI();
  }

  function toggleHolidayPane(){
    setHolidayPaneHidden(!data.settings.holidaysPaneHidden);
  }

  function syncHolidayPaneUI(){
    const hidden = !!data?.settings?.holidaysPaneHidden;
    document.body.classList.toggle('holidays-hidden', hidden);
    // keep the top button visually consistent
    const btn = $('#btnToggleHolidayPane');
    if(btn){
      btn.classList.toggle('is-off', hidden);
      btn.title = hidden ? 'Ferien anzeigen' : 'Ferien ausblenden';
      btn.setAttribute('aria-label', hidden ? 'Ferien anzeigen' : 'Ferien ausblenden');
    }
  }

  function toggleSidebar(){
    const sidebar = $('#sidebar');
    if(window.matchMedia('(max-width: 760px)').matches){
      sidebar.classList.toggle('open');
    } else {
      document.body.classList.toggle('sidebar-collapsed');
    }
  }

  function shiftWeek(delta){
    const maxWeeks = weeksInIsoYear(view.isoYear);
    let w = view.isoWeek + delta;
    let y = view.isoYear;

    if(w < 1){
      y -= 1;
      y = Math.max(2024, y);
      w = weeksInIsoYear(y);
    } else if(w > maxWeeks){
      y += 1;
      y = Math.min(2099, y);
      w = 1;
    }

    view.isoYear = y;
    view.isoWeek = w;

    $('#yearInput').value = String(y);
    fillWeekSelect();

    renderAll();
  }

  function goToToday(){
    const now = new Date();
    const iso = getIsoWeekYear(now);
    view.isoYear = clamp(Math.max(2024, iso.isoYear), 2026, 2099);
    view.isoWeek = clamp(iso.isoWeek, 1, weeksInIsoYear(view.isoYear));

    $('#yearInput').value = String(view.isoYear);
    fillWeekSelect();
    renderAll();
    toast('Zur aktuellen Woche');
  }

  function saveSettings(){
    data.settings.stateCode = view.stateCode;
    saveData(true);
  }

  // ---- Submit handlers ----

  function onTeacherSubmit(e){
    e.preventDefault();

    const id = $('#teacherEditId').value || '';
    const name = $('#teacherName').value.trim();
    const short = $('#teacherShort').value.trim();

    if(!name) return;

    if(id){
      const t = data.teachers.find(x => x.id === id);
      if(t){
        t.name = name;
        t.short = short;
      }
    } else {
      data.teachers.push({ id: uid('t'), name, short });
    }

    $('#teacherDialog').close();
    saveData(true);
    // Re-render everything so the class leader dropdown (top bar)
    // immediately includes newly created/edited teachers.
    renderAll();
    toast('Lehrkraft gespeichert');
  }

  function onTeacherDelete(){
    const id = $('#teacherEditId').value;
    if(!id) return;
    const ok = confirm('Lehrkraft löschen? (Zuweisungen im Plan bleiben leer.)');
    if(!ok) return;

    data.teachers = data.teachers.filter(t => t.id !== id);

    // remove references
    forEachWeekInAllPlans((wk) => {
      if(!wk?.cells) return;
      for(const k of Object.keys(wk.cells)){
        const e = wk.cells[k];
        if(e && e.teacherId === id) e.teacherId = '';
      }
    });

    // clear as class leader
    for(const p of Object.values(data.plans || {})){
      if(p && p.leaderId === id) p.leaderId = '';
    }

    $('#teacherDialog').close();
    saveData(true);
    renderAll();
    toast('Lehrkraft gelöscht');
  }

  function onSubjectSubmit(e){
    e.preventDefault();

    const id = $('#subjectEditId').value || '';
    const name = $('#subjectName').value.trim();
    const color = $('#subjectColor').value || '#6aa6ff';
    const defaultTeacherId = $('#subjectDefaultTeacher').value || '';

    if(!name) return;

    if(id){
      const s = data.subjects.find(x => x.id === id);
      if(s){
        s.name = name;
        s.color = color;
        s.defaultTeacherId = defaultTeacherId;
      }
    } else {
      data.subjects.push({ id: uid('s'), name, color, defaultTeacherId });
    }

    $('#subjectDialog').close();
    saveData(true);
    renderAll();
    toast('Fach gespeichert');
  }

  function onSubjectDelete(){
    const id = $('#subjectEditId').value;
    if(!id) return;
    const ok = confirm('Fach löschen? (Einträge im Plan werden leer.)');
    if(!ok) return;

    data.subjects = data.subjects.filter(s => s.id !== id);

    // remove references
    forEachWeekInAllPlans((wk) => {
      if(!wk?.cells) return;
      for(const k of Object.keys(wk.cells)){
        const e = wk.cells[k];
        if(e && e.type === 'subject' && e.subjectId === id){
          delete wk.cells[k];
        }
      }
    });

    if(view.placement?.type === 'subject' && view.placement.id === id) view.placement = null;

    $('#subjectDialog').close();
    saveData(true);
    renderAll();
    toast('Fach gelöscht');
  }

  function onSpecialSubmit(e){
    e.preventDefault();

    const id = $('#specialEditId').value || '';
    const title = $('#specialTitle').value.trim();
    const color = $('#specialColor').value || '#ffb86b';

    if(!title) return;

    if(id){
      const s = data.specials.find(x => x.id === id);
      if(s){
        s.title = title;
        s.color = color;
      }
    } else {
      data.specials.push({ id: uid('sp'), title, color });
    }

    $('#specialDialog').close();
    saveData(true);
    renderAll();
    toast('Sonder gespeichert');
  }

  function onSpecialDelete(){
    const id = $('#specialEditId').value;
    if(!id) return;
    const ok = confirm('Sondermodul löschen? (Einträge im Plan werden leer.)');
    if(!ok) return;

    data.specials = data.specials.filter(s => s.id !== id);

    forEachWeekInAllPlans((wk) => {
      if(!wk?.cells) return;
      for(const k of Object.keys(wk.cells)){
        const e = wk.cells[k];
        if(e && e.type === 'special' && e.specialId === id){
          delete wk.cells[k];
        }
      }
    });

    if(view.placement?.type === 'special' && view.placement.id === id) view.placement = null;

    $('#specialDialog').close();
    saveData(true);
    renderAll();
    toast('Sonder gelöscht');
  }

  function onEntrySubmit(e){
    e.preventDefault();

    const key = $('#entryCellKey').value;
    const [dayStr, slotStr] = key.split('-');
    const day = Number(dayStr);
    const slot = Number(slotStr);

    const type = $('#entryType').value;
    if(type === 'empty'){
      setEntry(day, slot, null);
      $('#entryDialog').close('ok');
      toast('Feld geleert');
      return;
    }

    // selected blocks (same weekday)
    let slots = $$('#applyGrid input[name="applySlot"]:checked').map(x => Number(x.value));
    if(!slots.length) slots = [slot];

    const teacherId = $('#entryTeacher').value || '';
    const room = $('#entryRoom').value.trim();
    const note = $('#entryNote').value.trim();

    if(type === 'subject'){
      const subjectId = $('#entrySubject').value;
      if(!subjectId){
        toast('Bitte ein Fach wählen.');
        return;
      }
      setEntries(day, slots, { type:'subject', subjectId, teacherId, room, note });
    }

    if(type === 'special'){
      const specialId = $('#entrySpecial').value;
      if(!specialId){
        toast('Bitte eine Sonderveranstaltung wählen.');
        return;
      }
      setEntries(day, slots, { type:'special', specialId, teacherId, room, note });
    }

    $('#entryDialog').close('ok');
    toast('Eintrag gespeichert');
  }

  function onEntryDelete(){
    const key = $('#entryCellKey').value;
    const [dayStr, slotStr] = key.split('-');
    setEntry(Number(dayStr), Number(slotStr), null);
    $('#entryDialog').close('ok');
    toast('Eintrag gelöscht');
  }

  function onSettingsSubmit(e){
    e.preventDefault();
    data.settings.slotLabels = [
      $('#slot1').value.trim() || 'Block 1',
      $('#slot2').value.trim() || 'Block 2',
      $('#slot3').value.trim() || 'Block 3',
      $('#slot4').value.trim() || 'Block 4',
    ];

    data.settings.pauseLabels = [
      normalizePauseText($('#pause1')?.value),
      normalizePauseText($('#pause2')?.value),
      normalizePauseText($('#pause3')?.value),
    ];

    const acc = $('#accentSelect')?.value;
    if(acc && ACCENT_PRESETS[acc]) data.settings.accentKey = acc;
    applyAccent();

  // remove any existing title-* classes (safe & future-proof)
  [...el.classList].forEach(c => {
    if(c.startsWith('title-')) el.classList.remove(c);
  });

  if(!planName) return;

  const hit = PLAN_TITLE_COLOR_MAP.find(x => x.match.test(planName));
  if(hit) el.classList.add(hit.cls);

    $('#settingsDialog').close();
    saveData(true);
    renderTimetable();
    toast('Einstellungen gespeichert');
  }

  // ---- Import ----

  async function onImportFile(){
    const input = $('#importFile');
    const file = input.files && input.files[0];
    input.value = '';

    if(!file) return;

    try{
      const text = await file.text();
      const parsed = safeJsonParse(text);
      if(!parsed){
        toast('Import fehlgeschlagen (kein JSON).');
        return;
      }

      view.pendingImport = normalizeData(parsed);
      $('#importDialog').showModal();

    } catch {
      toast('Import fehlgeschlagen.');
    }
  }

  function applyImport(mode){
    const incoming = view.pendingImport;
    if(!incoming){
      $('#importDialog').close();
      return;
    }

    if(mode === 'replace'){
      data = incoming;
    } else {
      // merge: keep existing entries, fill missing
      const merged = normalizeData(data);

      const addUnique = (arr, items) => {
        const ids = new Set(arr.map(x => x.id));
        for(const it of items){
          if(it && it.id && !ids.has(it.id)){
            arr.push(it);
            ids.add(it.id);
          }
        }
      };

      addUnique(merged.teachers, incoming.teachers);
      addUnique(merged.subjects, incoming.subjects);
      addUnique(merged.specials, incoming.specials);

      // weeks: do not overwrite existing cells
      for(const [wkKey, wk] of Object.entries(incoming.weeks || {})){
        if(!wk || !wk.cells) continue;
        if(!merged.weeks[wkKey]) merged.weeks[wkKey] = { cells: {}, note: '' };
        const target = merged.weeks[wkKey].cells;
        for(const [cellKey, entry] of Object.entries(wk.cells)){
          if(!target[cellKey]) target[cellKey] = entry;
        }

        // copy week note only if the current one is empty
        if(typeof merged.weeks[wkKey].note !== 'string') merged.weeks[wkKey].note = '';
        const incomingNote = (typeof wk.note === 'string') ? wk.note.trim() : '';
        if(!merged.weeks[wkKey].note.trim() && incomingNote) merged.weeks[wkKey].note = incomingNote;
      }

      // settings: keep current slot labels/state unless missing
      merged.settings = merged.settings || {};
      merged.settings.stateCode = merged.settings.stateCode || incoming.settings?.stateCode || 'BE';
      merged.settings.slotLabels = (merged.settings.slotLabels && merged.settings.slotLabels.length) ? merged.settings.slotLabels : (incoming.settings?.slotLabels || ['Block 1','Block 2','Block 3','Block 4']);
      merged.settings.pauseLabels = (Array.isArray(merged.settings.pauseLabels) && merged.settings.pauseLabels.length) ? merged.settings.pauseLabels : (incoming.settings?.pauseLabels || ['', '', '']);
      merged.settings.pauseLabels = merged.settings.pauseLabels.slice(0,3);
      while(merged.settings.pauseLabels.length < 3) merged.settings.pauseLabels.push('');

      data = merged;
    }

    view.pendingImport = null;
    $('#importDialog').close();

    // sync view
    view.stateCode = data.settings.stateCode || view.stateCode;
    normalizeHolidayState();

    saveData(true);
    renderAll();
    toast(mode === 'replace' ? 'Import: ersetzt' : 'Import: zusammengeführt');
  }

// ---- Start ----
document.addEventListener('DOMContentLoaded', init);

})();
