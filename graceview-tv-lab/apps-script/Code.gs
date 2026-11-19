/**
 * Graceview TV Lab
 * A web control panel and virtual TVs, driven by the "Graceview TV Lab" Sheet.
 * Separate from the real Graceview TV system: it reads and writes only this Sheet.
 *
 *   Panel:       <web app URL>
 *   Virtual TV:  <web app URL>?tv=LOBBY            (any Device ID from the Devices tab)
 *   Preview:     <web app URL>?tv=LOBBY&at=2026-11-22T10:45
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MODES = ['Signage', 'Fullscreen', 'Countdown', 'Live', 'Live Option', 'Launcher', 'Message', 'Dashboard', 'Off'];
const DAY_VALUES = DAYS.concat(['Weekdays', 'Weekends', 'Daily']);

/** What each role can do. "users" means adding people and changing roles. */
const PERMS = {
  Owner: ['override', 'schedule', 'theme', 'slides', 'activity', 'users', 'launchers', 'greenroom'],
  Admin: ['override', 'schedule', 'theme', 'slides', 'activity', 'users', 'launchers', 'greenroom'],
  Staff: ['override', 'slides', 'activity'],
  Limited: ['theme', 'slides'],
};
const ROLES = ['Admin', 'Staff', 'Limited']; // roles the Owner/Admins can give out

/* ---------- Web app entry ---------- */

/**
 * Run this once from the editor (pick "authorize" next to Run) to approve every permission the app needs.
 * Google lets people approve only some permissions, so this asks for any that are missing.
 */
function authorize() {
  if (ScriptApp.requireAllScopes) ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  DriveApp.getRootFolder().getName();
  const made = setupSheet();
  console.log('All permissions are approved.' + (made.length ? ' Added the Sheet tabs: ' + made.join(', ') + '.' : ''));
}

/* ---------- A new church's Sheet ----------
 * A church starts from a blank Google Sheet. The first time the app runs (authorize, or opening the
 * dashboard before setup), it adds every tab it needs with its headings, checkboxes and dropdowns, plus
 * a starter "Church" theme and two override presets. Tabs that already exist are never changed.
 */
const SHEET_LAYOUT = [
  { name: 'Settings', head: ['Setting', 'Value'], rows: [['Fallback Theme', 'Church']] },
  { name: 'Override', head: ['Active', 'Devices', 'Mode', 'Theme', 'Message', 'Ends At', 'Started By', 'Started At'],
    rows: [[false, 'ALL SIGNAGE', 'Message', '', '', '', '', '']], checks: ['Active'], modes: ['Mode'], text: ['Ends At', 'Started At'] },
  { name: 'Weekly', head: ['Enabled', 'Day', 'Start', 'End', 'Devices', 'Mode', 'Theme', 'Note'],
    checks: ['Enabled'], days: ['Day'], modes: ['Mode'], text: ['Start', 'End'] },
  { name: 'Special Dates', head: ['Enabled', 'Name', 'From', 'To', 'Start', 'End', 'Devices', 'Mode', 'Theme'],
    checks: ['Enabled'], modes: ['Mode'], text: ['From', 'To', 'Start', 'End'] },
  { name: 'Devices', head: ['Device ID', 'Name', 'Location', 'Profile', 'Hardware', 'Default Theme', 'Default Mode', 'Mute Live', 'Wayfinding',
    'Last Seen', 'App Version', 'Now Showing', 'Paired At', 'Paired By', 'Launcher', 'IP Address'],
    checks: ['Mute Live', 'Wayfinding'], profiles: ['Profile'], modes: ['Default Mode'], text: ['Device ID', 'Last Seen', 'App Version', 'Paired At', 'IP Address'] },
  { name: 'Themes', head: ['Theme', 'Display Name', 'Main', 'Accent', 'Logo URL', 'Wayfinding Left', 'Wayfinding Right', 'QR Label', 'QR Link',
    'Wi-Fi Name', 'Wi-Fi Password', 'Calendar', 'Calendar Hide', 'Slides Folder', 'Main Text', 'Accent Text'],
    rows: [['Church', '', '#333333', '#555555', '', '', '', 'Info', '', '', '', 'https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics', '', '', '#FFFFFF', '#FFFFFF']],
    text: ['Main', 'Accent', 'Main Text', 'Accent Text'] },
  { name: 'Launchers', head: ['Name', 'Tiles', 'Idle Minutes', 'Notes'] },
  { name: 'Green Room', head: ['Setting', 'Value', '', ''],
    rows: [['Planning Center Service Type ID', '', '', ''], ['Mic Assignment Source', 'Position name', '', ''], ['Plan Note Category', '', '', ''],
           ['Hide Declined People', 'TRUE', '', ''], ['ProPresenter Address', '', '', ''], ['ProPresenter Timer Name', '', '', ''],
           ['Avantis Address', '', '', ''], ['Avantis MIDI Base Channel', '12', '', ''], ['', '', '', ''],
           ['Mic Label', 'Avantis Input Channel', 'Notes', 'Planning Center Position']] },
  { name: 'Presets', head: ['Name', 'Devices', 'Mode', 'Theme', 'Message'],
    rows: [['Weather closure', 'ALL SIGNAGE', 'Message', '', 'We\'re closed today because of the weather. Stay safe.'],
           ['Service canceled', 'ALL SIGNAGE', 'Message', '', 'Today\'s service is canceled.']], modes: ['Mode'] },
  { name: 'Users', head: ['Email', 'Name', 'Role', 'Themes', 'Devices', 'Status', 'Invited By', 'Invited At', 'Last Sign-in'], text: ['Invited At', 'Last Sign-in'] },
  { name: 'Activity', head: ['Time', 'User', 'Action', 'Details'], text: ['Time'] },
  { name: 'Lists', head: ['Modes', 'Days', 'Profiles', 'Roles', 'Targets'] },
];

/** Adds any missing tabs (see SHEET_LAYOUT). Returns the names it added. Safe to run any time. */
function setupSheet() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return setupSheet_(); } finally { lock.releaseLock(); }
}
/** The work of setupSheet, for callers that already hold the script lock. */
function setupSheet_() {
  {
    const book = book_();
    const have = {};
    book.getSheets().forEach(function (s) { have[s.getName()] = s; });
    const missing = SHEET_LAYOUT.filter(function (t) { return !have[t.name]; });
    if (!missing.length) return [];
    // The dropdown lists, first: the other tabs' dropdowns point at them.
    let lists = have.Lists;
    if (!lists) {
      lists = book.insertSheet('Lists');
      const cols = [['Modes'].concat(MODES), ['Days'].concat(DAY_VALUES), ['Profiles'].concat(PROFILES), ['Roles'].concat(ROLES), ['Targets', 'ALL', 'ALL SIGNAGE', 'CLASSROOMS']];
      cols.forEach(function (c, j) { lists.getRange(1, j + 1, c.length, 1).setValues(c.map(function (x) { return [x]; })); });
      lists.setFrozenRows(1);
      lists.getRange(1, 1, 1, cols.length).setFontWeight('bold');
    }
    const listRule = function (col, n) {
      return SpreadsheetApp.newDataValidation().requireValueInRange(lists.getRange(2, col, n, 1), true).setAllowInvalid(true).build();
    };
    const ROWS = 200; // rows that get checkboxes and dropdowns ready
    missing.forEach(function (t) {
      if (t.name === 'Lists') return;
      const sh = book.insertSheet(t.name);
      const col = function (h) { return t.head.indexOf(h) + 1; };
      (t.text || []).forEach(function (h) { sh.getRange(2, col(h), ROWS, 1).setNumberFormat('@'); });
      sh.getRange(1, 1, 1, t.head.length).setValues([t.head]).setFontWeight('bold');
      sh.setFrozenRows(1);
      (t.checks || []).forEach(function (h) { sh.getRange(2, col(h), ROWS, 1).insertCheckboxes(); });
      (t.modes || []).forEach(function (h) { sh.getRange(2, col(h), ROWS, 1).setDataValidation(listRule(1, MODES.length)); });
      (t.days || []).forEach(function (h) { sh.getRange(2, col(h), ROWS, 1).setDataValidation(listRule(2, DAY_VALUES.length)); });
      (t.profiles || []).forEach(function (h) { sh.getRange(2, col(h), ROWS, 1).setDataValidation(listRule(3, PROFILES.length)); });
      if (t.rows && t.rows.length) sh.getRange(2, 1, t.rows.length, t.head.length).setValues(t.rows);
      if (t.name === 'Green Room') sh.getRange(11, 1, 1, 4).setFontWeight('bold');
      delete tabMemo_[t.name];
      dirtyTabs_[t.name] = true;
    });
    // A brand-new Sheet's own empty "Sheet1" isn't needed any more.
    book.getSheets().forEach(function (s) {
      if (/^(Sheet|Hoja|Feuille|Tabelle|Página)\s?1$/i.test(s.getName()) && s.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(s);
    });
    saveTabs_();
    return missing.map(function (t) { return t.name; });
  }
}

function doGet(e) {
  // Asks anyone opening the app to approve permissions they haven't approved yet (Drive, for example).
  if (ScriptApp.requireAllScopes) ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const p = (e && e.parameter) || {};
  // Before first-time setup, make sure a new church's blank Sheet has every tab.
  if (!normEmail_(settings_()['Owner Email'])) { try { setupSheet(); } catch (err) { console.error('setupSheet: ' + err); } }
  if (p.app === 'panel') return panelForSite_(p);
  // "?screen" = a TV (pairs itself, then shows its device). "?tv=ID" = a preview for signed-in people.
  const isTv = !!p.tv || Object.prototype.hasOwnProperty.call(p, 'screen');
  const t = HtmlService.createTemplateFromFile(isTv ? 'Tv' : 'Panel');
  t.params = JSON.stringify(p).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle(p.tv ? 'Preview: ' + p.tv : (settings_()['Church Name'] || 'Church') + (isTv ? ' screen' : ' Signage'))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* ---------- Sheet helpers ---------- */

/* ----- Fast reads -----
 * Each read of a Sheet tab is a round trip to Google Sheets, and a dashboard load needs about ten of them.
 * So every tab's values are also kept in the script cache under that tab's current version, and a whole
 * load fetches them in two cache calls. Anything that writes to a tab gets it through sheet_(), which gives
 * the tab a new version (again once the write is saved), so the next read goes back to the Sheet. Typing
 * straight into the Sheet does the same through onEdit. Nothing is kept longer than TAB_TTL either way.
 */
const TAB_TTL = 600;        // seconds a tab's values stay cached
const TABS = ['Settings', 'Users', 'Devices', 'Themes', 'Weekly', 'Special Dates', 'Override', 'Launchers', 'Green Room', 'Presets'];
let book__ = null, tabMemo_ = {}, dirtyTabs_ = {};
function book_() { return book__ || (book__ = SpreadsheetApp.getActive()); }
function tabSheet_(name) { return book_().getSheetByName(name); }
function newVer_() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/** A tab to write to. Marks it changed, so cached copies of it aren't used again. */
function sheet_(name) {
  const sh = book_().getSheetByName(name);
  if (!sh) throw new Error('The Sheet is missing its "' + name + '" tab.');
  delete tabMemo_[name];
  if (name === 'Settings') settingsCache_ = null;
  if (!dirtyTabs_[name]) { dirtyTabs_[name] = true; bumpTabs_([name]); }
  return sh;
}
function bumpTabs_(names) {
  try {
    const c = CacheService.getScriptCache();
    names.forEach(function (n) { c.put('tabv:' + n, newVer_(), 21600); });
  } catch (err) { /* the cache is only a shortcut */ }
}
/** After writes: saves them, then gives the changed tabs a new version once more (a read in between may have cached the old values). */
function saveTabs_() {
  const names = Object.keys(dirtyTabs_);
  if (!names.length) return;
  try { SpreadsheetApp.flush(); } catch (err) { /* nothing to save */ }
  bumpTabs_(names);
  dirtyTabs_ = {};
}
/** Someone typed into the Sheet itself: that tab is read fresh next time. (A simple trigger: no setup needed.) */
function onEdit(e) {
  try { CacheService.getScriptCache().put('tabv:' + e.range.getSheet().getName(), newVer_(), 21600); } catch (err) { /* ignore */ }
}

/** Display values of several tabs at once: { name: [[...], ...] } (null for a missing tab), from the cache when it's current. */
function tabValues_(names) {
  const need = names.filter(function (n) { return !Object.prototype.hasOwnProperty.call(tabMemo_, n); });
  if (need.length) {
    let c = null, vers = {}, hits = {};
    try {
      c = CacheService.getScriptCache();
      vers = c.getAll(need.map(function (n) { return 'tabv:' + n; }));
      const keys = need.filter(function (n) { return vers['tabv:' + n]; }).map(function (n) { return 'tab:' + n + ':' + vers['tabv:' + n]; });
      hits = keys.length ? c.getAll(keys) : {};
    } catch (err) { c = null; }
    need.forEach(function (n) {
      let ver = vers['tabv:' + n];
      // A tab this request is still writing to is read from the Sheet and not cached: a later write in
      // the same request doesn't give it a new version, so a cached copy here would go stale.
      if (dirtyTabs_[n]) { const shD = tabSheet_(n); tabMemo_[n] = shD ? shD.getDataRange().getDisplayValues() : null; return; }
      const hit = ver && hits['tab:' + n + ':' + ver];
      if (hit) { try { tabMemo_[n] = JSON.parse(hit); return; } catch (err) { /* read it below */ } }
      const sh = tabSheet_(n);
      const vals = sh ? sh.getDataRange().getDisplayValues() : null;
      tabMemo_[n] = vals;
      if (!c || !vals) return;
      try {
        if (!ver) { ver = newVer_(); c.put('tabv:' + n, ver, 21600); }
        const s = JSON.stringify(vals);
        if (s.length < 90000) c.put('tab:' + n + ':' + ver, s, TAB_TTL);
      } catch (err) { /* too big to cache: read from the Sheet each time */ }
    });
  }
  const out = {};
  names.forEach(function (n) { out[n] = tabMemo_[n]; });
  return out;
}

/** The last n rows of the Activity tab, newest first. Reads only those rows, since the tab keeps growing. Cached like the other tabs. */
function activityTail_(n) {
  let c = null, ver = '';
  try {
    c = CacheService.getScriptCache();
    ver = c.get('tabv:Activity') || '';
    const hit = ver && c.get('acttail:' + n + ':' + ver);
    if (hit) return JSON.parse(hit);
  } catch (err) { c = null; }
  const sh = book_().getSheetByName('Activity');
  if (!sh) return [];
  const last = sh.getLastRow(), cols = Math.max(1, sh.getLastColumn());
  const head = sh.getRange(1, 1, 1, cols).getDisplayValues()[0];
  const out = [];
  if (last >= 2) {
    const start = Math.max(2, last - n + 1);
    sh.getRange(start, 1, last - start + 1, cols).getDisplayValues().forEach(function (r, i) {
      if (isBlank_(r)) return;
      const o = { _row: start + i };
      head.forEach(function (h, j) { o[h] = r[j]; });
      out.push(o);
    });
  }
  out.reverse();
  if (c) {
    try {
      if (!ver) { ver = newVer_(); c.put('tabv:Activity', ver, 21600); }
      c.put('acttail:' + n + ':' + ver, JSON.stringify(out), TAB_TTL);
    } catch (err) { /* ignore */ }
  }
  return out;
}

function rows_(name) {
  const all = tabValues_([name])[name];
  if (!all) throw new Error('The Sheet is missing its "' + name + '" tab.');
  const v = all.slice();
  const head = v.shift() || [];
  const out = [];
  v.forEach(function (r, i) {
    if (isBlank_(r)) return;
    const o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = r[j]; });
    out.push(o);
  });
  return out;
}

/** A row with nothing in it but unchecked checkboxes counts as empty. */
function isBlank_(r) { return r.every(function (c) { return c === '' || c === 'FALSE'; }); }

/** Writes a new row just under the last real row, instead of under the empty checkbox rows. */
function appendRow_(sh, vals) {
  const v = sh.getDataRange().getDisplayValues();
  let last = 1;
  for (let i = v.length - 1; i >= 1; i--) { if (!isBlank_(v[i])) { last = i + 1; break; } }
  sh.getRange(last + 1, 1, 1, vals.length).setValues([vals]);
  return last + 1;
}

