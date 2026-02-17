/* BWK Stundenplan – script.js
   - local first (localStorage)
   - ISO week based
   - 4 Doppelblöcke / Tag, Mo–Fr
   - quick place mode + drag&drop
   - print A4 landscape
   - v.0.6 Nico Siedler (ricodelsien)
*/

(() => {
  'use strict';

  const STORAGE_KEY = 'bwk_stundenplan_v1';
  const HOLIDAY_CACHE_KEY = 'bwk_stundenplan_holiday_cache_v1';
  const PUBLIC_HOLIDAY_CACHE_KEY = 'bwk_stundenplan_public_holiday_cache_v1';
  const APP_VERSION = '0.6';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---- State ----
  let data = null;
  let view = {
    isoYear: 2026,
    isoWeek: 1,
    stateCode: 'BE',
    placement: null, // {type:'subject'|'special', id}
    pendingImport: null,
  };

  let saveTimer = null;
  let holidayCache = loadHolidayCache();
  let publicHolidayCache = loadPublicHolidayCache();
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
        accentKey: 'blue',
      },
      teachers: [],
      subjects: [],
      specials: [],
      weeks: {}, // { [weekKey]: { cells: { 'day-slot': entry }, note: string } }
    };
  }

  function normalizeData(d){
    if(!d || typeof d !== 'object') return defaultData();
    const base = defaultData();
    const out = {
      ...base,
      ...d,
      settings: { ...base.settings, ...(d.settings||{}) },
      teachers: Array.isArray(d.teachers) ? d.teachers : [],
      subjects: Array.isArray(d.subjects) ? d.subjects : [],
      specials: Array.isArray(d.specials) ? d.specials : [],
      weeks: (d.weeks && typeof d.weeks === 'object') ? d.weeks : {},
    };
    // ensure slotLabels length 4
    if(!Array.isArray(out.settings.slotLabels)) out.settings.slotLabels = base.settings.slotLabels.slice();
    out.settings.slotLabels = out.settings.slotLabels.slice(0,4);
    while(out.settings.slotLabels.length < 4) out.settings.slotLabels.push(base.settings.slotLabels[out.settings.slotLabels.length]);

    // accent
    if(!out.settings.accentKey || !ACCENT_PRESETS[out.settings.accentKey]){
      out.settings.accentKey = base.settings.accentKey;
    }

    // ensure unique ids
    out.teachers = out.teachers.filter(t => t && t.id && t.name);
    out.subjects = out.subjects.filter(s => s && s.id && s.name);
    out.specials = out.specials.filter(s => s && s.id && s.title);

    // normalize weeks shape (older exports may only have {cells})
    for(const [k, wk] of Object.entries(out.weeks || {})){
      if(!wk || typeof wk !== 'object'){
        out.weeks[k] = { cells: {}, note: '' };
        continue;
      }
      if(!wk.cells || typeof wk.cells !== 'object') wk.cells = {};
      if(typeof wk.note !== 'string') wk.note = '';
    }

    return out;
  }

  function loadData(){
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? safeJsonParse(raw) : null;
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
    const cacheKey = `${stateCode}-${year}`;
    const cached = holidayCache[cacheKey];
    if(cached && Array.isArray(cached.items) && cached.fetchedAt){
      return cached.items;
    }

    const url = `https://ferien-api.de/api/v1/holidays/${stateCode}/${year}`;
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if(!Array.isArray(json)) return [];

    holidayCache[cacheKey] = { fetchedAt: new Date().toISOString(), items: json };
    saveHolidayCache();
    return json;
  }

  function holidayToRange(h){
    // API returns UTC timestamps.
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

    // holiday reference buttons (BE/BB)
    const beBtn = $('#btnStateBE');
    const bbBtn = $('#btnStateBB');
    if(beBtn && bbBtn){
      beBtn.classList.toggle('active', view.stateCode === 'BE');
      bbBtn.classList.toggle('active', view.stateCode === 'BB');
    }

    syncHolidayCollapseUI();

    const wd = getWeekDates(view.isoYear, view.isoWeek);
    $('#weekRangeLabel').textContent = `${formatRange(new Date(wd.start), new Date(wd.end))}`;

    $('#planTitle').textContent = `Stundenplan – KW ${view.isoWeek} / ${view.isoYear}`;
    const mon = new Date(wd.days[0]);
    const fri = new Date(wd.days[4]);
    $('#planSub').textContent = `${formatDateLong(mon)} – ${formatDateLong(fri)}`;

    const stateName = STATE_OPTIONS.find(s => s.code === view.stateCode)?.name || view.stateCode;
    $('#planState').textContent = `Feiertags-Referenz: ${stateName}`;

    $('#appInfo').textContent = `Version ${APP_VERSION} · Nico Siedler · lokal im Browser gespeichert`;
  }

  function renderSidebar(){
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
        row.className = 'item';
        const accent = accentHexFor(data.settings.accentKey);
        row.innerHTML = `
          <div class="dot" style="background:${hexToRgba(accent, .35)}"></div>
          <div class="item-main">
            <div class="item-title"></div>
            <div class="item-sub"></div>
          </div>
          <button class="icon-btn" title="Bearbeiten" aria-label="Lehrkraft bearbeiten">✎</button>
        `;
        row.querySelector('.item-title').textContent = t.name;
        row.querySelector('.item-sub').innerHTML = t.short ? `<span class="pill">${escapeHtml(t.short)}</span>` : `<span class="pill">ohne Kürzel</span>`;
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
            ${defaultTeacher ? `<span class="pill">Standard: ${escapeHtml(defaultTeacher.short || defaultTeacher.name)}</span>` : `<span class="pill">Standard: —</span>`}
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

  function getWeekObj(){
    const key = weekKey(view.isoYear, view.isoWeek);
    if(!data.weeks[key]) data.weeks[key] = { cells: {}, note: '' };
    if(!data.weeks[key].cells) data.weeks[key].cells = {};
    if(typeof data.weeks[key].note !== 'string') data.weeks[key].note = '';
    return data.weeks[key];
  }

  function getWeekNote(){
    return getWeekObj().note || '';
  }

  function setWeekNote(note){
    const wk = getWeekObj();
    wk.note = String(note || '');
    saveData();
  }

  function syncWeekNotesUI(){
    const input = $('#weekNotesInput');
    const print = $('#weekNotesPrint');
    if(!input || !print) return;
    const note = getWeekNote();
    if(document.activeElement !== input) input.value = note;
    print.textContent = note.trim();
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
    delete data.weeks[key];
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
    corner.innerHTML = `<span>Block</span><span class="small">(Doppel)</span>`;
    el.appendChild(corner);

    const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
    for(let i=0;i<5;i++){
      const d = new Date(wd.days[i]);
      const hd = document.createElement('div');
      hd.className = 'tt-head';

      const day = i+1;
      const holidayName = getBerlinHolidayNameForDay(day);
      if(holidayName){
        hd.classList.add('is-holiday');
        hd.innerHTML = `${dayNames[i]}<span class="tt-date">${formatDateShort(d)}</span><span class="holiday-badge">${escapeHtml(holidayName)}</span>`;
        hd.title = holidayName;
      } else {
        hd.innerHTML = `${dayNames[i]}<span class="tt-date">${formatDateShort(d)}</span>`;
      }
      el.appendChild(hd);
    }

    // rows (4 blocks)
    for(let slot=0; slot<4; slot++){
      const rl = document.createElement('div');
      rl.className = 'tt-rowlabel';
      const label = data.settings.slotLabels[slot] || `Block ${slot+1}`;
      rl.innerHTML = `<div>${escapeHtml(label)}</div><div class="time">Doppelblock</div>`;
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
      const color = subj?.color || '#6aa6ff';
      const bg = hexToRgba(color, 0.12);
      return `
        <div class="tt-entry">
          <div class="line1">${escapeHtml(subj?.name || 'Fach')}</div>
          <div class="line2">
            ${t ? `<span class="pill">${escapeHtml(t.short || t.name)}</span>` : ''}
            ${entry.room ? `<span class="pill">${escapeHtml(entry.room)}</span>` : ''}
            ${entry.note ? `<span class="pill">${escapeHtml(entry.note)}</span>` : ''}
          </div>
          <div class="colorbar" style="background:${color}; border-color:${hexToRgba(color,.35)}"></div>
        </div>
      `;
    }

    if(entry.type === 'special'){
      const sp = data.specials.find(s => s.id === entry.specialId);
      const t = entry.teacherId ? data.teachers.find(x => x.id === entry.teacherId) : null;
      const color = sp?.color || '#ffb86b';
      return `
        <div class="tt-entry">
          <div class="line1">${escapeHtml(sp?.title || 'Sonder')}</div>
          <div class="line2">
            ${t ? `<span class="pill">${escapeHtml(t.short || t.name)}</span>` : ''}
            ${entry.room ? `<span class="pill">${escapeHtml(entry.room)}</span>` : ''}
            ${entry.note ? `<span class="pill">${escapeHtml(entry.note)}</span>` : ''}
          </div>
          <div class="colorbar" style="background:${color}; border-color:${hexToRgba(color,.35)}"></div>
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
      $('#placeHint').textContent = 'Einfügen aktiv: Feld im Plan antippen. (Esc zum Abbrechen).';
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

  function openSettingsDialog(){
    const dlg = $('#settingsDialog');
    const labels = data.settings.slotLabels || ['Block 1','Block 2','Block 3','Block 4'];
    $('#slot1').value = labels[0] || '';
    $('#slot2').value = labels[1] || '';
    $('#slot3').value = labels[2] || '';
    $('#slot4').value = labels[3] || '';

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
      const holidays = Array.from(bySlug.values()).sort((a,b) => a.startDate - b.startDate);

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

      hint.textContent = 'Quelle: ferien-api.de (Schulferien, Bundesländer).';

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
    view.isoYear = Math.max(2026, iso.isoYear);
    view.isoWeek = iso.isoWeek;

    view.stateCode = data.settings.stateCode || 'BE';
    normalizeHolidayState();

    $('#yearInput').value = String(view.isoYear);

    fillWeekSelect();

    // listeners
    $('#btnToggleSidebar').addEventListener('click', toggleSidebar);

    // right pane (holidays) hide/show
    $('#btnToggleHolidayPane').addEventListener('click', toggleHolidayPane);
    $('#btnHolidayTab').addEventListener('click', () => setHolidayPaneHidden(false));

    $('#btnPrevWeek').addEventListener('click', () => shiftWeek(-1));
    $('#btnNextWeek').addEventListener('click', () => shiftWeek(1));

    $('#btnToday').addEventListener('click', goToToday);
    $('#btnHelp').addEventListener('click', () => $('#helpDialog')?.showModal());
    $('#btnReload').addEventListener('click', () => location.reload());

    $('#yearInput').addEventListener('change', () => {
      view.isoYear = clamp(Number($('#yearInput').value || 2026), 2026, 2099);
      fillWeekSelect();
      saveSettings();
      renderAll();
    });

    $('#weekSelect').addEventListener('change', () => {
      view.isoWeek = clamp(Number($('#weekSelect').value || 1), 1, weeksInIsoYear(view.isoYear));
      renderAll();
    });

    // holiday reference (Berlin/Brandenburg)
    $('#btnStateBE').addEventListener('click', () => setHolidayState('BE'));
    $('#btnStateBB').addEventListener('click', () => setHolidayState('BB'));
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
      const fn = `BWK_Stundenplan_${weekKey(view.isoYear, view.isoWeek)}.json`;
      downloadJSON(data, fn);
      toast('Export erstellt');
    });

    $('#btnImport').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', onImportFile);

    $('#btnPrint').addEventListener('click', () => window.print());

    // week notes
    $('#weekNotesInput').addEventListener('input', (e) => {
      setWeekNote(e.target.value);
      syncWeekNotesUI();
    });

    // ensure print only shows notes if filled
    window.addEventListener('beforeprint', () => {
      const note = getWeekNote().trim();
      document.body.classList.toggle('print-has-notes', note.length > 0);
      const printEl = $('#weekNotesPrint');
      if(printEl) printEl.textContent = note;
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
    const tab = $('#btnHolidayTab');
    if(tab) tab.style.display = hidden ? 'inline-flex' : 'none';
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
      y = Math.max(2026, y);
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
    view.isoYear = clamp(Math.max(2026, iso.isoYear), 2026, 2099);
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
    renderSidebar();
    toast('Lehrkraft gespeichert');
  }

  function onTeacherDelete(){
    const id = $('#teacherEditId').value;
    if(!id) return;
    const ok = confirm('Lehrkraft löschen? (Zuweisungen im Plan bleiben leer.)');
    if(!ok) return;

    data.teachers = data.teachers.filter(t => t.id !== id);

    // remove references
    for(const wk of Object.values(data.weeks)){
      if(!wk?.cells) continue;
      for(const k of Object.keys(wk.cells)){
        const e = wk.cells[k];
        if(e && e.teacherId === id) e.teacherId = '';
      }
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
    for(const wk of Object.values(data.weeks)){
      if(!wk?.cells) continue;
      for(const k of Object.keys(wk.cells)){
        const e = wk.cells[k];
        if(e && e.type === 'subject' && e.subjectId === id){
          delete wk.cells[k];
        }
      }
    }

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

    for(const wk of Object.values(data.weeks)){
      if(!wk?.cells) continue;
      for(const k of Object.keys(wk.cells)){
        const e = wk.cells[k];
        if(e && e.type === 'special' && e.specialId === id){
          delete wk.cells[k];
        }
      }
    }

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
      $('#entryDialog').close();
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

    $('#entryDialog').close();
    toast('Eintrag gespeichert');
  }

  function onEntryDelete(){
    const key = $('#entryCellKey').value;
    const [dayStr, slotStr] = key.split('-');
    setEntry(Number(dayStr), Number(slotStr), null);
    $('#entryDialog').close();
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

    const acc = $('#accentSelect')?.value;
    if(acc && ACCENT_PRESETS[acc]) data.settings.accentKey = acc;
    applyAccent();

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