function bool_(x) { return String(x).toUpperCase() === 'TRUE'; }
function split_(s, sep) { return String(s || '').split(sep || /[,;]/).map(function (x) { return x.trim(); }).filter(String); }
function mins_(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function endMins_(hhmm) { const m = mins_(hhmm); return m === null ? 1440 : (m === 1439 ? 1440 : m); }
function hhmm_(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
function addDays_(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dow_(ymd) { return new Date(ymd + 'T12:00:00Z').getUTCDay(); }
/** Keeps times, dates and IDs as text when written back to the Sheet. */
function txt_(v) { return (typeof v === 'string' && /^[\d#=+-]/.test(v)) ? "'" + v : v; }
function stampNow_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'); }

/** The moment being shown: now in Chicago, or a preview time 'yyyy-MM-ddTHH:mm'. */
function at_(iso) {
  let ymd, mins, preview = false;
  if (iso && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso)) {
    ymd = iso.slice(0, 10); mins = mins_(iso.slice(11)); preview = true;
  } else {
    const d = new Date();
    ymd = Utilities.formatDate(d, tz_(), 'yyyy-MM-dd');
    mins = mins_(Utilities.formatDate(d, tz_(), 'HH:mm'));
  }
  return { ymd: ymd, mins: mins, dow: dow_(ymd), preview: preview, stamp: ymd + ' ' + hhmm_(mins),
           today: Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd') };
}

function data_() {
  tabValues_(TABS); // every tab in one go
  return {
    devices: rows_('Devices'),
    themes: rows_('Themes'),
    weekly: rows_('Weekly'),
    special: rows_('Special Dates'),
    override: rows_('Override')[0] || {},
    launchers: (function () { try { return rows_('Launchers'); } catch (err) { return []; } })(),
    greenRoom: greenRoomRows_(),
    presets: rows_('Presets'),
    users: rows_('Users'),
  };
}

/* ---------- Scheduling rules ---------- */

function dayset_(day) {
  day = String(day || '').trim();
  if (day === 'Daily') return [0, 1, 2, 3, 4, 5, 6];
  if (day === 'Weekdays') return [1, 2, 3, 4, 5];
  if (day === 'Weekends') return [0, 6];
  const i = DAYS.indexOf(day);
  return i < 0 ? [] : [i];
}

function targets_(list, dev) {
  return split_(list, ',').some(function (t) {
    const u = t.toUpperCase();
    return u === 'ALL' ||
      (u === 'ALL SIGNAGE' && dev.Profile === 'Signage') ||
      (u === 'CLASSROOMS' && dev.Profile === 'Classroom') ||
      u === String(dev.Name).toUpperCase() ||
      u === String(dev['Device ID']).toUpperCase();
  });
}

/** What one device shows at time t. First match wins: Override, Special Dates, Weekly, default. */
function resolve_(dev, t, d) {
  const o = d.override;
  if (bool_(o.Active) && targets_(o.Devices, dev) && (!o['Ends At'] || t.stamp < o['Ends At'])) {
    return { mode: o.Mode, theme: o.Theme || dev['Default Theme'], message: o.Message, source: 'Override',
             label: 'Override by ' + (o['Started By'] || 'someone') + (o['Ends At'] ? ', until ' + o['Ends At'] : ', until ended'),
             endMins: null };
  }
  for (let i = 0; i < d.special.length; i++) {
    const r = d.special[i];
    if (!bool_(r.Enabled) || t.ymd < r.From || t.ymd > (r.To || r.From)) continue;
    const s = r.Start ? mins_(r.Start) : 0, e = r.End ? endMins_(r.End) : 1440;
    if (t.mins >= s && t.mins < e && targets_(r.Devices, dev)) {
      return { mode: r.Mode, theme: r.Theme || dev['Default Theme'], source: 'Special Date', row: r._row,
               label: r.Name + ', ' + (r.Start || '00:00') + '–' + (r.End || '24:00'), endMins: e };
    }
  }
  for (let i = 0; i < d.weekly.length; i++) {
    const r = d.weekly[i];
    if (!bool_(r.Enabled) || dayset_(r.Day).indexOf(t.dow) < 0) continue;
    const s = mins_(r.Start), e = endMins_(r.End);
    if (s !== null && t.mins >= s && t.mins < e && targets_(r.Devices, dev)) {
      return { mode: r.Mode, theme: r.Theme || dev['Default Theme'], source: 'Weekly', row: r._row,
               label: 'Weekly row ' + r._row + ': ' + r.Day + ' ' + r.Start + '–' + r.End + (r.Note ? ' (' + r.Note + ')' : ''),
               endMins: e };
    }
  }
  const mode = dev.Profile === 'Classroom' ? 'Launcher' : (dev['Default Mode'] || 'Off');
  return { mode: mode, theme: dev['Default Theme'], source: 'Default', label: 'Nothing scheduled, so the default (' + mode + ')', endMins: null };
}

/** Weekly rows that are partly hidden by a higher row for the same TV. */
function conflicts_(d) {
  const out = [];
  const w = d.weekly.filter(function (r) { return bool_(r.Enabled); });
  for (let j = 0; j < w.length; j++) {
    for (let i = 0; i < j; i++) {
      const a = w[i], b = w[j];
      const days = dayset_(a.Day).filter(function (x) { return dayset_(b.Day).indexOf(x) >= 0; });
      if (!days.length) continue;
      const s = Math.max(mins_(a.Start), mins_(b.Start)), e = Math.min(endMins_(a.End), endMins_(b.End));
      if (s >= e) continue;
      const devs = d.devices.filter(function (v) { return targets_(a.Devices, v) && targets_(b.Devices, v); })
                            .map(function (v) { return v.Name; });
      if (!devs.length) continue;
      out.push({ row: b._row, by: a._row, devices: devs, days: days.map(function (x) { return DAYS[x]; }),
                 start: hhmm_(s), end: hhmm_(e) });
    }
  }
  return out;
}

function themeObj_(th) {
  th = th || {};
  const wifi = themeWifi_(th);
  return {
    name: th.Theme || '', display: th['Display Name'] || th.Theme || '',
    main: th.Main || '#333333', accent: th.Accent || '#555555', logo: logoImg_(themeLogo_(th)),
    mainText: th['Main Text'] || '#FFFFFF', accentText: th['Accent Text'] || '#FFFFFF',
    wayL: split_(th['Wayfinding Left'], ';'), wayR: split_(th['Wayfinding Right'], ';'),
    qrLabel: th['QR Label'] || 'Info', qrLink: th['QR Link'] || '',
    wifiName: wifi.name, wifiPass: wifi.pass,
  };
}

/*
 * Church-wide defaults (Church page): a theme with no logo uses the church logo, and a theme with no
 * guest Wi-Fi name uses the church's guest Wi-Fi. A theme's own values always win.
 */
function themeLogo_(th) { return String(th['Logo URL'] || '').trim() || String(settings_()['Church Logo'] || '').trim(); }
function themeWifi_(th) {
  if (String(th['Wi-Fi Name'] || '').trim()) return { name: th['Wi-Fi Name'], pass: th['Wi-Fi Password'] || '' };
  const st = settings_();
  return { name: String(st['Wi-Fi Name'] || '').trim(), pass: String(st['Wi-Fi Password'] || '') };
}
/** A Drive file's ID from its link (or a bare ID), else ''. */
function driveFileId_(link) {
  const v = String(link || '').trim();
  const m = v.match(/\/d\/([A-Za-z0-9_-]{20,})/) || v.match(/[?&]id=([A-Za-z0-9_-]{20,})/) || v.match(/^([A-Za-z0-9_-]{25,})$/);
  return m ? m[1] : '';
}
/** An image address browsers can show: Drive links become Drive's image link (the file must be shared by link). */
function logoImg_(link) {
  const id = driveFileId_(link);
  if (id) return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000';
  return /^https:\/\//i.test(String(link || '')) ? String(link) : '';
}

/** What plays for a theme: the files in its slides folder that are in their dates, in file-name order. */
function slidesFor_(th, t) {
  return folderFiles_(th).files
    .filter(function (f) { return (!f.from || f.from <= t.ymd) && (!f.until || f.until >= t.ymd); })
    .map(function (f) { return { title: f.title, sub: '', img: f.thumb, full: f.full, video: f.video, id: f.video ? f.id : '' }; });
}

/* ---------- Slide folders (Google Drive) ----------
 * Each theme's "Slides Folder" is a Drive folder. Any JPG, PNG or MP4 in it plays, in file-name order,
 * the same rule as the real Graceview TV app. Tags in the file name control the rest:
 *   "03 Welcome.jpg"                         third slide
 *   "04 Christmas Eve [until 2026-12-24].jpg" stops after Dec 24 (MM-DD also works)
 *   "05 Advent [from 12-01].jpg"             starts on Dec 1
 *   "06 Promo video [full].mp4"              plays the whole video (up to 3 minutes)
 */

const MEDIA = { 'image/jpeg': 'jpg', 'image/png': 'png', 'video/mp4': 'mp4' };
const MAX_UPLOAD = 45 * 1024 * 1024;

function folderId_(link) {
  const s = String(link || '').trim();
  const m = s.match(/folders\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || s.match(/^([A-Za-z0-9_-]{20,})$/);
  return m ? m[1] : '';
}

/** "12-24" means the nearest Dec 24 (within six months either way); "2026-12-24" is exact. */
function tagDate_(s, today) {
  s = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return '';
  const y = Number(today.slice(0, 4));
  let best = '';
  [y - 1, y, y + 1].forEach(function (yy) {
    const c = ymdOf_(yy, Number(m[1]), Number(m[2]));
    if (c && (!best || Math.abs(daysBetween_(today, c)) < Math.abs(daysBetween_(today, best)))) best = c;
  });
  return best;
}

function parseSlideName_(name, today) {
  let base = String(name).replace(/\.[A-Za-z0-9]{2,4}$/, '');
  const ext = (String(name).match(/\.([A-Za-z0-9]{2,4})$/) || [])[1] || '';
  const om = base.match(/^\s*(\d+)[\s._-]*/);
  const order = om ? Number(om[1]) : null;
  if (om) base = base.slice(om[0].length);
  const tags = {};
  base = base.replace(/\[([^\]]*)\]/g, function (whole, inner) {
    const low = inner.trim().toLowerCase();
    if (low === 'full') { tags.full = true; return ''; }
    const m = low.match(/^(from|until)\s+([\d-]+)$/);
    if (m) { tags[m[1]] = tagDate_(m[2], today); return ''; }
    return whole;
  });
  return { order: order, title: base.replace(/\s+/g, ' ').trim(), full: !!tags.full,
           from: tags.from || '', until: tags.until || '', ext: ext.toLowerCase() };
}

function buildSlideName_(order, p) {
  const title = String(p.title || 'Slide').replace(/[\\\/:*?"<>|\[\]]/g, ' ').replace(/\s+/g, ' ').trim() || 'Slide';
  return ('0' + order).slice(-2) + ' ' + title + (p.full ? ' [full]' : '') +
    (p.from ? ' [from ' + p.from + ']' : '') + (p.until ? ' [until ' + p.until + ']' : '') + '.' + (p.ext || 'jpg');
}

/**
 * Lists a theme's slides folder, in play order. Cached for FOLDER_TTL unless `fresh`; the dashboard's own
 * uploads, moves and deletes list it fresh right away, so only files added straight in Drive wait.
 */
const FOLDER_TTL = 300;
let folderMemo_ = {};
function folderFiles_(th, fresh) {
  const id = folderId_(th['Slides Folder']);
  if (!id) return { linked: false, files: [], error: '' };
  if (!fresh && folderMemo_[id]) return JSON.parse(folderMemo_[id]);
  const cache = CacheService.getScriptCache();
  const key = 'folder:' + id;
  if (!fresh) { const hit = cache.get(key); if (hit) { folderMemo_[id] = hit; return JSON.parse(hit); } }
  const today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  let out;
  try {
    const folder = DriveApp.getFolderById(id);
    const it = folder.getFiles();
    const files = [];
    while (it.hasNext() && files.length < 300) {
      const f = it.next();
      const mime = f.getMimeType();
      if (!MEDIA[mime]) continue;
      const p = parseSlideName_(f.getName(), today);
      files.push({ id: f.getId(), name: f.getName(), mime: mime, video: mime === 'video/mp4', order: p.order,
                   modified: f.getLastUpdated().toISOString(),
                   title: p.title, full: p.full, from: p.from, until: p.until, ext: p.ext || MEDIA[mime],
                   thumb: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w1920' });
    }
    files.sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }); });
    out = { linked: true, files: files, name: folder.getName(), url: folder.getUrl(), error: '', shared: isSharedByLink_(folder) };
    const s = JSON.stringify(out);
    folderMemo_[id] = s;
    try { cache.put(key, s, FOLDER_TTL); } catch (err) { /* too big to cache */ }
  } catch (err) {
    const why = String(err && err.message || err);
    console.error('Slides folder ' + id + ': ' + why);
    out = { linked: true, files: [], error: /permission|authori[sz]/i.test(why)
      ? 'Google Drive access hasn\'t been approved for this app yet. (' + why + ')'
      : 'The slides folder couldn\'t be opened. Check the link under Content > Look & details, and that you have access to the folder. (' + why + ')' };
  }
  return out;
}

/* ----- Folders the app creates in the Owner's Drive -----
 * Slides are shown on public screens, so their folders are "anyone with the link can view".
 * That lets every signed-in person, and later every TV, load them. Folders aren't listed or searchable;
 * someone needs a file's exact link.
 */

function shareByLink_(f) { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
function isSharedByLink_(f) {
  try {
    const a = f.getSharingAccess();
    return a === DriveApp.Access.ANYONE_WITH_LINK || a === DriveApp.Access.ANYONE;
  } catch (err) { return false; }
}

/** The "<Church> Signage Slides" folder that holds every theme's folder. Made on first use. */
function slidesRoot_() {
  const st = settings_();
  const id = folderId_(st['Slides Root Folder']);
  if (id) { try { return DriveApp.getFolderById(id); } catch (err) { /* deleted or no access: make a new one */ } }
  const root = DriveApp.createFolder((st['Church Name'] || 'Church') + ' Signage Slides');
  shareByLink_(root);
  setSetting_('Slides Root Folder', root.getUrl());
  return root;
}

/** Gives a theme its own shared slides folder if it has none, and records the link on the Themes tab. */
function ensureThemeFolder_(th) {
  if (folderId_(th['Slides Folder'])) return th['Slides Folder'];
  const f = slidesRoot_().createFolder(th.Theme + ' Slides');
  shareByLink_(f);
  sheet_('Themes').getRange(th._row, 14).setValue(f.getUrl());
  return f.getUrl();
}

function needAdminOk_(me) { return me.role === 'Owner' || me.role === 'Admin'; }

function needAdmin_(me) {
  if (me.role !== 'Owner' && me.role !== 'Admin') throw new Error('Only the Owner or an Admin can do that.');
}

/** Adds a theme with sensible defaults and its own shared slides folder. */
function addTheme(info, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    needAdmin_(me);
    const name = String(info.name || '').trim();
    if (!name) throw new Error('Give the theme a name, like "Youth" or "VBS".');
    if (/[,;]/.test(name)) throw new Error('Theme names can\'t contain commas or semicolons.');
    if (d.themes.some(function (x) { return x.Theme.toLowerCase() === name.toLowerCase(); })) throw new Error('There\'s already a theme called ' + name + '.');
    const main = /^#[0-9a-fA-F]{6}$/.test(info.main || '') ? info.main.toUpperCase() : '#333333';
    const accent = /^#[0-9a-fA-F]{6}$/.test(info.accent || '') ? info.accent.toUpperCase() : '#555555';
    const vals = [name, String(info.display || name).trim(), main, accent, '', '', '', 'Info', '', '', '', '', '', '', '#FFFFFF', '#FFFFFF'];
    const row = appendRow_(sheet_('Themes'), vals);
    const url = ensureThemeFolder_({ Theme: name, 'Slides Folder': '', _row: row });
    log_(me, 'Added theme', name);
    return { folder: url };
  });
}

/** Creates a slides folder for a theme that has none. */
function createThemeFolder(theme, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    needAdmin_(me);
    const url = ensureThemeFolder_(themeRow_(d, theme));
    log_(me, 'Created slides folder', theme);
    return url;
  });
}

/** Makes a linked folder viewable by link, so everyone (and the TVs) can load its slides. */
function shareThemeFolder(theme, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    needAdmin_(me);
    const id = folderId_(themeRow_(d, theme)['Slides Folder']);
    if (!id) throw new Error('This theme has no slides folder yet.');
    shareByLink_(DriveApp.getFolderById(id));
    CacheService.getScriptCache().remove('folder:' + id);
    log_(me, 'Shared slides folder by link', theme);
    return true;
  });
}

function themeRow_(d, theme) {
  const th = d.themes.filter(function (x) { return x.Theme === theme; })[0];
  if (!th) throw new Error('Theme "' + theme + '" isn\'t on the Themes tab.');
  return th;
}

function slideFolderFor_(d, me, theme) {
  need_(me, 'slides', theme);
  const th = themeRow_(d, theme);
  const id = folderId_(th['Slides Folder']);
  if (!id) throw new Error('The ' + theme + ' theme has no slides folder yet. Add one under Content > Look & details.');
  return { th: th, id: id, folder: DriveApp.getFolderById(id) };
}

/** Renames every file so their number prefixes run 01, 02, 03… in the given order. */
function renumber_(files) {
  files.forEach(function (f, i) {
    const name = buildSlideName_(i + 1, f);
    if (name !== f.name) DriveApp.getFileById(f.id).setName(name);
  });
}

/** Saves one uploaded file into the theme's folder, numbered after the last slide. */
function uploadSlide(theme, fileName, mime, b64, from, until, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    const sf = slideFolderFor_(d, me, theme);
    if (!MEDIA[mime]) throw new Error('"' + fileName + '" isn\'t a JPG, PNG or MP4, so it can\'t be a slide.');
    const bytes = Utilities.base64Decode(b64);
    if (bytes.length > MAX_UPLOAD) throw new Error('"' + fileName + '" is over 45 MB. Put large videos straight into the Drive folder instead.');
    if (from && until && until < from) throw new Error('"Show until" has to be on or after "Show from".');
    const list = folderFiles_(sf.th, true).files;
    const next = list.reduce(function (m, f) { return Math.max(m, f.order || 0); }, 0) + 1;
    const p = parseSlideName_(fileName, Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'));
    p.ext = MEDIA[mime];
    if (from) p.from = from;
    if (until) p.until = until;
    const name = buildSlideName_(next, p);
    sf.folder.createFile(Utilities.newBlob(bytes, mime, name));
    CacheService.getScriptCache().remove('folder:' + sf.id);
    log_(me, 'Uploaded slide', theme + ': ' + name);
    return name;
  });
}

function folderFile_(sf, fileId) {
  const list = folderFiles_(sf.th, true).files;
  const i = list.map(function (f) { return f.id; }).indexOf(fileId);
  if (i < 0) throw new Error('That file isn\'t in the ' + sf.th.Theme + ' slides folder any more. Refresh and try again.');
  return { list: list, i: i, f: list[i] };
}

/** Moves a slide file earlier (-1) or later (+1), renumbering the folder. */
function moveSlideFile(theme, fileId, dir, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    const sf = slideFolderFor_(d, me, theme);
    const x = folderFile_(sf, fileId);
    const j = x.i + dir;
    if (j < 0 || j >= x.list.length) return true;
    const tmp = x.list[x.i]; x.list[x.i] = x.list[j]; x.list[j] = tmp;
    renumber_(x.list);
    CacheService.getScriptCache().remove('folder:' + sf.id);
    log_(me, 'Reordered slides', theme + ': ' + x.f.title);
    return true;
  });
}

/** Sets or clears a slide file's show-from / show-until dates (kept in its file name). */
function setSlideFileDates(theme, fileId, from, until, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    const sf = slideFolderFor_(d, me, theme);
    const x = folderFile_(sf, fileId);
    if (from && until && until < from) throw new Error('"Show until" has to be on or after "Show from".');
    x.f.from = from || ''; x.f.until = until || '';
    const name = buildSlideName_(x.f.order || x.i + 1, x.f);
    DriveApp.getFileById(fileId).setName(name);
    CacheService.getScriptCache().remove('folder:' + sf.id);
    log_(me, 'Changed slide dates', theme + ': ' + name);
    return true;
  });
}

/** Moves a slide file to Drive's trash (recoverable for 30 days). */
function trashSlideFile(theme, fileId, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    const sf = slideFolderFor_(d, me, theme);
    const x = folderFile_(sf, fileId);
    DriveApp.getFileById(fileId).setTrashed(true);
    CacheService.getScriptCache().remove('folder:' + sf.id);
    log_(me, 'Moved slide to trash', theme + ': ' + x.f.name);
    return true;
  });
}

function eventsFor_(th, t) { return calendar_(th, t).events; }

/* ---------- Calendars ----------
 * Each theme's Calendar cell holds one or more calendars, separated by ";":
 *   webcal://… or https://….ics   (ShelbyNext, Brightwheel and most church calendars)
 *   a Google Calendar ID           (the calendar must be public)
 * The first is the main calendar; the rest are fallbacks (decided 2026-11-18, same rule as the TV app):
 * when the main calendar has fewer than CAL_MIN_EVENTS events in the next 7 days, the next calendars
 * fill This Week up to CAL_FILL_TO, sorted by start, each event once. Fallbacks are only fetched when
 * needed; one that fails is skipped. The server reads the feeds, so browsers never touch them.
 * Each calendar is cached for 15 minutes (2 after an error).
 */

const CAL_MIN_EVENTS = 3;
const CAL_FILL_TO = 4;
const CAL_MAX = 8;   // calendars per theme; any after these are ignored

/** The calendars in a Calendar cell, in order. Each is a fetchable https link, or null if it isn't valid. */
function calUrls_(src) {
  return split_(src, /;|\n/).map(function (x) {
    if (/^webcal:\/\//i.test(x)) return 'https://' + x.slice(9);
    if (/^https:\/\//i.test(x)) return x;
    if (x.indexOf('@') > 0 && x.indexOf('/') < 0) {
      return 'https://calendar.google.com/calendar/ical/' + encodeURIComponent(x) + '/public/basic.ics';
    }
    return null;
  });
}

function digest_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8));
}

/** One calendar's events in the 7 days from t, cached per calendar and day. { ok, events, error } */
function fetchCalendar_(url, t) {
  const cache = CacheService.getScriptCache();
  const key = 'cal1:' + digest_(url + '|' + t.ymd);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  let out;
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    const body = res.getContentText();
    if (res.getResponseCode() !== 200 || body.indexOf('BEGIN:VCALENDAR') < 0) {
      out = { ok: false, events: [], error: 'Didn\'t return a calendar (HTTP ' + res.getResponseCode() + '). Check the link, and that a Google calendar is public.' };
    } else {
      out = { ok: true, events: parseIcs_(body, t.ymd, addDays_(t.ymd, 7)), error: '' };
    }
  } catch (err) {
    out = { ok: false, events: [], error: 'Couldn\'t be read: ' + err.message };
  }
  try { cache.put(key, JSON.stringify(out), out.ok ? 900 : 120); } catch (err) { /* too big to cache */ }
  return out;
}

function calSort_(a, b) {
  if (a.ymd !== b.ymd) return a.ymd < b.ymd ? -1 : 1;
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return a.mins - b.mins;
}

/**
 * Every event of the first list, topped up from the next lists while there are fewer than
 * CAL_MIN_EVENTS, up to CAL_FILL_TO, each event (title + start) once. Also says how many events
 * each list added, so the Themes page can show which fallbacks were used.
 */
function combineCalendars_(lists) {
  if (!lists.length) return { events: [], added: [] };
  const out = lists[0].slice().sort(calSort_);
  const added = [out.length];
  for (let i = 1; i < lists.length; i++) {
    if (out.length >= CAL_MIN_EVENTS) { added.push(0); continue; }
    const seen = {};
    out.forEach(function (e) { seen[String(e.title).toLowerCase() + '|' + e.ymd + '|' + e.mins] = 1; });
    const more = lists[i].slice().sort(calSort_)
      .filter(function (e) { return !seen[String(e.title).toLowerCase() + '|' + e.ymd + '|' + e.mins]; })
      .slice(0, Math.max(0, CAL_FILL_TO - out.length));
    added.push(more.length);
    Array.prototype.push.apply(out, more);
  }
  return { events: out.sort(calSort_), added: added };
}

/**
 * This Week for a theme: { events (up to 4), count, errors, sources }.
 * sources has one entry per calendar in the cell: { n, url, state, count, used, error }, where state is
 * 'loaded', 'error', 'invalid' or 'unused' (a fallback that wasn't needed this week).
 * checkAll fetches every fallback too (the Themes page's "Check all calendars"), without changing the result.
 */
let calMemo_ = {};
function calendar_(th, t, checkAll) {
  const src = String(th.Calendar || '').trim();
  if (!src) return { events: [], count: 0, errors: [], sources: [] };
  // The dashboard asks for the same theme's calendar several times in one load: work it out once.
  const memoKey = [src, th['Calendar Hide'], t.ymd, t.mins, !!checkAll].join('|');
  if (calMemo_[memoKey]) return JSON.parse(calMemo_[memoKey]);
  const r = calendarUncached_(th, t, checkAll, src);
  calMemo_[memoKey] = JSON.stringify(r);
  return r;
}
function calendarUncached_(th, t, checkAll, src) {
  const hide = split_(th['Calendar Hide'], ';').map(function (x) { return x.toLowerCase(); });
  const keep = function (e) {
    const title = String(e.title).toLowerCase();
    if (hide.some(function (h) { return title.indexOf(h) >= 0; })) return false;
    return !(e.ymd === t.ymd && !e.allDay && e.endMins <= t.mins); // already over today
  };
  const raw = split_(src, /;|\n/).slice(0, CAL_MAX);
  const urls = calUrls_(src).slice(0, CAL_MAX);
  const sources = [], lists = [], listOf = [];
  let have = 0;
  urls.forEach(function (url, i) {
    const st = { n: i, url: raw[i], state: '', count: 0, used: false, error: '' };
    sources.push(st);
    if (!url) { st.state = 'invalid'; st.error = 'Isn\'t a webcal link, an https link or a Google Calendar ID.'; return; }
    const needed = i === 0 || lists.length === 0 || have < CAL_MIN_EVENTS;
    if (!needed && !checkAll) { st.state = 'unused'; return; }
    const r = fetchCalendar_(url, t);
    if (!r.ok) { st.state = 'error'; st.error = r.error; return; }
    const list = r.events.filter(keep);
    st.state = 'loaded'; st.count = list.length;
    if (needed) { lists.push(list); listOf.push(i); have = combineCalendars_(lists).events.length; }
  });
  const combined = combineCalendars_(lists);
  combined.added.forEach(function (n, k) { if (n > 0 || k === 0) sources[listOf[k]].used = true; });
  const errors = sources.filter(function (x) { return x.state === 'error' || x.state === 'invalid'; })
    .map(function (x) { return (x.n === 0 ? 'Main calendar' : 'Fallback ' + x.n) + ': ' + x.error; });
  return {
    count: combined.events.length,
    errors: errors,
    sources: sources,
    events: combined.events.slice(0, CAL_FILL_TO).map(function (e) {
      return { dow: DAYS[dow_(e.ymd)], today: e.ymd === t.ymd, allDay: e.allDay,
               start: hhmm_(e.mins), end: hhmm_(Math.min(e.endMins, 1439)), title: e.title };
    }),
  };
}

/** The Themes page's "Check all calendars": every calendar fetched, fallbacks included. */
function checkCalendars(theme, calendarText, token) {
  const d = data_(); const me = me_(d, token);
  need_(me, 'theme', theme);
  const th = JSON.parse(JSON.stringify(themeRow_(d, theme)));
  if (calendarText !== undefined && calendarText !== null) th.Calendar = String(calendarText);
  return calendar_(th, at_(''), true);
}

/* ---------- iCalendar (.ics) reader ---------- */

function icsText_(v) {
  return String(v).replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

/** Parses an ICS date or date-time into Chicago wall-clock time: { ymd, mins, allDay }. */
function icsDate_(v, params) {
  v = String(v || '').trim();
  let m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return { ymd: m[1] + '-' + m[2] + '-' + m[3], mins: 0, allDay: true };
  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const tz = ((params || '').match(/TZID=("?)([^;:"]+)\1/) || [])[2];
  let d = null;
  if (m[7] === 'Z') {
    d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  } else if (tz && tz !== tz_()) {
    try { d = Utilities.parseDate(m[1] + m[2] + m[3] + m[4] + m[5] + m[6], tz, 'yyyyMMddHHmmss'); } catch (err) { d = null; }
  }
  if (d) {
    const s = Utilities.formatDate(d, tz_(), 'yyyy-MM-dd HH:mm');
    return { ymd: s.slice(0, 10), mins: mins_(s.slice(11)), allDay: false };
  }
  // The church's own zone or floating time: already wall-clock.
  return { ymd: m[1] + '-' + m[2] + '-' + m[3], mins: +m[4] * 60 + +m[5], allDay: false };
}

function daysBetween_(a, b) {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}
function ymdOf_(y, m, d) { // m is 1-12; returns null if the day doesn't exist
  if (d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
}
function durationMins_(s) {
  const m = String(s || '').match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  return (+m[1] || 0) * 10080 + (+m[2] || 0) * 1440 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

/** Dates (ymd) a recurring event starts on, from `low` up to (not including) `high`. */
function occurrences_(start, rrule, low, high) {
  const r = {};
  rrule.split(';').forEach(function (p) { const kv = p.split('='); r[kv[0]] = kv[1]; });
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const count = Number(r.COUNT) || 0;
  const until = r.UNTIL ? icsDate_(r.UNTIL, '') : null;
  const CODES = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const byday = r.BYDAY ? r.BYDAY.split(',').map(function (x) {
    const m = x.match(/^([+-]?\d+)?([A-Z]{2})$/);
    return m ? { n: m[1] ? Number(m[1]) : 0, d: CODES[m[2]] } : null;
  }).filter(function (x) { return x && x.d !== undefined; }) : [];
  const bymonthday = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : [];
  const sy = Number(start.ymd.slice(0, 4)), sm = Number(start.ymd.slice(5, 7)), sd = Number(start.ymd.slice(8, 10));

  // Dates in period k, ascending.
  function period(k) {
    if (r.FREQ === 'DAILY') return [addDays_(start.ymd, k * interval)];
    if (r.FREQ === 'WEEKLY') {
      const monday = addDays_(start.ymd, -((dow_(start.ymd) + 6) % 7));
      const base = addDays_(monday, 7 * k * interval);
      const days = byday.length ? byday.map(function (b) { return b.d; }) : [dow_(start.ymd)];
      return days.map(function (d) { return addDays_(base, (d + 6) % 7); }).sort();
    }
    if (r.FREQ === 'MONTHLY') {
      const mi = (sm - 1) + k * interval, y = sy + Math.floor(mi / 12), m = (mi % 12) + 1;
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      let out = [];
      if (byday.length) {
        byday.forEach(function (b) {
          const all = [];
          for (let d = 1; d <= dim; d++) if (dow_(ymdOf_(y, m, d)) === b.d) all.push(ymdOf_(y, m, d));
          if (!b.n) out = out.concat(all);
          else { const pick = b.n > 0 ? all[b.n - 1] : all[all.length + b.n]; if (pick) out.push(pick); }
        });
      } else {
        (bymonthday.length ? bymonthday : [sd]).forEach(function (d) {
          const x = ymdOf_(y, m, d < 0 ? dim + d + 1 : d);
          if (x) out.push(x);
        });
      }
      return out.sort();
    }
    if (r.FREQ === 'YEARLY') {
      const x = ymdOf_(sy + k * interval, sm, sd);
      return x ? [x] : [];
    }
    return [];
  }

  // Without COUNT, skip ahead to near the window instead of walking from the first date.
  let k = 0;
  if (!count) {
    const gap = daysBetween_(start.ymd, low);
    if (gap > 0) {
      if (r.FREQ === 'DAILY') k = Math.floor(gap / interval);
      else if (r.FREQ === 'WEEKLY') k = Math.max(0, Math.floor(gap / (7 * interval)) - 1);
      else if (r.FREQ === 'MONTHLY') k = Math.max(0, Math.floor(gap / (31 * interval)) - 1);
      else if (r.FREQ === 'YEARLY') k = Math.max(0, Math.floor(gap / (366 * interval)) - 1);
    }
  }
  const out = [];
  let n = 0;
  for (let guard = 0; guard < 5000; guard++, k++) {
    const dates = period(k);
    if (r.FREQ !== 'DAILY' && r.FREQ !== 'WEEKLY' && r.FREQ !== 'MONTHLY' && r.FREQ !== 'YEARLY') break;
    for (let i = 0; i < dates.length; i++) {
      const ymd = dates[i];
      if (ymd < start.ymd) continue;
      n++;
      if (count && n > count) return out;
      if (until && (ymd > until.ymd || (ymd === until.ymd && !start.allDay && !until.allDay && start.mins > until.mins))) return out;
      if (ymd >= high) return out;
      if (ymd >= low) out.push(ymd);
    }
  }
  return out;
}

/** Events from an .ics feed that overlap [winStart, winEnd), as Chicago wall-clock times. */
function parseIcs_(text, winStart, winEnd) {
  const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const evs = [];
  let cur = null;
  lines.forEach(function (ln) {
    if (ln === 'BEGIN:VEVENT') { cur = { ex: {} }; return; }
    if (ln === 'END:VEVENT') { if (cur) evs.push(cur); cur = null; return; }
    if (!cur) return;
    const m = ln.match(/^([A-Za-z0-9-]+)((?:;[^:]*)?):(.*)$/);
    if (!m) return;
    const name = m[1].toUpperCase(), params = m[2], value = m[3];
    if (name === 'DTSTART' || name === 'DTEND' || name === 'RECURRENCE-ID') cur[name] = icsDate_(value, params);
    else if (name === 'EXDATE') value.split(',').forEach(function (v) { const x = icsDate_(v, params); if (x) cur.ex[x.ymd] = 1; });
    else if (name === 'SUMMARY') cur.title = icsText_(value);
    else if (name === 'RRULE') cur.rrule = value;
    else if (name === 'UID') cur.uid = value;
    else if (name === 'STATUS') cur.status = value.toUpperCase();
    else if (name === 'DURATION') cur.dur = durationMins_(value);
  });

  const moved = {};
  evs.forEach(function (e) { if (e['RECURRENCE-ID']) moved[e.uid + '|' + e['RECURRENCE-ID'].ymd] = 1; });

  const out = [];
  evs.forEach(function (e) {
    const s = e.DTSTART;
    if (!s || e.status === 'CANCELLED') return;
    let dur;
    if (e.DTEND) dur = daysBetween_(s.ymd, e.DTEND.ymd) * 1440 + (e.DTEND.mins - s.mins);
    else if (e.dur !== undefined && e.dur !== null) dur = e.dur;
    else dur = s.allDay ? 1440 : 0;
    if (dur < 0) dur = 0;
    const spanDays = Math.ceil(dur / 1440) + 1;
    const low = addDays_(winStart, -spanDays);
    const starts = (e.rrule && !e['RECURRENCE-ID']) ? occurrences_(s, e.rrule, low, winEnd)
                 : (s.ymd >= low && s.ymd < winEnd ? [s.ymd] : []);
    starts.forEach(function (ymd) {
      if (e.ex[ymd]) return;
      if (e.rrule && !e['RECURRENCE-ID'] && moved[e.uid + '|' + ymd]) return;
      const endAbs = s.mins + dur;
      const endYmd = addDays_(ymd, Math.floor(endAbs / 1440));
      const endMins = endAbs % 1440;
      const endsAfterStart = s.allDay ? endYmd > winStart : (endYmd > winStart || (endYmd === winStart && endMins > 0));
      if (ymd >= winEnd || !endsAfterStart) return;
      const ongoing = ymd < winStart;           // started before the window, still going
      const multiDay = endYmd > addDays_(ymd, 1) || (endYmd === addDays_(ymd, 1) && endMins > 0 && !s.allDay);
      out.push({
        ymd: ongoing ? winStart : ymd,
        mins: (s.allDay || ongoing) ? 0 : s.mins,
        endMins: (s.allDay || ongoing || multiDay) ? 1440 : (endYmd > ymd ? 1440 : endMins),
        allDay: s.allDay || ongoing,
        title: e.title || '(No title)',
      });
    });
  });
  return out;
}

/** Everything the shared screen renderer needs for one device. */
function screen_(dev, now, t, d) {
  const th = d.themes.filter(function (x) { return x.Theme === now.theme; })[0] ||
             d.themes.filter(function (x) { return x.Theme === dev['Default Theme']; })[0] ||
             d.themes.filter(function (x) { return x.Theme === fallbackTheme_(d); })[0] || d.themes[0] || {};
  return {
    device: { id: dev['Device ID'], name: dev.Name, profile: dev.Profile,
              mute: bool_(dev['Mute Live']), wayfinding: bool_(dev.Wayfinding) },
    mode: now.mode, message: now.message || '', endMins: now.endMins, church: churchForScreens_(),
    theme: themeObj_(th),
    slides: slidesFor_(th, t),
    events: eventsFor_(th, t),
    // Home screen tiles for the previews (the real TV app also drops tiles that don't apply there).
    launcherTiles: (function () { const l = launcherFor_(d, dev); return l ? l.tiles.map(function (x) { return x.label; }) : null; })(),
  };
}

function weather_() {
  const c = church_();
  if (c.lat === null || c.lon === null) return null; // no location set: the weather spot stays empty
  const cache = CacheService.getScriptCache();
  const key = 'wx:' + [c.lat, c.lon, c.unit].join(',');
  const hit = cache.get(key);
  if (hit) { const w = JSON.parse(hit); w.place = c.place; return w; }
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + c.lat + '&longitude=' + c.lon +
                '&current=temperature_2m,weather_code&temperature_unit=' + (c.unit === 'C' ? 'celsius' : 'fahrenheit') +
                '&timezone=' + encodeURIComponent(c.timeZone);
    const j = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
    const w = { temp: Math.round(j.current.temperature_2m), code: j.current.weather_code, place: c.place };
    cache.put(key, JSON.stringify(w), 900);
    return w;
  } catch (err) {
    return null;
  }
}

/* ---------- Who is signed in ---------- */

/*
 * Accounts
 * - The Owner is the Google account that deployed the app. When that account opens the panel, Google says so
 *   and no password is needed. The Owner also sets a backup password during setup.
 * - Everyone else is invited with a one-time link and picks a password. They never need the Sheet or Drive.
 * - Passwords, invite links and sign-in sessions live in Script Properties (private to the script), never in the Sheet.
 * - The Users tab holds only names, emails, roles and what each person can reach.
 */

const SESSION_DAYS = 30;
const INVITE_DAYS = 7;
const MIN_PASSWORD = 8;

let propsMemo_ = null;
function props_() { propsMemo_ = null; return PropertiesService.getScriptProperties(); } // may write: forget the read-only copy
/** One script property, read from a single copy of them all (one call per request instead of one per TV). */
function prop_(key) {
  if (!propsMemo_) propsMemo_ = PropertiesService.getScriptProperties().getProperties();
  return Object.prototype.hasOwnProperty.call(propsMemo_, key) ? propsMemo_[key] : null;
}
function sha_(s) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)); }
function newToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function normEmail_(e) { return String(e || '').trim().toLowerCase(); }
function validEmail_(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }

function hashPassword_(pw, salt) {
  let h = salt + '|' + pw;
  for (let i = 0; i < 1000; i++) h = sha_(h + '|' + i);
  return h;
}
function setPassword_(email, pw) {
  if (String(pw || '').length < MIN_PASSWORD) throw new Error('Passwords need at least ' + MIN_PASSWORD + ' characters.');
  const salt = newToken_();
  props_().setProperty('pw:' + email, JSON.stringify({ salt: salt, hash: hashPassword_(pw, salt) }));
}
function checkPassword_(email, pw) {
  const raw = props_().getProperty('pw:' + email);
  if (!raw) return false;
  const rec = JSON.parse(raw);
  return hashPassword_(pw, rec.salt) === rec.hash;
}
function startSession_(email) {
  const token = newToken_();
  props_().setProperty('sess:' + sha_(token), JSON.stringify({ email: email, exp: Date.now() + SESSION_DAYS * 86400000 }));
  return token;
}
function sessionEmail_(token) {
  if (!token) return '';
  const key = 'sess:' + sha_(token);
  const raw = props_().getProperty(key);
  if (!raw) return '';
  const s = JSON.parse(raw);
  if (s.exp < Date.now()) { props_().deleteProperty(key); return ''; }
  return s.email;
}

let settingsCache_ = null; // read once per request; cleared on every write
function settings_() {
  if (settingsCache_) return Object.assign({}, settingsCache_);
  const out = {};
  const v = tabValues_(['Settings']).Settings;
  if (!v) return out; // no Settings tab yet
  v.slice(1).forEach(function (r) { if (r[0]) out[r[0]] = r[1]; });
  settingsCache_ = out;
  return Object.assign({}, out);
}
function setSetting_(key, value) {
  settingsCache_ = null; delete tabMemo_.Settings;
  const sh = sheet_('Settings');
  const v = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < v.length; i++) {
    if (v[i][0] === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  }
  sh.appendRow([key, value]);
}

/* ---------- Church settings ----------
 * Set on the Church page (Owner and Admin). Stored in the Settings tab:
 *   Church Name, Website, Time Zone, Weather Place, Weather Lat, Weather Lon, Temperature Unit,
 *   Message Line (under an Override Now message), No Events Text (This Week with nothing on it),
 *   Live YouTube, Live Local Stream, Live Plays (see Live feed below).
 * Blank lines fall back to wording built from the website, so a church only has to fill in the website.
 */
const DEFAULT_TZ = 'America/Chicago';
let tzCache_ = null;
function validTz_(z) {
  z = String(z || '').trim();
  if (!/^[A-Za-z]+(\/[A-Za-z0-9_+-]+){1,2}$|^UTC$/.test(z)) return '';
  try { Utilities.formatDate(new Date(), z, 'HH:mm'); return z; } catch (err) { return ''; }
}
/** The church's time zone. Schedules, calendars and clocks all use it. */
function tz_() {
  if (!tzCache_) tzCache_ = validTz_(settings_()['Time Zone']) || DEFAULT_TZ;
  return tzCache_;
}
function num_(v) { const n = parseFloat(v); return isFinite(n) ? n : null; }
function cleanSite_(v) { return String(v || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, ''); }
function church_() {
  const st = settings_();
  const site = cleanSite_(st.Website);
  const lat = num_(st['Weather Lat']), lon = num_(st['Weather Lon']);
  const ok = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const msgSet = String(st['Message Line'] || '').trim(), evSet = String(st['No Events Text'] || '').trim();
  return {
    name: st['Church Name'] || '',
    website: site,
    timeZone: tz_(),
    place: ok ? String(st['Weather Place'] || '').trim() : '',
    lat: ok ? lat : null,
    lon: ok ? lon : null,
    unit: String(st['Temperature Unit'] || '').toUpperCase() === 'C' ? 'C' : 'F',
    messageLineSet: msgSet,
    noEventsSet: evSet,
    // What screens show: the church's own wording, or wording built from the website.
    messageLine: msgSet || (site ? 'Watch ' + site + ' and your email for updates.' : ''),
    noEvents: evSet || (site ? 'See all events at ' + site : 'Nothing on the calendar this week.'),
    dashboardAddress: String(st['Dashboard Address'] || '').trim(),
    logoLink: String(st['Church Logo'] || '').trim(),
    logo: logoImg_(st['Church Logo']),
    wifiName: String(st['Wi-Fi Name'] || '').trim(),
    wifiPass: String(st['Wi-Fi Password'] || ''),
    liveYouTube: String(st['Live YouTube'] || '').trim(),
    liveLocal: String(st['Live Local Stream'] || '').trim(),
    livePlays: livePlays_(st),
    videoKey: String(st['Google API Key'] || '').trim(),
    videoKeyBuiltIn: !!BUILTIN_VIDEO_KEY,
  };
}

/* ---------- Video in browser previews ----------
 * Drive won't hand a video file to a web page on another site (its download link is "same-site" only), so
 * full-size previews and browser screens load videos through the Drive API, which needs an API key. Every
 * copy of Church Signage ships with BUILTIN_VIDEO_KEY; a church can put its own on the Church page instead.
 * The key can only read files already shared by link (slides are), and the Drive API doesn't bill.
 * With no key at all, previews show videos as stills. TVs never need it.
 */
// Church Signage's own key (Google Cloud project "Church Signage"), limited to the Google Drive API. Not a secret:
// it's in every preview page, and it can only read files shared by link.
const BUILTIN_VIDEO_KEY = 'AIzaSyCSoJrv_hu6B2seV0IkCvoH3_B6p4KeYb0';
const VIDEO_KEY_RE = /^AIza[0-9A-Za-z_-]{35}$/;
function videoKey_() {
  const own = String(settings_()['Google API Key'] || '').trim();
  return VIDEO_KEY_RE.test(own) ? own : BUILTIN_VIDEO_KEY;
}

/* ---------- Live feed ----------
 * Two addresses on the Church page: the YouTube channel's /live link and, optionally, a local stream
 * (RTSP or SRT from an encoder on the church network). "Live mode plays" picks which one a scheduled
 * Live row plays. TVs get them as the production Sheet's Live Feeds rows (Feed, Type, Address, Active, Notes):
 * the YouTube row also drives the automatic Watch Live tile, Active or not.
 */
const YOUTUBE_RE = /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\/\S+$/i;
const STREAM_RE = /^(rtsps?|srt|rtmp|https?):\/\/\S+$/i;
function livePlays_(st) {
  return String(st['Live Plays'] || '') === 'Local stream' && String(st['Live Local Stream'] || '').trim() ? 'Local stream' : 'YouTube';
}
function liveFeeds_() {
  const st = settings_();
  const yt = String(st['Live YouTube'] || '').trim(), local = String(st['Live Local Stream'] || '').trim();
  const plays = livePlays_(st);
  const rows = [];
  if (yt) rows.push(['YouTube', 'YouTube', yt, plays === 'YouTube' ? 'TRUE' : 'FALSE', '']);
  if (local) rows.push(['Local stream', 'Local stream', local, plays === 'Local stream' ? 'TRUE' : 'FALSE', '']);
  return rows;
}
/** What screens and TVs need. */
function churchForScreens_() {
  const c = church_();
  return { name: c.name, website: c.website, timeZone: c.timeZone, place: c.place, lat: c.lat, lon: c.lon, unit: c.unit,
           messageLine: c.messageLine, noEvents: c.noEvents, logo: c.logo, logoLink: c.logoLink };
}

/** Town or ZIP search for the weather spot (Open-Meteo's free geocoder, no key). */
function findPlace(query, token) {
  const me = me_(data_(), token);
  if (!needAdminOk_(me)) throw new Error('Only the Owner or an Admin can change church settings.');
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const res = UrlFetchApp.fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=' +
                                encodeURIComponent(q), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('The place search isn\'t answering. Try again in a minute.');
  return (JSON.parse(res.getContentText()).results || []).map(function (r) {
    return { name: r.name, region: [r.admin1, r.country_code === 'US' ? '' : r.country].filter(function (x) { return !!x; }).join(', '),
             lat: Math.round(r.latitude * 10000) / 10000, lon: Math.round(r.longitude * 10000) / 10000, timeZone: r.timezone || '' };
  });
}

function saveChurchSettings(o, token) {
  const me = me_(data_(), token);
  if (!needAdminOk_(me)) throw new Error('Only the Owner or an Admin can change church settings.');
  o = o || {};
  const name = String(o.name || '').trim();
  if (!name) throw new Error('The church needs a name.');
  const tz = validTz_(o.timeZone);
  if (!tz) throw new Error('That time zone isn\'t one Google knows. Pick one from the list.');
  const blank = function (v) { return v === '' || v === null || v === undefined; };
  const lat = blank(o.lat) ? '' : num_(o.lat), lon = blank(o.lon) ? '' : num_(o.lon);
  if (lat === null || lon === null || (lat === '') !== (lon === '') || (lat !== '' && (Math.abs(lat) > 90 || Math.abs(lon) > 180)))
    throw new Error('Pick the weather location from the search results.');
  const yt = String(o.liveYouTube || '').trim(), local = String(o.liveLocal || '').trim();
  if (yt && !YOUTUBE_RE.test(yt)) throw new Error('The YouTube address should be the channel\'s live link, like https://www.youtube.com/@yourchurch/live');
  if (local && !STREAM_RE.test(local)) throw new Error('The local stream address should start with rtsp://, srt:// or https://');
  if (o.livePlays === 'Local stream' && !local) throw new Error('Add the local stream address, or set Live mode to play YouTube.');
  const vkey = String(o.videoKey || '').trim();
  if (vkey && !VIDEO_KEY_RE.test(vkey)) throw new Error('That doesn\'t look like a Google API key. It starts with AIza and is 39 characters long.');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    setSetting_('Church Name', name);
    setSetting_('Website', cleanSite_(o.website));
    setSetting_('Time Zone', tz);
    setSetting_('Weather Place', lat === '' ? '' : String(o.place || '').trim());
    setSetting_('Weather Lat', lat === '' ? '' : String(lat));
    setSetting_('Weather Lon', lon === '' ? '' : String(lon));
    setSetting_('Temperature Unit', o.unit === 'C' ? 'C' : 'F');
    setSetting_('Message Line', String(o.messageLine || '').trim());
    setSetting_('No Events Text', String(o.noEvents || '').trim());
    const addr = String(o.dashboardAddress || '').trim();
    if (addr && !/^https:\/\/[^\s"<>]+$/i.test(addr)) throw new Error('The dashboard address has to start with https://');
    setSetting_('Dashboard Address', addr);
    setSetting_('Wi-Fi Name', String(o.wifiName || '').trim());
    setSetting_('Wi-Fi Password', String(o.wifiName || '').trim() ? String(o.wifiPass || '') : '');
    setSetting_('Live YouTube', yt);
    setSetting_('Live Local Stream', local);
    setSetting_('Live Plays', o.livePlays === 'Local stream' ? 'Local stream' : 'YouTube');
    setSetting_('Google API Key', vkey);
    tzCache_ = null;
  } finally { lock.releaseLock(); }
  log_(me, 'Church settings', name);
  return church_();
}

const LOGO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg' };
/**
 * The Church page's logo upload. Saved as "Church logo" in the slides root folder, shared by link so TVs and
 * screens can load it, and replaces the previous church logo (which goes to Drive's trash).
 */
function uploadChurchLogo(fileName, mime, b64, token) {
  const me = me_(data_(), token);
  if (!needAdminOk_(me)) throw new Error('Only the Owner or an Admin can change church settings.');
  if (!LOGO_TYPES[mime]) throw new Error('"' + fileName + '" isn\'t a PNG or JPG. A PNG with a see-through background looks best.');
  const bytes = Utilities.base64Decode(b64);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('That logo is over 5 MB. Save a smaller copy (about 1000 pixels wide is plenty).');
  return locked_(function () {
    const f = slidesRoot_().createFile(Utilities.newBlob(bytes, mime, 'Church logo.' + LOGO_TYPES[mime]));
    shareByLink_(f);
    trashChurchLogo_();
    setSetting_('Church Logo', 'https://drive.google.com/file/d/' + f.getId() + '/view');
    log_(me, 'Church logo', fileName);
    return church_();
  });
}
function removeChurchLogo(token) {
  const me = me_(data_(), token);
  if (!needAdminOk_(me)) throw new Error('Only the Owner or an Admin can change church settings.');
  return locked_(function () {
    trashChurchLogo_();
    setSetting_('Church Logo', '');
    log_(me, 'Church logo', 'removed');
    return church_();
  });
}
/** Trashes the current church logo, only if it's one the Church page uploaded (in the slides root folder). */
function trashChurchLogo_() {
  const id = driveFileId_(settings_()['Church Logo']);
  if (!id) return;
  try {
    const f = DriveApp.getFileById(id), rootId = folderId_(settings_()['Slides Root Folder']);
    const parents = f.getParents();
    while (parents.hasNext()) if (parents.next().getId() === rootId) { f.setTrashed(true); return; }
  } catch (err) { /* already gone */ }
}

/** The Google account that deployed the app, if that's who is looking. Other visitors come back blank. */
function googleOwner_() {
  const active = normEmail_(Session.getActiveUser().getEmail());
  const deployer = normEmail_(Session.getEffectiveUser().getEmail());
  return active && active === deployer ? active : '';
}

function userRow_(d, email) {
  return d.users.filter(function (x) { return normEmail_(x.Email) === email; })[0];
}

/** Who is using the panel. Roles: Owner, Admin, Staff, Limited; or a state: Setup, SignIn. */
function me_(d, token) {
  const st = settings_();
  const owner = normEmail_(st['Owner Email']);
  const google = googleOwner_();
  if (!owner) {
    return google ? { state: 'Setup', email: google, role: 'None', themes: [], devices: [] }
                  : { state: 'NotReady', role: 'None', themes: [], devices: [] };
  }
  if (google && google === owner) return { email: owner, name: st['Owner Name'] || 'Owner', role: 'Owner', themes: ['ALL'], devices: ['ALL'], viaGoogle: true };
  const email = sessionEmail_(token);
  if (email && email === owner) return { email: owner, name: st['Owner Name'] || 'Owner', role: 'Owner', themes: ['ALL'], devices: ['ALL'] };
  const u = email ? userRow_(d || { users: rows_('Users') }, email) : null; // d can be null: only the Users tab is needed
  if (!u || u.Status !== 'Active' || !PERMS[u.Role] || u.Role === 'Owner') {
    return { state: 'SignIn', role: 'None', themes: [], devices: [] };
  }
  return { email: email, name: u.Name || email, role: u.Role,
           themes: u.Role === 'Limited' ? split_(u.Themes, ',') : ['ALL'],
           devices: u.Role === 'Limited' ? split_(u.Devices, ',') : ['ALL'] };
}

/* ----- First-run setup, sign-in, invites ----- */

function setupChurch(info) {
  return locked_(function () {
    if (normEmail_(settings_()['Owner Email'])) throw new Error('This app is already set up. Ask the Owner to invite you.');
    const google = googleOwner_();
    if (!google) throw new Error('Open the panel while signed in to the Google account that deployed the app to finish setup.');
    const church = String(info.church || '').trim(), name = String(info.name || '').trim();
    if (!church) throw new Error('Enter the church name.');
    if (!name) throw new Error('Enter your name.');
    setupSheet_();
    setPassword_(google, info.password);
    setSetting_('Church Name', church);
    // The starter theme shows the church's name on screens.
    data_().themes.forEach(function (th) {
      if (!String(th['Display Name'] || '').trim()) sheet_('Themes').getRange(th._row, 2).setValue(church);
    });
    setSetting_('Owner Name', name);
    setSetting_('Owner Email', google);
    setSetting_('Set Up', "'" + stampNow_());
    // Every theme gets a shared slides folder in the Owner's Drive (themes that already link one keep it).
    data_().themes.forEach(ensureThemeFolder_);
    log_({ name: name }, 'Set up the app', church + ', owner ' + name);
    return true;
  });
}

function signIn(email, password) {
  email = normEmail_(email);
  const cache = CacheService.getScriptCache();
  const failKey = 'fail:' + sha_(email);
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= 5) throw new Error('Too many tries. Wait 15 minutes and try again.');
  const d = data_();
  const owner = normEmail_(settings_()['Owner Email']);
  const u = userRow_(d, email);
  const allowed = email && (email === owner || (u && u.Status === 'Active'));
  if (!allowed || !checkPassword_(email, password)) {
    cache.put(failKey, String(fails + 1), 900);
    throw new Error('That email and password don\'t match.');
  }
  cache.remove(failKey);
  if (u) { sheet_('Users').getRange(u._row, 9).setValue("'" + stampNow_()); saveTabs_(); }
  return startSession_(email);
}

function signOut(token) {
  if (token) props_().deleteProperty('sess:' + sha_(token));
  return true;
}

/** Shows who an invite link is for, before they pick a password. */
function inviteInfo(inviteToken) {
  const raw = props_().getProperty('inv:' + sha_(inviteToken || ''));
  if (!raw) return { valid: false };
  const inv = JSON.parse(raw);
  if (inv.exp < Date.now()) return { valid: false, expired: true };
  const u = userRow_(data_(), inv.email);
  return u ? { valid: true, email: inv.email, name: u.Name, role: u.Role, church: settings_()['Church Name'] || '' } : { valid: false };
}

function acceptInvite(inviteToken, name, password) {
  return locked_(function () {
    const key = 'inv:' + sha_(inviteToken || '');
    const raw = props_().getProperty(key);
    if (!raw) throw new Error('This invite link has already been used or was replaced. Ask for a new one.');
    const inv = JSON.parse(raw);
    if (inv.exp < Date.now()) throw new Error('This invite link has expired. Ask for a new one.');
    const d = data_();
    const u = userRow_(d, inv.email);
    if (!u) throw new Error('This invite was removed. Ask for a new one.');
    setPassword_(inv.email, password);
    props_().deleteProperty(key);
    const sh = sheet_('Users');
    if (String(name || '').trim()) sh.getRange(u._row, 2).setValue(String(name).trim());
    sh.getRange(u._row, 6).setValue('Active');
    sh.getRange(u._row, 9).setValue("'" + stampNow_());
    log_({ name: String(name || u.Name) }, 'Accepted invite', inv.email + ' as ' + u.Role);
    return startSession_(inv.email);
  });
}

function changePassword(current, next, token) {
  const d = data_(); const me = me_(d, token);
  if (!me.email) throw new Error('Sign in first.');
  if (!me.viaGoogle && !checkPassword_(me.email, current)) throw new Error('Your current password isn\'t right.');
  setPassword_(me.email, next);
  log_(me, 'Changed password', '');
  return true;
}

/* ----- Managing people (Owner and Admins) ----- */

function makeInvite_(email) {
  const token = newToken_();
  props_().setProperty('inv:' + sha_(token), JSON.stringify({ email: email, exp: Date.now() + INVITE_DAYS * 86400000 }));
  const base = dashboardLink_();
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'invite=' + token;
}

/** Adds a person (returns their invite link) or changes an existing person's role and access. */
function saveUser(u, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    need_(me, 'users');
    const email = normEmail_(u.email);
    if (!validEmail_(email)) throw new Error('Enter a real email address.');
    if (email === normEmail_(settings_()['Owner Email'])) throw new Error('That\'s the Owner\'s email. The Owner already has full access.');
    if (ROLES.indexOf(u.role) < 0) throw new Error('Pick a role.');
    if (u.role === 'Admin' && me.role !== 'Owner' && me.role !== 'Admin') throw new Error('Only the Owner or an Admin can add Admins.');
    const themes = u.role === 'Limited' ? (u.themes || []).join(', ') : 'ALL';
    const devices = u.role === 'Limited' ? (u.devices || []).join(', ') : 'ALL';
    if (u.role === 'Limited' && !themes) throw new Error('Pick at least one theme this person can edit.');
    const existing = userRow_(d, email);
    const sh = sheet_('Users');
    if (existing) {
      if (existing.Role === 'Admin' && me.role !== 'Owner' && normEmail_(me.email) !== email) throw new Error('Only the Owner can change another Admin.');
      sh.getRange(existing._row, 2, 1, 4).setValues([[String(u.name || existing.Name).trim(), u.role, themes, devices]]);
      log_(me, 'Changed access', email + ' is now ' + u.role);
      return { link: '' };
    }
    appendRow_(sh, [email, String(u.name || '').trim(), u.role, themes, devices, 'Invited', me.name, "'" + stampNow_(), '']);
    log_(me, 'Invited', email + ' as ' + u.role);
    return { link: makeInvite_(email) };
  });
}

/** A fresh invite link (also how to reset a forgotten password). Old links stop working. */
function reinviteUser(email, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    need_(me, 'users');
    email = normEmail_(email);
    const u = userRow_(d, email);
    if (!u) throw new Error('That person isn\'t on the list.');
    const all = props_().getProperties();
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('inv:') === 0 && JSON.parse(all[k]).email === email) props_().deleteProperty(k);
    });
    log_(me, 'New invite link', email);
    return { link: makeInvite_(email) };
  });
}

/** Turns a person off (they're signed out right away) or back on. */
function setUserActive(email, active, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    need_(me, 'users');
    email = normEmail_(email);
    const u = userRow_(d, email);
    if (!u) throw new Error('That person isn\'t on the list.');
    if (u.Role === 'Admin' && me.role !== 'Owner') throw new Error('Only the Owner can turn off an Admin.');
    if (email === normEmail_(me.email)) throw new Error('You can\'t turn off your own account.');
    const status = active ? (props_().getProperty('pw:' + email) ? 'Active' : 'Invited') : 'Off';
    sheet_('Users').getRange(u._row, 6).setValue(status);
    log_(me, active ? 'Turned on' : 'Turned off', email);
    return true;
  });
}

function removeUser(email, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    need_(me, 'users');
    email = normEmail_(email);
    const u = userRow_(d, email);
    if (!u) throw new Error('That person isn\'t on the list.');
    if (u.Role === 'Admin' && me.role !== 'Owner') throw new Error('Only the Owner can remove an Admin.');
    if (email === normEmail_(me.email)) throw new Error('You can\'t remove yourself.');
    sheet_('Users').deleteRow(u._row);
    props_().deleteProperty('pw:' + email);
    log_(me, 'Removed', email);
    return true;
  });
}

function can_(me, perm) { return (PERMS[me.role] || []).indexOf(perm) >= 0; }
function themeOk_(me, theme) {
  return me.themes.some(function (x) { return x.toUpperCase() === 'ALL' || x.toLowerCase() === String(theme).toLowerCase(); });
}
function deviceOk_(me, dev) {
  return me.devices.some(function (x) {
    const u = x.toUpperCase();
    return u === 'ALL' || u === String(dev.Name).toUpperCase() || u === String(dev['Device ID']).toUpperCase();
  });
}
function need_(me, perm, theme) {
  if (!can_(me, perm)) throw new Error('Your role (' + me.role + ') can\'t do that.');
  if (theme !== undefined && !themeOk_(me, theme)) throw new Error('You can only change the ' + me.themes.join(', ') + ' theme.');
}

/* ---------- Reads for the pages ---------- */

function getState(iso, token) {
  // Who it is first, from the Users tab alone: a signed-out visitor gets the sign-in page without reading the whole Sheet.
  const me = me_(null, token);
  const st = settings_();
  if (me.role === 'None') return { me: me, state: me.state, church: st['Church Name'] || '', logo: logoImg_(st['Church Logo']) }; // the sign-in page shows the church's name and logo
  const d = data_();
  const t = at_(iso);
  const devices = d.devices.filter(function (v) { return deviceOk_(me, v); }).map(function (v) {
    const now = resolve_(v, t, d);
    return { id: v['Device ID'], name: v.Name, location: v.Location, profile: v.Profile, hardware: v.Hardware,
             lastSeen: v['Last Seen'], version: v['App Version'], pairedAt: v['Paired At'] || '', pairedBy: v['Paired By'] || '',
             online: minutesAgo_(v['Last Seen']) <= 3,
             ip: v['IP Address'] || '', nowShowing: v['Now Showing'] || '', defaultTheme: v['Default Theme'] || '',
             defaultMode: v['Default Mode'] || '', launcher: v.Launcher || '', muteLive: bool_(v['Mute Live']), wayfinding: bool_(v.Wayfinding),
             reportedApps: (function () { try { return JSON.parse(prop_('apps:' + v['Device ID']) || '[]').length; } catch (e) { return 0; } })(),
             now: now, screen: screen_(v, now, t, d) };
  });
  const themes = d.themes.filter(function (x) { return themeOk_(me, x.Theme); });
  const seenDevices = me.role === 'Limited' ? d.devices.filter(function (v) { return deviceOk_(me, v); }) : d.devices;
  return {
    me: me, perms: PERMS[me.role], t: t, url: ScriptApp.getService().getUrl(), church: st['Church Name'] || '',
    churchSettings: needAdminOk_(me) ? church_() : null, timeZone: tz_(),
    churchDefaults: (function () { const c = church_(); return { logo: c.logo, wifiName: c.wifiName, wifiPass: c.wifiPass }; })(),
    users: can_(me, 'users') ? d.users.map(function (u) {
      return { email: u.Email, name: u.Name, role: u.Role, themes: split_(u.Themes, ','), devices: split_(u.Devices, ','),
               status: u.Status, invitedBy: u['Invited By'], invitedAt: u['Invited At'], lastSignIn: u['Last Sign-in'] };
    }) : [],
    owner: can_(me, 'users') ? { name: st['Owner Name'] || 'Owner', email: st['Owner Email'] || '' } : null,
    // A Limited person (a renter, a school) only hears about their own themes and TVs.
    roles: ROLES, allThemes: (me.role === 'Limited' ? themes : d.themes).map(function (x) { return x.Theme; }),
    launchers: needAdminOk_(me) ? d.launchers.map(function (l) {
      return { name: l.Name, tiles: parseTiles_(l.Tiles), idleMinutes: Number(l['Idle Minutes']) || 0, notes: l.Notes || '',
               devices: d.devices.filter(function (v) { return String(v.Launcher || '') === l.Name; }).map(function (v) { return v['Device ID']; }) };
    }) : [],
    builtinTiles: BUILTIN_TILES, reportedApps: needAdminOk_(me) ? reportedApps_() : [],
    launcherNames: d.launchers.map(function (l) { return l.Name; }),
    greenRoom: can_(me, 'greenroom') ? greenRoomForPanel_(d) : null,
    deviceList: seenDevices.map(function (v) { return { id: v['Device ID'], name: v.Name, profile: v.Profile, launcher: v.Launcher || '' }; }),
    devices: devices, allDevices: seenDevices.map(function (v) { return { id: v['Device ID'], name: v.Name, profile: v.Profile }; }),
    themes: themes, themeObjs: themes.map(themeObj_), fallbackTheme: fallbackTheme_(d),
    slidesByTheme: themes.reduce(function (m, th) { m[th.Theme] = slidesFor_(th, t); return m; }, {}),
    folders: (can_(me, 'slides') || can_(me, 'theme')) ? themes.reduce(function (m, th) { m[th.Theme] = folderFiles_(th); return m; }, {}) : {},
    eventsByTheme: themes.reduce(function (m, th) { m[th.Theme] = eventsFor_(th, t); return m; }, {}),
    calStatus: themes.reduce(function (m, th) {
      const c = calendar_(th, t);
      m[th.Theme] = { linked: !!String(th.Calendar || '').trim(), count: c.count, errors: c.errors, sources: c.sources };
      return m;
    }, {}),
    weekly: can_(me, 'schedule') ? d.weekly : [], special: can_(me, 'schedule') ? d.special : [],
    conflicts: can_(me, 'schedule') ? conflicts_(d) : [],
    override: d.override, presets: can_(me, 'override') ? d.presets : [],
    activity: can_(me, 'activity') ? activityTail_(50) : [],
    modes: MODES, days: DAY_VALUES, weather: weather_(),
  };
}

/** Called by a virtual TV every 15 seconds. */
function deviceById_(d, id) {
  return d.devices.filter(function (v) { return String(v['Device ID']).toUpperCase() === String(id).toUpperCase(); })[0];
}

function tvPayload_(d, dev, iso, live) {
  const t = at_(iso);
  const now = resolve_(dev, t, d);
  if (live && !t.preview) heartbeat_(dev, now);
  // videoKey: lets full-size previews and browser screens play video slides (see "Video in browser previews").
  return { t: t, now: now, screen: screen_(dev, now, t, d), weather: weather_(), videoKey: videoKey_() };
}

/** A paired TV asking what to show. The device key is the only thing that identifies it. */
/* ---------- JSON connection for the native TV app ----------
 * The app POSTs {action, ...} to the web app URL and gets JSON back:
 *   {action:"pairStart", ua}          -> {code, secret, exp, church}
 *   {action:"pairCheck", code, secret} -> {waiting} | {paired, deviceKey, deviceId} | {expired}
 *   {action:"state", key}             -> {unpaired} | {device, church, batch}
 * "batch" is laid out like the production Sheet's rows (a Sheets API batchGet), so the app's
 * existing parser and scheduler read it unchanged. Needs the deployment's access set to "Anyone".
 */
function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (req.action === 'pairStart') out = startPairing({ ua: req.ua });
    else if (req.action === 'pairCheck') out = checkPairing(req.code, req.secret);
    else if (req.action === 'state') out = tvState_(req.key, req.apps, req.greenRoom, req.info);
    else if (req.action === 'panel') out = panelCall_(req.fn, req.args);
    else out = { error: 'Unknown action.' };
  } catch (err) {
    out = { error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- The dashboard at the church's own address ----------
 * A browser signed into several Google accounts can't open an Apps Script link ("Sorry, unable to open
 * the file": Google adds /u/N/ to it). So the church's website (graceview.org/signage) holds a small
 * loader instead (site/loader.html). It fetches the dashboard page from "?app=panel" and sends the
 * dashboard's calls here as {action:"panel", fn, args}, both without the browser's Google accounts.
 * Only the functions listed below can be called, and each still checks the sign-in token itself.
 */
function panelApi_() {
  return {
    act: act, getState: getState, previewTv: previewTv, signIn: signIn, signOut: signOut, inviteInfo: inviteInfo, acceptInvite: acceptInvite,
    changePassword: changePassword, findPlace: findPlace, checkCalendars: checkCalendars, themeUsage: themeUsage,
    uploadSlide: uploadSlide, addTheme: addTheme, approvePairing: approvePairing, clearPlanningCenter: clearPlanningCenter,
    createThemeFolder: createThemeFolder, deleteLauncher: deleteLauncher, deleteRow: deleteRow, deleteTheme: deleteTheme,
    duplicateTheme: duplicateTheme, endOverride: endOverride, moveSlideFile: moveSlideFile, moveWeekly: moveWeekly,
    reinviteUser: reinviteUser, removeChurchLogo: removeChurchLogo, removeDevice: removeDevice, removeUser: removeUser,
    saveChurchSettings: saveChurchSettings, saveDevice: saveDevice, saveGreenRoom: saveGreenRoom, saveLauncher: saveLauncher,
    savePlanningCenter: savePlanningCenter, saveSpecial: saveSpecial, saveTheme: saveTheme, saveUser: saveUser,
    saveWeekly: saveWeekly, setFallbackTheme: setFallbackTheme, setSlideFileDates: setSlideFileDates,
    setUserActive: setUserActive, shareThemeFolder: shareThemeFolder, startOverride: startOverride,
    trashSlideFile: trashSlideFile, unpairDevice: unpairDevice, uploadChurchLogo: uploadChurchLogo,
  };
}
/**
 * A change and the refreshed dashboard in one trip: runs one of the calls above, then getState.
 * The dashboard used to wait for the change, then ask again for the state: two trips to Google.
 */
function act(fn, args, iso, token) {
  if (fn === 'act') throw new Error('Unknown call.');
  const r = panelCall_(fn, args);
  if (!r.ok) throw new Error(r.error);
  return { result: r.result, state: getState(iso, token) };
}
function panelCall_(fn, args) {
  const api = panelApi_();
  if (typeof fn !== 'string' || !Object.prototype.hasOwnProperty.call(api, fn)) return { ok: false, error: 'Unknown call.' };
  try {
    return { ok: true, result: api[fn].apply(null, Array.isArray(args) ? args : []) };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}
/** The dashboard page for the loader, as JSON {html, title}. Same page as the Google link, plus where to send calls. */
function panelForSite_(p) {
  const q = {};
  Object.keys(p).forEach(function (k) { if (k !== 'app') q[k] = String(p[k]); });
  q.exec = ScriptApp.getService().getUrl();
  q.site = true;
  // "?tv=ID" is a screen's full-size preview (the dashboard's Full size button); anything else is the dashboard.
  const t = HtmlService.createTemplateFromFile(p.tv ? 'Tv' : 'Panel');
  t.params = JSON.stringify(q).replace(/</g, '\\u003c');
  const out = { html: t.evaluate().getContent(), title: p.tv ? 'Preview: ' + p.tv : (settings_()['Church Name'] || 'Church') + ' Signage' };
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
/** Where people open the dashboard: the church's own address (Church page) if set, else the Google link. */
function dashboardLink_() {
  const v = String(settings_()['Dashboard Address'] || '').trim();
  return /^https:\/\/[^\s"<>]+$/i.test(v) ? v : ScriptApp.getService().getUrl();
}

function tvState_(deviceKey, apps, greenRoomStatus, info) {
  const id = deviceForKey_(deviceKey);
  if (!id) return { unpaired: true };
  const d = data_();
  const dev = deviceById_(d, id);
  if (!dev) return { unpaired: true };
  if (apps) saveReportedApps_(id, apps);
  if (greenRoomStatus) saveGreenRoomStatus_(id, greenRoomStatus);
  const t = at_('');
  heartbeat_(dev, resolve_(dev, t, d), info);
  return { device: dev.Name, church: settings_()['Church Name'] || '', settings: churchForScreens_(), batch: toProductionBatch_(d, t),
           files: folderListings_(d), launcher: launcherFor_(d, dev),
           // Only Green Room TVs ever receive the Planning Center login (empty = removed in the dashboard).
           planningCenter: isGreenRoom_(dev) ? pcoForTv_() : null };
}

/* ---------- Launchers (home screen layouts) ----------
 * The Launchers tab holds named layouts. Tiles is an ordered, comma-separated list:
 *   watchlive, return, announcements, dashboard, mirror, hdmi, youtube, browser, store, allapps, settings
 *   app:<package>|<label>     any installed app, for example app:us.zoom.videomeetings|Zoom
 *   web:<https link>|<label>  a website, opened in the TV's browser
 * Each TV picks a layout in the Devices tab's Launcher column; blank uses the app's built-in row.
 * The TV leaves out tiles that don't apply (Return to Signage on a classroom TV, Watch Live when
 * nothing is live, an app that isn't installed).
 */

const BUILTIN_TILES = {
  watchlive: 'Watch Live', 'return': 'Return to Signage', announcements: 'Announcements', dashboard: 'Green Room Dashboard',
  mirror: 'Screen Mirror', hdmi: 'HDMI Input', youtube: 'YouTube', browser: 'Web Browser', store: 'Get Apps',
  allapps: 'All Apps', settings: 'Settings',
};

function parseTiles_(s) {
  return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(String).map(function (x) {
    const m = x.match(/^(app|web):([^|]+)(?:\|(.*))?$/i);
    if (m) return { type: m[1].toLowerCase(), value: m[2].trim(), label: (m[3] || '').trim() || (m[1].toLowerCase() === 'web' ? 'Website' : m[2].trim()) };
    const k = x.toLowerCase();
    return BUILTIN_TILES[k] ? { type: k, value: '', label: BUILTIN_TILES[k] } : null;
  }).filter(Boolean);
}

function tilesText_(tiles) {
  return tiles.map(function (t) {
    if (t.type === 'app' || t.type === 'web') return t.type + ':' + t.value + '|' + String(t.label || '').replace(/[,|]/g, ' ');
    return t.type;
  }).join(', ');
}

function launcherFor_(d, dev) {
  const name = String(dev.Launcher || '').trim();
  if (!name) return null;
  const l = d.launchers.filter(function (x) { return x.Name.toLowerCase() === name.toLowerCase(); })[0];
  return l ? { name: l.Name, tiles: parseTiles_(l.Tiles), idleMinutes: Number(l['Idle Minutes']) || 0 } : null;
}

function saveReportedApps_(deviceId, apps) {
  try {
    const list = (typeof apps === 'string' ? JSON.parse(apps) : apps) || [];
    const clean = list.filter(function (a) { return a && a.pkg; }).slice(0, 200)
      .map(function (a) { return { pkg: String(a.pkg).slice(0, 120), label: String(a.label || a.pkg).slice(0, 60) }; });
    props_().setProperty('apps:' + deviceId, JSON.stringify(clean));
  } catch (err) { /* ignore a bad list */ }
}

/** Every app any paired TV has reported, for the "Add an app" picker. */
function reportedApps_() {
  prop_('');
  const all = propsMemo_;
  const byPkg = {};
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('apps:') !== 0) return;
    try { JSON.parse(all[k]).forEach(function (a) { if (!byPkg[a.pkg]) byPkg[a.pkg] = a.label; }); } catch (e) {}
  });
  return Object.keys(byPkg).map(function (p) { return { pkg: p, label: byPkg[p] }; })
    .sort(function (a, b) { return a.label.localeCompare(b.label); });
}

/** Adds or changes a layout, and which TVs use it. l: {original, name, tiles:[{type,value,label}], idleMinutes, devices:[ids]} */
function saveLauncher(l, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    needAdmin_(me);
    const name = String(l.name || '').trim();
    if (!name) throw new Error('Give the layout a name, like "Classroom" or "Nursery".');
    if (/[,;|]/.test(name)) throw new Error('Layout names can\'t contain commas, semicolons or |.');
    const original = String(l.original || '').trim();
    if (d.launchers.some(function (x) { return x.Name.toLowerCase() === name.toLowerCase() && x.Name !== original; })) {
      throw new Error('There\'s already a layout called ' + name + '.');
    }
    const tiles = (l.tiles || []).filter(function (t) { return t && (BUILTIN_TILES[t.type] || ((t.type === 'app' || t.type === 'web') && t.value)); });
    tiles.forEach(function (t) {
      if (t.type === 'web' && !/^https:\/\//i.test(t.value)) throw new Error('Website tiles need a link that starts with https://');
      if (t.type === 'app' && !/^[A-Za-z][\w]*(\.[\w]+)+$/.test(t.value)) throw new Error('"' + t.value + '" doesn\'t look like an app package name.');
    });
    if (!tiles.length) throw new Error('Add at least one tile.');
    const idle = Math.max(0, Math.min(240, Number(l.idleMinutes) || 0));
    const sh = sheet_('Launchers');
    const row = original ? d.launchers.filter(function (x) { return x.Name === original; })[0] : null;
    const vals = [name, tilesText_(tiles), idle || '', String(l.notes || '')];
    if (row) sh.getRange(row._row, 1, 1, vals.length).setValues([vals]); else appendRow_(sh, vals);
    // Which TVs use it: set the chosen ones, clear the ones that used it (under either name) and were unticked.
    const chosen = (l.devices || []).map(String);
    const dsh = sheet_('Devices');
    d.devices.forEach(function (v) {
      const cur = String(v.Launcher || '');
      const usedIt = cur && (cur === original || cur === name);
      const want = chosen.indexOf(v['Device ID']) >= 0;
      if (want && cur !== name) dsh.getRange(v._row, 15).setValue(name);
      else if (!want && usedIt) dsh.getRange(v._row, 15).setValue('');
    });
    log_(me, row ? 'Edited launcher' : 'Added launcher', name + ': ' + tiles.length + ' tiles');
    return true;
  });
}

function deleteLauncher(name, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    needAdmin_(me);
    const row = d.launchers.filter(function (x) { return x.Name === name; })[0];
    if (!row) throw new Error('That layout isn\'t on the list any more.');
    const dsh = sheet_('Devices');
    d.devices.forEach(function (v) { if (String(v.Launcher || '') === name) dsh.getRange(v._row, 15).setValue(''); });
    sheet_('Launchers').deleteRow(row._row);
    log_(me, 'Deleted launcher', name);
    return true;
  });
}

/**
 * Every theme's slides folder, listed for the TV app (it has no Google API key). Keyed by folder ID,
 * the same ID the app reads from the folder link. The app downloads each file by its public link,
 * which works because slide folders are shared "anyone with the link can view".
 */
function folderListings_(d) {
  const out = {};
  d.themes.forEach(function (th) {
    const id = folderId_(th['Slides Folder']);
    if (!id || out[id]) return;
    const f = folderFiles_(th);
    if (f.error) return; // the TV keeps its last good slides
    out[id] = f.files.map(function (x) { return { id: x.id, name: x.name, mimeType: x.mime, modified: x.modified || '' }; });
  });
  return out;
}

/** The lab's tabs, rewritten as the production Sheet's ranges (see the TV app's SheetRepo.RANGES). */
function toProductionBatch_(d, t) {
  const o = d.override;
  const ovActive = bool_(o.Active) && (!o['Ends At'] || t.stamp < o['Ends At']);
  const override = [[], [], [], [],
    ['Active', ovActive ? 'TRUE' : 'FALSE'], ['Devices', o.Devices || 'ALL'], ['Mode', o.Mode || 'Message'],
    ['Theme', o.Theme || ''], ['Message', o.Message || '']];
  const special = d.special.filter(function (r) { return bool_(r.Enabled); }).map(function (r) {
    return [r.From, r.To || r.From, r.Start || '00:00', r.End || '23:59', r.Devices, r.Mode, r.Theme, r.Theme, r.Name];
  });
  const weekly = d.weekly.filter(function (r) { return bool_(r.Enabled); }).map(function (r) {
    return [r.Day, r.Start, r.End, r.Devices, r.Mode, r.Theme, r.Theme, r.Note || ''];
  });
  // Devices A-P. Wayfinding: blank uses the theme's arrows, "None" hides them.
  const devices = d.devices.map(function (v) {
    const l = launcherFor_(d, v); // its layout's idle minutes become the app's Idle Return (column F)
    const th = d.themes.some(function (x) { return x.Theme === v['Default Theme']; }) ? v['Default Theme'] : fallbackTheme_(d);
    return [v.Name, v.Profile, th, th, v.Location || '', l && l.idleMinutes ? String(l.idleMinutes) : '', 'TRUE', '', '', '',
            bool_(v['Mute Live']) ? 'TRUE' : 'FALSE', '', '', bool_(v.Wayfinding) ? '' : 'None', bool_(v.Wayfinding) ? '' : 'None',
            v['Default Mode'] || ''];
  });
  const themes = d.themes.map(function (th) {
    const logo = themeLogo_(th), wifi = themeWifi_(th);
    return [th.Theme, th.Main, th.Accent, th['Display Name'] || th.Theme, logo, logo,
            th['Wayfinding Left'] || '', th['Wayfinding Right'] || '', th['QR Link'] || '', tvCalendar_(th.Calendar),
            wifi.name, wifi.pass, th['Calendar Hide'] || ''];
  });
  // Each theme's slides folder doubles as a production "folder" of the same name.
  const folders = d.themes.map(function (th) { return [th.Theme, th['Slides Folder'] || '']; });
  // Green Room: the tab's rows as-is (settings by label, then the Mic Label table), like the production tab.
  const ranges = [override, special, weekly, devices, themes, folders, liveFeeds_(), d.greenRoom || []];
  return { valueRanges: ranges.map(function (values) { return { values: values.map(function (r) { return r.map(String); }) }; }) };
}

/**
 * The TV app reads iCal links itself; a Google Calendar ID would need an API key, so each is sent as
 * the calendar's public iCal link. Every calendar is sent, in order and separated by ";", so the TV
 * applies the same main-then-fallbacks rule. Invalid entries are left out.
 */
function tvCalendar_(src) {
  return calUrls_(src || '').slice(0, CAL_MAX).filter(function (u) { return !!u; }).join('; ');
}

function getTv(deviceKey) {
  const id = deviceForKey_(deviceKey);
  if (!id) return { unpaired: true };
  const d = data_();
  const dev = deviceById_(d, id);
  if (!dev) return { unpaired: true };
  return tvPayload_(d, dev, '', true);
}

/** "?tv=ID" previews, for signed-in people who can see that TV. They never count as the TV checking in. */
function previewTv(id, iso, token) {
  const d = data_(); const me = me_(d, token);
  if (me.role === 'None') return { signIn: true };
  const dev = deviceById_(d, id);
  if (!dev) return { error: 'There is no TV with ID "' + id + '".' };
  if (!deviceOk_(me, dev)) return { error: 'You don\'t have access to ' + dev.Name + '.' };
  return tvPayload_(d, dev, iso, false);
}

/* ---------- TV pairing ----------
 * 1. A screen opened at "<app>?screen" asks for a code (startPairing) and shows it.
 * 2. An Owner or Admin types that code in the panel and picks which TV it is (approvePairing).
 * 3. The screen, checking every few seconds (checkPairing), receives a device key and keeps it.
 * The device key works for that one TV only. Unpairing deletes it, and the screen goes back to showing a code.
 */

const PAIR_MINUTES = 15;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I, so codes are easy to read across a room

function normCode_(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function cleanPairings_() {
  const all = props_().getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('pair:') === 0) { try { if (JSON.parse(all[k]).exp < Date.now() - 600000) props_().deleteProperty(k); } catch (e) { props_().deleteProperty(k); } }
  });
}

function startPairing(info) {
  return locked_(function () {
    cleanPairings_();
    let code;
    do {
      code = '';
      for (let i = 0; i < 6; i++) code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    } while (props_().getProperty('pair:' + code));
    const secret = newToken_();
    const exp = Date.now() + PAIR_MINUTES * 60000;
    props_().setProperty('pair:' + code, JSON.stringify({ secret: sha_(secret), exp: exp, ua: String((info && info.ua) || '').slice(0, 160) }));
    return { code: code, secret: secret, exp: exp, church: settings_()['Church Name'] || '', dashboard: dashboardShort_() };
  });
}
/** The Church page's dashboard address as people type it ("graceview.org/signage"), for the pairing screen. '' if none. */
function dashboardShort_() {
  return String(settings_()['Dashboard Address'] || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
}

function checkPairing(code, secret) {
  const key = 'pair:' + normCode_(code);
  const raw = props_().getProperty(key);
  if (!raw) return { expired: true };
  const rec = JSON.parse(raw);
  if (rec.secret !== sha_(secret)) return { expired: true };
  if (rec.deviceKey) { props_().deleteProperty(key); return { paired: true, deviceKey: rec.deviceKey, deviceId: rec.deviceId }; }
  if (rec.exp < Date.now()) { props_().deleteProperty(key); return { expired: true }; }
  return { waiting: true };
}

function deviceForKey_(deviceKey) {
  if (!deviceKey) return '';
  const raw = props_().getProperty('tv:' + sha_(deviceKey));
  return raw ? JSON.parse(raw).deviceId : '';
}

function revokeDevice_(deviceId) {
  const all = props_().getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('tv:') === 0 && JSON.parse(all[k]).deviceId === deviceId) props_().deleteProperty(k);
  });
}

function newDeviceId_(d, name) {
  const base = String(name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14) || 'TV';
  let id = base, n = 2;
  while (deviceById_(d, id)) id = base + (n++);
  return id;
}

/**
 * Pairs the screen showing `code` to a TV.
 * target: { deviceId } for a TV already on the list, or { name, profile, theme } for a new one.
 */
function approvePairing(code, target, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    needAdmin_(me);
    code = normCode_(code);
    const key = 'pair:' + code;
    const raw = props_().getProperty(key);
    if (!raw) throw new Error('No screen is showing that code. Check the TV, or wait for its new code.');
    const rec = JSON.parse(raw);
    if (rec.exp < Date.now()) throw new Error('That code has expired. The TV is showing a new one.');
    if (rec.deviceKey) throw new Error('That screen is already paired.');
    const sh = sheet_('Devices');
    let dev;
    if (target && target.deviceId) {
      dev = deviceById_(d, target.deviceId);
      if (!dev) throw new Error('That TV isn\'t on the list any more.');
    } else {
      const name = String((target && target.name) || '').trim();
      if (!name) throw new Error('Give the new TV a name, like "Lobby" or "Room 104".');
      if (d.devices.some(function (v) { return String(v.Name).toLowerCase() === name.toLowerCase(); })) throw new Error('There\'s already a TV called ' + name + '. Pick it from the list instead.');
      const profile = ['Signage', 'Classroom', 'Green Room'].indexOf(target.profile) >= 0 ? target.profile : 'Signage';
      const theme = d.themes.some(function (x) { return x.Theme === target.theme; }) ? target.theme : fallbackTheme_(d);
      const id = newDeviceId_(d, name);
      const row = appendRow_(sh, [id, name, '', profile, 'Browser screen', theme, profile === 'Classroom' ? 'Launcher' : 'Signage',
                                  false, false, '', '', '', '', '']);
      dev = { 'Device ID': id, Name: name, _row: row };
    }
    revokeDevice_(dev['Device ID']); // one screen per TV: pairing again replaces the old screen
    const deviceKey = newToken_();
    props_().setProperty('tv:' + sha_(deviceKey), JSON.stringify({ deviceId: dev['Device ID'], at: Date.now() }));
    rec.deviceKey = deviceKey; rec.deviceId = dev['Device ID'];
    props_().setProperty(key, JSON.stringify(rec));
    sh.getRange(dev._row, 13, 1, 2).setValues([["'" + stampNow_(), me.name]]);
    log_(me, 'Paired a TV', dev.Name + ' (' + dev['Device ID'] + ')');
    return { deviceId: dev['Device ID'], name: dev.Name };
  });
}

function unpairDevice(deviceId, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    needAdmin_(me);
    const dev = deviceById_(d, deviceId);
    if (!dev) throw new Error('That TV isn\'t on the list.');
    revokeDevice_(dev['Device ID']);
    sheet_('Devices').getRange(dev._row, 13, 1, 2).setValues([['', '']]);
    log_(me, 'Unpaired a TV', dev.Name);
    return true;
  });
}

/**
 * Records that a TV checked in: Last Seen, App Version and Now Showing (J-L), plus its model (E) and
 * IP address (P) when the native app reports them. Written at most once a minute unless something changed.
 */
function heartbeat_(dev, now, info) {
  let inf = {};
  try { inf = info ? (typeof info === 'string' ? JSON.parse(info) : info) : {}; } catch (err) { inf = {}; }
  const cache = CacheService.getScriptCache();
  const key = 'seen:' + dev['Device ID'];
  const showing = now.mode + ' · ' + now.theme;
  const version = String(inf.version || '').slice(0, 40) || 'lab-web';
  const ip = String(inf.ip || '').slice(0, 45);
  const model = inf.model ? (String(inf.model).slice(0, 60) + (inf.android ? ', Android ' + String(inf.android).slice(0, 10) : '')) : '';
  const sig = [showing, version, ip, model].join('|');
  if (cache.get(key) === sig) return; // nothing new within the last minute
  const sh = sheet_('Devices');
  sh.getRange(dev._row, 10, 1, 3).setValues([["'" + stampNow_(), "'" + version, showing]]);
  if (model && model !== dev.Hardware) sh.getRange(dev._row, 5).setValue(model);
  if (ip && ip !== dev['IP Address']) sh.getRange(dev._row, 16).setValue("'" + ip);
  saveTabs_();
  cache.put(key, sig, 60);
}

/* ---------- Devices page ---------- */

const PROFILES = ['Signage', 'Classroom', 'Green Room'];

/** Minutes since a 'yyyy-MM-dd HH:mm' Chicago time (Infinity if blank). */
function minutesAgo_(stamp) {
  const m = String(stamp || '').match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/);
  if (!m) return Infinity;
  const now = at_('');
  return daysBetween_(m[1], now.ymd) * 1440 + now.mins - (Number(m[2]) * 60 + Number(m[3]));
}

/** Replaces one TV's name inside a comma list of TVs ("Lobby, Coffee Spot"). */
function renameInList_(list, oldName, newName) {
  const parts = String(list || '').split(',').map(function (x) { return x.trim(); });
  let changed = false;
  const out = parts.map(function (x) { if (x.toLowerCase() === oldName.toLowerCase()) { changed = true; return newName; } return x; });
  return changed ? out.filter(String).join(', ') : null;
}

/** Edits a TV's settings. Renaming also updates every schedule row, override, preset and Limited user that names it. */
function saveDevice(v, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    needAdmin_(me);
    const dev = deviceById_(d, v.id);
    if (!dev) throw new Error('That TV isn\'t on the list any more.');
    const name = String(v.name || '').trim();
    if (!name) throw new Error('Give the TV a name.');
    if (/[,;]/.test(name)) throw new Error('TV names can\'t contain commas or semicolons.');
    const upper = name.toUpperCase();
    if (['ALL', 'ALL SIGNAGE', 'CLASSROOMS'].indexOf(upper) >= 0) throw new Error(name + ' is a reserved word in schedules. Pick another name.');
    if (d.devices.some(function (x) { return x !== dev && String(x.Name).toLowerCase() === name.toLowerCase(); })) throw new Error('There\'s already a TV called ' + name + '.');
    if (PROFILES.indexOf(v.profile) < 0) throw new Error('Pick a kind of screen.');
    if (!d.themes.some(function (x) { return x.Theme === v.theme; })) throw new Error('Pick a theme.');
    if (MODES.indexOf(v.defaultMode) < 0) throw new Error('Pick what it shows when nothing is scheduled.');
    if (v.launcher && !d.launchers.some(function (x) { return x.Name === v.launcher; })) throw new Error('That launcher layout doesn\'t exist.');
    const sh = sheet_('Devices');
    sh.getRange(dev._row, 2, 1, 2).setValues([[name, String(v.location || '').trim()]]);
    sh.getRange(dev._row, 4).setValue(v.profile);
    sh.getRange(dev._row, 6, 1, 4).setValues([[v.theme, v.defaultMode, !!v.muteLive, !!v.wayfinding]]);
    sh.getRange(dev._row, 15).setValue(v.launcher || '');
    const oldName = String(dev.Name);
    let renamed = 0;
    if (oldName !== name) {
      const fix = function (tab, rows, col) {
        rows.forEach(function (r) {
          const nv = renameInList_(r[tab.field], oldName, name);
          if (nv !== null) { sheet_(tab.name).getRange(r._row, col).setValue(nv); renamed++; }
        });
      };
      fix({ name: 'Weekly', field: 'Devices' }, d.weekly, 5);
      fix({ name: 'Special Dates', field: 'Devices' }, d.special, 7);
      fix({ name: 'Presets', field: 'Devices' }, d.presets, 2);
      fix({ name: 'Users', field: 'Devices' }, d.users, 5);
      if (d.override && d.override._row) fix({ name: 'Override', field: 'Devices' }, [d.override], 2);
    }
    log_(me, 'Edited TV', name + (oldName !== name ? ' (was ' + oldName + '; updated ' + renamed + ' rows that named it)' : ''));
    return { renamed: renamed };
  });
}

/** Removes a TV: its screen is unpaired and its row deleted. Schedule rows that name it are left alone. */
function removeDevice(id, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    needAdmin_(me);
    const dev = deviceById_(d, id);
    if (!dev) throw new Error('That TV isn\'t on the list any more.');
    revokeDevice_(dev['Device ID']);
    props_().deleteProperty('apps:' + dev['Device ID']);
    props_().deleteProperty('grstatus:' + dev['Device ID']);
    sheet_('Devices').deleteRow(dev._row);
    log_(me, 'Removed TV', dev.Name);
    return true;
  });
}

/* ---------- Writes ---------- */

function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { saveTabs_(); lock.releaseLock(); }
}

function log_(me, action, details) {
  sheet_('Activity').appendRow(["'" + stampNow_(), me.name, action, details || '']);
}

function checkTimes_(start, end) {
  if (mins_(start) === null || mins_(end) === null) throw new Error('Times need to look like 09:30.');
  if (endMins_(end) <= mins_(start)) throw new Error('The end time has to be after the start time.');
}
function checkMode_(mode) { if (MODES.indexOf(mode) < 0) throw new Error('Unknown mode: ' + mode); }

function startOverride(o, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    need_(me, 'override');
    checkMode_(o.mode);
    if (!String(o.devices || '').trim()) throw new Error('Pick at least one TV.');
    if (o.mode === 'Message' && !String(o.message || '').trim()) throw new Error('Type the message to show.');
    let ends = '';
    if (o.duration === 'eod') ends = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd') + ' 23:59';
    else if (Number(o.duration) > 0) ends = Utilities.formatDate(new Date(Date.now() + Number(o.duration) * 60000), tz_(), 'yyyy-MM-dd HH:mm');
    sheet_('Override').getRange(2, 1, 1, 8).setValues([[true, o.devices, o.mode, o.theme || '', o.message || '',
      ends ? "'" + ends : '', me.name, "'" + stampNow_()]]);
    log_(me, 'Started override', o.mode + ' on ' + o.devices + (ends ? ' until ' + ends : ''));
    return true;
  });
}

function endOverride(token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    need_(me, 'override');
    sheet_('Override').getRange(2, 1).setValue(false);
    log_(me, 'Ended override', '');
    return true;
  });
}

function saveWeekly(r, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    need_(me, 'schedule');
    if (dayset_(r.Day).length === 0) throw new Error('Pick a day.');
    checkTimes_(r.Start, r.End); checkMode_(r.Mode);
    const vals = [!!r.Enabled, r.Day, txt_(r.Start), txt_(r.End), r.Devices, r.Mode, r.Theme, r.Note || ''];
    const sh = sheet_('Weekly');
    if (r._row > 1) sh.getRange(r._row, 1, 1, vals.length).setValues([vals]); else appendRow_(sh, vals);
    log_(me, r._row > 1 ? 'Edited weekly row ' + r._row : 'Added weekly row', r.Day + ' ' + r.Start + '–' + r.End + ' ' + r.Devices + ' ' + r.Mode);
    return true;
  });
}

function saveSpecial(r, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    need_(me, 'schedule');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.From)) throw new Error('Pick a start date.');
    if (!r.To) r.To = r.From;
    if (r.To < r.From) throw new Error('The last day has to be on or after the first day.');
    checkTimes_(r.Start, r.End); checkMode_(r.Mode);
    const vals = [!!r.Enabled, r.Name, txt_(r.From), txt_(r.To), txt_(r.Start), txt_(r.End), r.Devices, r.Mode, r.Theme];
    const sh = sheet_('Special Dates');
    if (r._row > 1) sh.getRange(r._row, 1, 1, vals.length).setValues([vals]); else appendRow_(sh, vals);
    log_(me, r._row > 1 ? 'Edited special date' : 'Added special date', r.Name + ' ' + r.From);
    return true;
  });
}

function deleteRow(tab, row, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    if (['Weekly', 'Special Dates'].indexOf(tab) < 0) throw new Error('Can\'t delete from ' + tab + '.');
    need_(me, 'schedule');
    const sh = sheet_(tab);
    if (row < 2 || row > sh.getLastRow()) throw new Error('That row no longer exists. Refresh and try again.');
    const desc = sh.getRange(row, 2, 1, 4).getDisplayValues()[0].join(' ');
    sh.deleteRow(row);
    log_(me, 'Deleted ' + tab + ' row ' + row, desc);
    return true;
  });
}

/** Moves a Weekly row up (-1) or down (+1). Higher rows win when rows overlap. */
function moveWeekly(row, dir, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    need_(me, 'schedule');
    const sh = sheet_('Weekly');
    const target = row + dir;
    if (target < 2 || target > sh.getLastRow()) return true;
    sh.moveRows(sh.getRange(row + ':' + row), dir < 0 ? target : target + 1);
    log_(me, 'Moved weekly row ' + row + (dir < 0 ? ' up' : ' down'), '');
    return true;
  });
}

function saveTheme(th, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    need_(me, 'theme', th.Theme);
    ['Main', 'Accent'].forEach(function (k) {
      if (!/^#[0-9a-fA-F]{6}$/.test(th[k] || '')) throw new Error(k + ' color needs to look like #CF2020.');
    });
    ['Main Text', 'Accent Text'].forEach(function (k) {
      if (!th[k]) th[k] = '#FFFFFF';
      if (!/^#[0-9a-fA-F]{6}$/.test(th[k])) throw new Error(k + ' color needs to look like #FFFFFF.');
    });
    const row = d.themes.filter(function (x) { return x.Theme === th.Theme; })[0];
    if (!row) throw new Error('Theme "' + th.Theme + '" isn\'t on the Themes tab.');
    // Only the Owner and Admins choose a theme's slides folder. Anyone else keeps the one it has, so a
    // Limited person can't point their theme at another theme's folder and change those slides.
    if (!needAdminOk_(me)) th['Slides Folder'] = row['Slides Folder'];
    const vals = [th.Theme, th['Display Name'], txt_(th.Main), txt_(th.Accent), th['Logo URL'], th['Wayfinding Left'],
                  th['Wayfinding Right'], th['QR Label'], th['QR Link'], th['Wi-Fi Name'], th['Wi-Fi Password'],
                  th.Calendar || '', th['Calendar Hide'], th['Slides Folder'] || '', th['Main Text'], th['Accent Text']];
    sheet_('Themes').getRange(row._row, 1, 1, vals.length).setValues([vals]);
    log_(me, 'Edited theme', th.Theme);
    return true;
  });
}



/* ---------- Green Room ----------
 * The "Green Room" tab matches the production Sheet's tab: settings by label in A/B, then a table
 * that starts with a "Mic Label" header row (Mic Label, Avantis Input Channel, Notes, Planning Center Position).
 * TVs get the rows as-is, so the app's parser reads them unchanged.
 *
 * The Planning Center login (application ID + secret) is NOT in the Sheet. It lives in Script
 * Properties, is never logged or shown in full, and goes only to TVs with the Green Room profile,
 * which keep it encrypted (Android Keystore).
 */

const GREEN_ROOM_SETTINGS = ['Planning Center Service Type ID', 'Mic Assignment Source', 'Plan Note Category', 'Hide Declined People',
  'ProPresenter Address', 'ProPresenter Timer Name', 'Avantis Address', 'Avantis MIDI Base Channel'];
const MIC_SOURCES = ['Position name', 'Assignment notes', 'Plan note', 'Avantis channel names', ''];

function greenRoomRows_() {
  const v = tabValues_(['Green Room'])['Green Room'];
  return v ? v.map(function (r) { return r.slice(0, 4).map(String); }) : [];
}

function isGreenRoom_(dev) { return String(dev.Profile || '').replace(/\s/g, '').toLowerCase() === 'greenroom'; }

function parseGreenRoomRows_(rows) {
  const header = rows.findIndex(function (r) { return String(r[0]).trim().toLowerCase() === 'mic label'; });
  const settingRows = header >= 0 ? rows.slice(0, header) : rows;
  const settings = {};
  GREEN_ROOM_SETTINGS.forEach(function (k) {
    const r = settingRows.filter(function (x) { return String(x[0]).trim().toLowerCase() === k.toLowerCase(); })[0];
    settings[k] = r ? String(r[1] || '') : '';
  });
  const mics = header < 0 ? [] : rows.slice(header + 1).filter(function (r) { return String(r[0]).trim(); }).map(function (r) {
    return { label: String(r[0]).trim(), channel: String(r[1] || '').trim(), notes: String(r[2] || '').trim(), position: String(r[3] || '').trim() };
  });
  return { settings: settings, mics: mics };
}

function pcoForTv_() {
  const raw = props_().getProperty('pco');
  if (!raw) return { appId: '', secret: '' };
  const p = JSON.parse(raw);
  return { appId: p.appId, secret: p.secret };
}

function saveGreenRoomStatus_(deviceId, status) {
  try {
    const st = typeof status === 'string' ? JSON.parse(status) : status;
    const clean = {};
    ['planningCenter', 'proPresenter', 'avantis'].forEach(function (k) {
      if (st[k]) clean[k] = { ok: !!st[k].ok, text: String(st[k].text || '').slice(0, 160) };
    });
    clean.at = stampNow_();
    props_().setProperty('grstatus:' + deviceId, JSON.stringify(clean));
  } catch (err) { /* ignore a bad report */ }
}

function greenRoomForPanel_(d) {
  const parsed = parseGreenRoomRows_(d.greenRoom || []);
  const raw = prop_('pco');
  const pco = raw ? JSON.parse(raw) : null;
  return {
    settings: parsed.settings, mics: parsed.mics, micSources: MIC_SOURCES, hasTab: (d.greenRoom || []).length > 0,
    // Never the secret itself: only whether a login is saved, its last 4 ID characters, and who saved it when.
    planningCenter: pco ? { saved: true, idHint: '…' + String(pco.appId).slice(-4), savedBy: pco.savedBy, savedAt: pco.savedAt } : { saved: false },
    tvs: d.devices.filter(isGreenRoom_).map(function (v) {
      const r = prop_('grstatus:' + v['Device ID']);
      return { id: v['Device ID'], name: v.Name, paired: !!v['Paired At'], status: r ? JSON.parse(r) : null };
    }),
  };
}

/** Rewrites the Green Room tab from the panel: the settings, then the mic map. */
function saveGreenRoom(g, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    need_(me, 'greenroom');
    const s = g.settings || {};
    if (MIC_SOURCES.indexOf(s['Mic Assignment Source'] || '') < 0) throw new Error('Pick a mic assignment source.');
    const base = Number(s['Avantis MIDI Base Channel'] || 12);
    if (!(base >= 1 && base <= 12)) throw new Error('The Avantis MIDI base channel is a number from 1 to 12.');
    ['ProPresenter Address', 'Avantis Address'].forEach(function (k) {
      const v = String(s[k] || '').trim();
      if (v && !/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(v)) throw new Error(k + ' should look like 192.168.1.50 or 192.168.1.50:50001.');
    });
    const mics = (g.mics || []).filter(function (m) { return String(m.label || '').trim(); });
    mics.forEach(function (m) {
      if (m.channel && !(Number(m.channel) >= 1 && Number(m.channel) <= 64)) throw new Error(m.label + ': Avantis input channels are 1 to 64.');
    });
    const rows = [['Setting', 'Value', '', '']].concat(GREEN_ROOM_SETTINGS.map(function (k) {
      let v = String(s[k] == null ? '' : s[k]).trim();
      if (k === 'Hide Declined People') v = (v === 'FALSE' || v === 'false') ? 'FALSE' : 'TRUE';
      if (k === 'Avantis MIDI Base Channel') v = String(base);
      return [k, txt_(v), '', ''];
    })).concat([['', '', '', ''], ['Mic Label', 'Avantis Input Channel', 'Notes', 'Planning Center Position']])
      .concat(mics.map(function (m) { return [String(m.label).trim(), m.channel ? Number(m.channel) : '', m.notes || '', m.position || '']; }));
    const sh = sheet_('Green Room');
    sh.clearContents();
    sh.getRange(1, 1, rows.length, 4).setValues(rows);
    log_(me, 'Edited Green Room settings', mics.length + ' mics');
    return true;
  });
}

/** Saves the Planning Center login (personal access token) for Green Room TVs. */
function savePlanningCenter(appId, secret, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    need_(me, 'greenroom');
    appId = String(appId || '').trim(); secret = String(secret || '').trim();
    if (!/^[A-Za-z0-9]{20,}$/.test(appId) || secret.length < 20) throw new Error('Paste the Application ID and Secret from your Planning Center personal access token.');
    props_().setProperty('pco', JSON.stringify({ appId: appId, secret: secret, savedBy: me.name, savedAt: stampNow_() }));
    log_(me, 'Saved the Planning Center login', 'for Green Room TVs');
    return true;
  });
}

function clearPlanningCenter(token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    need_(me, 'greenroom');
    props_().deleteProperty('pco');
    log_(me, 'Removed the Planning Center login', '');
    return true;
  });
}


/* ---------- Fallback theme and deleting themes ----------
 * One theme is the fallback (Settings tab, "Fallback Theme"; the first theme if unset). A TV whose
 * theme doesn't exist shows the fallback. Deleting a theme moves its TVs to the fallback and clears
 * it from schedule rows, the override and presets, so they follow each TV's own theme. Its slides
 * folder stays in Drive.
 */

function fallbackTheme_(d) {
  const f = String(settings_()['Fallback Theme'] || '').trim();
  return d.themes.some(function (x) { return x.Theme === f; }) ? f : ((d.themes[0] || {}).Theme || '');
}

function setFallbackTheme(theme, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    needAdmin_(me);
    themeRow_(d, theme);
    setSetting_('Fallback Theme', theme);
    log_(me, 'Set the fallback theme', theme);
    return true;
  });
}

function themeRefs_(d, theme) {
  const eq = function (x) { return String(x || '').trim() === theme; };
  return {
    devices: d.devices.filter(function (v) { return eq(v['Default Theme']); }),
    weekly: d.weekly.filter(function (r) { return eq(r.Theme); }),
    special: d.special.filter(function (r) { return eq(r.Theme); }),
    override: eq(d.override.Theme) ? [d.override] : [],
    presets: d.presets.filter(function (r) { return eq(r.Theme); }),
    users: d.users.filter(function (u) { return u.Role === 'Limited' && split_(u.Themes, ',').some(eq); }),
  };
}

/** What deleting a theme would change, for the confirm step. */
function themeUsage(theme, token) {
  const d = data_(); const me = me_(d, token);
  needAdmin_(me);
  themeRow_(d, theme);
  const r = themeRefs_(d, theme);
  const row = themeRow_(d, theme);
  const fid = folderId_(row['Slides Folder']);
  let folder = null;
  if (fid) {
    const sharedWith = d.themes.filter(function (x) { return x.Theme !== theme && folderId_(x['Slides Folder']) === fid; }).map(function (x) { return x.Theme; });
    const f = folderFiles_(row, true);
    folder = { name: f.name || '', files: (f.files || []).length, sharedWith: sharedWith, error: f.error || '' };
  }
  return {
    folder: folder,
    fallback: fallbackTheme_(d), isFallback: fallbackTheme_(d) === theme,
    devices: r.devices.map(function (v) { return v.Name; }),
    scheduleRows: r.weekly.length + r.special.length, override: r.override.length > 0,
    presets: r.presets.map(function (x) { return x.Name; }),
    users: r.users.map(function (u) { return u.Name || u.Email; }),
  };
}

function deleteTheme(theme, token, trashFolder) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    needAdmin_(me);
    const row = themeRow_(d, theme);
    const fallback = fallbackTheme_(d);
    if (fallback === theme) throw new Error(theme + ' is the fallback theme. Make another theme the fallback first.');
    if (d.themes.length < 2) throw new Error('This is the only theme. Add another before deleting it.');
    const r = themeRefs_(d, theme);
    r.devices.forEach(function (v) { sheet_('Devices').getRange(v._row, 6).setValue(fallback); });
    r.weekly.forEach(function (x) { sheet_('Weekly').getRange(x._row, 7).setValue(''); });
    r.special.forEach(function (x) { sheet_('Special Dates').getRange(x._row, 9).setValue(''); });
    r.override.forEach(function (x) { sheet_('Override').getRange(x._row, 4).setValue(''); });
    r.presets.forEach(function (x) { sheet_('Presets').getRange(x._row, 4).setValue(''); });
    r.users.forEach(function (u) {
      const left = split_(u.Themes, ',').filter(function (x) { return x.trim() !== theme; });
      sheet_('Users').getRange(u._row, 4).setValue(left.join(', '));
    });
    // Optionally move its slides folder to Drive's trash (restorable for 30 days), never when another theme uses it.
    let folderTrashed = false;
    const fid = folderId_(row['Slides Folder']);
    if (trashFolder && fid) {
      const others = d.themes.filter(function (x) { return x.Theme !== theme && folderId_(x['Slides Folder']) === fid; });
      if (others.length) throw new Error('The slides folder is also used by ' + others.map(function (x) { return x.Theme; }).join(', ') + ', so it can\'t go to the trash.');
      DriveApp.getFolderById(fid).setTrashed(true);
      CacheService.getScriptCache().remove('folder:' + fid);
      folderTrashed = true;
    }
    sheet_('Themes').deleteRow(row._row);
    log_(me, 'Deleted theme', theme + (folderTrashed ? ' (slides folder moved to Drive trash)' : '') + ': ' + r.devices.length + ' TVs moved to ' + fallback + ', ' +
         (r.weekly.length + r.special.length + r.override.length + r.presets.length) + ' schedule rows now follow each TV\'s theme');
    return { fallback: fallback, devices: r.devices.length, folderTrashed: folderTrashed };
  });
}

/**
 * Makes a new theme from an existing one: everything is copied (logo, wayfinding, QR, Wi-Fi,
 * calendar, hide list), with a new name, name on screens and colors. Slides:
 *   'new'   a new empty shared folder (the default, for event slides)
 *   'copy'  a new shared folder with copies of the original's slide files
 *   'share' the same folder as the original (both themes play the same files)
 */
function duplicateTheme(sourceName, info, token) {
  return locked_(function () {
    const d = data_(); const me = me_(d, token);
    needAdmin_(me);
    const src = themeRow_(d, sourceName);
    const name = String(info.name || '').trim();
    if (!name) throw new Error('Give the new theme a name, like "Easter" or "VBS 2027".');
    if (/[,;]/.test(name)) throw new Error('Theme names can\'t contain commas or semicolons.');
    if (d.themes.some(function (x) { return x.Theme.toLowerCase() === name.toLowerCase(); })) throw new Error('There\'s already a theme called ' + name + '.');
    const hex = function (v, fallback) { return /^#[0-9a-fA-F]{6}$/.test(v || '') ? String(v).toUpperCase() : fallback; };
    const slides = ['new', 'copy', 'share'].indexOf(info.slides) >= 0 ? info.slides : 'new';
    const vals = [name, String(info.display || '').trim() || src['Display Name'] || name,
      hex(info.main, src.Main), hex(info.accent, src.Accent),
      src['Logo URL'] || '', src['Wayfinding Left'] || '', src['Wayfinding Right'] || '', src['QR Label'] || '', src['QR Link'] || '',
      src['Wi-Fi Name'] || '', src['Wi-Fi Password'] || '', src.Calendar || '', src['Calendar Hide'] || '',
      slides === 'share' ? (src['Slides Folder'] || '') : '',
      hex(info.mainText, src['Main Text'] || '#FFFFFF'), hex(info.accentText, src['Accent Text'] || '#FFFFFF')];
    const row = appendRow_(sheet_('Themes'), vals.map(function (v) { return txt_(v); }));
    let copied = 0;
    if (slides !== 'share') {
      ensureThemeFolder_({ Theme: name, 'Slides Folder': '', _row: row });
      if (slides === 'copy') {
        const fromId = folderId_(src['Slides Folder']);
        const toId = folderId_(sheet_('Themes').getRange(row, 14).getDisplayValue());
        if (fromId && toId) {
          const to = DriveApp.getFolderById(toId);
          const it = DriveApp.getFolderById(fromId).getFiles();
          while (it.hasNext() && copied < 300) {
            const f = it.next();
            if (!MEDIA[f.getMimeType()]) continue;
            f.makeCopy(f.getName(), to);
            copied++;
          }
        }
      }
    }
    log_(me, 'Duplicated theme', sourceName + ' as ' + name + (slides === 'share' ? ' (same slides folder)' : slides === 'copy' ? ' (' + copied + ' slides copied)' : ' (new empty slides folder)'));
    return { name: name, copied: copied, slides: slides };
  });
}
