/**
 * Graceview TV Lab
 * A web control panel and virtual TVs, driven by the "Graceview TV Lab" Sheet.
 * Separate from the real Graceview TV system: it reads and writes only this Sheet.
 *
 *   Panel:       <web app URL>
 *   Virtual TV:  <web app URL>?tv=LOBBY            (any Device ID from the Devices tab)
 *   Preview:     <web app URL>?tv=LOBBY&at=2026-11-22T10:45
 */

const TZ = 'America/Chicago';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEATHER_AT = { lat: 30.0972, lon: -95.6161, place: 'Tomball' };
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
  console.log('All permissions are approved.');
}

function doGet(e) {
  // Asks anyone opening the app to approve permissions they haven't approved yet (Drive, for example).
  if (ScriptApp.requireAllScopes) ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const p = (e && e.parameter) || {};
  // "?screen" = a TV (pairs itself, then shows its device). "?tv=ID" = a preview for signed-in people.
  const isTv = !!p.tv || Object.prototype.hasOwnProperty.call(p, 'screen');
  const t = HtmlService.createTemplateFromFile(isTv ? 'Tv' : 'Panel');
  t.params = JSON.stringify(p).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle(p.tv ? 'Preview: ' + p.tv : isTv ? 'Graceview TV screen' : 'Graceview TV Lab')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* ---------- Sheet helpers ---------- */

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('The Sheet is missing its "' + name + '" tab.');
  return sh;
}

function rows_(name) {
  const v = sheet_(name).getDataRange().getDisplayValues();
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
function stampNow_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }

/** The moment being shown: now in Chicago, or a preview time 'yyyy-MM-ddTHH:mm'. */
function at_(iso) {
  let ymd, mins, preview = false;
  if (iso && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso)) {
    ymd = iso.slice(0, 10); mins = mins_(iso.slice(11)); preview = true;
  } else {
    const d = new Date();
    ymd = Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
    mins = mins_(Utilities.formatDate(d, TZ, 'HH:mm'));
  }
  return { ymd: ymd, mins: mins, dow: dow_(ymd), preview: preview, stamp: ymd + ' ' + hhmm_(mins),
           today: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') };
}

function data_() {
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
  return {
    name: th.Theme || '', display: th['Display Name'] || th.Theme || '',
    main: th.Main || '#333333', accent: th.Accent || '#555555', logo: th['Logo URL'] || '',
    mainText: th['Main Text'] || '#FFFFFF', accentText: th['Accent Text'] || '#FFFFFF',
    wayL: split_(th['Wayfinding Left'], ';'), wayR: split_(th['Wayfinding Right'], ';'),
    qrLabel: th['QR Label'] || 'Info', qrLink: th['QR Link'] || '',
    wifiName: th['Wi-Fi Name'] || '', wifiPass: th['Wi-Fi Password'] || '',
  };
}

/** What plays for a theme: the files in its slides folder that are in their dates, in file-name order. */
function slidesFor_(th, t) {
  return folderFiles_(th).files
    .filter(function (f) { return (!f.from || f.from <= t.ymd) && (!f.until || f.until >= t.ymd); })
    .map(function (f) { return { title: f.title, sub: '', img: f.thumb, full: f.full, video: f.video }; });
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

/** Lists a theme's slides folder, in play order. Cached for 60 seconds unless `fresh`. */
function folderFiles_(th, fresh) {
  const id = folderId_(th['Slides Folder']);
  if (!id) return { linked: false, files: [], error: '' };
  const cache = CacheService.getScriptCache();
  const key = 'folder:' + id;
  if (!fresh) { const hit = cache.get(key); if (hit) return JSON.parse(hit); }
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
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
    try { cache.put(key, JSON.stringify(out), 60); } catch (err) { /* too big to cache */ }
  } catch (err) {
    const why = String(err && err.message || err);
    console.error('Slides folder ' + id + ': ' + why);
    out = { linked: true, files: [], error: /permission|authori[sz]/i.test(why)
      ? 'Google Drive access hasn\'t been approved for this app yet. (' + why + ')'
      : 'The slides folder couldn\'t be opened. Check the link on the Themes page, and that you have access to the folder. (' + why + ')' };
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
  if (!id) throw new Error('The ' + theme + ' theme has no slides folder yet. Add one on the Themes page.');
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
    const p = parseSlideName_(fileName, Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'));
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
 * Each theme's Calendar cell holds one or more links, separated by ";":
 *   webcal://… or https://….ics   (ShelbyNext and most church calendars)
 *   a Google Calendar ID           (the calendar must be public)
 * The server fetches and reads the feed, so browsers never touch it. Results are cached for 15 minutes.
 */

function calUrls_(src) {
  return split_(src, /[;\s]+/).map(function (x) {
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

/** Returns { events (up to 4, for This Week), count (in the next 7 days), errors }. */
function calendar_(th, t) {
  const src = String(th.Calendar || '').trim();
  if (!src) return { events: [], count: 0, errors: [] };
  const winEnd = addDays_(t.ymd, 7);
  const cache = CacheService.getScriptCache();
  const key = 'cal:' + digest_(src + '|' + (th['Calendar Hide'] || '') + '|' + t.ymd);
  let all = null;
  const hit = cache.get(key);
  if (hit) all = JSON.parse(hit);
  if (!all) {
    all = { events: [], errors: [] };
    const hide = split_(th['Calendar Hide'], ';').map(function (x) { return x.toLowerCase(); });
    calUrls_(src).forEach(function (url, i) {
      const which = 'Calendar link ' + (i + 1);
      if (!url) { all.errors.push(which + ' isn\'t a webcal link, an https link or a Google Calendar ID.'); return; }
      try {
        const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
        const body = res.getContentText();
        if (res.getResponseCode() !== 200 || body.indexOf('BEGIN:VCALENDAR') < 0) {
          all.errors.push(which + ' didn\'t return a calendar (HTTP ' + res.getResponseCode() + '). Check the link, and that a Google calendar is public.');
          return;
        }
        all.events = all.events.concat(parseIcs_(body, t.ymd, winEnd));
      } catch (err) {
        all.errors.push(which + ' couldn\'t be read: ' + err.message);
      }
    });
    all.events = all.events
      .filter(function (e) {
        const title = String(e.title).toLowerCase();
        return !hide.some(function (h) { return title.indexOf(h) >= 0; });
      })
      .sort(function (a, b) {
        if (a.ymd !== b.ymd) return a.ymd < b.ymd ? -1 : 1;
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return a.mins - b.mins;
      });
    try { cache.put(key, JSON.stringify(all), all.errors.length ? 120 : 900); } catch (err) { /* too big to cache */ }
  }
  const visible = all.events.filter(function (e) {
    return !(e.ymd === t.ymd && !e.allDay && e.endMins <= t.mins);
  });
  return {
    count: all.events.length,
    errors: all.errors,
    events: visible.slice(0, 4).map(function (e) {
      return { dow: DAYS[dow_(e.ymd)], today: e.ymd === t.ymd, allDay: e.allDay,
               start: hhmm_(e.mins), end: hhmm_(Math.min(e.endMins, 1439)), title: e.title };
    }),
  };
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
  } else if (tz && tz !== TZ) {
    try { d = Utilities.parseDate(m[1] + m[2] + m[3] + m[4] + m[5] + m[6], tz, 'yyyyMMddHHmmss'); } catch (err) { d = null; }
  }
  if (d) {
    const s = Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm');
    return { ymd: s.slice(0, 10), mins: mins_(s.slice(11)), allDay: false };
  }
  // Chicago or floating time: already wall-clock.
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
    mode: now.mode, message: now.message || '', endMins: now.endMins,
    theme: themeObj_(th),
    slides: slidesFor_(th, t),
    events: eventsFor_(th, t),
    // Home screen tiles for the previews (the real TV app also drops tiles that don't apply there).
    launcherTiles: (function () { const l = launcherFor_(d, dev); return l ? l.tiles.map(function (x) { return x.label; }) : null; })(),
  };
}

function weather_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('weather');
  if (hit) return JSON.parse(hit);
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + WEATHER_AT.lat + '&longitude=' + WEATHER_AT.lon +
                '&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=America%2FChicago';
    const j = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
    const w = { temp: Math.round(j.current.temperature_2m), code: j.current.weather_code, place: WEATHER_AT.place };
    cache.put('weather', JSON.stringify(w), 900);
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

function props_() { return PropertiesService.getScriptProperties(); }
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

function settings_() {
  const out = {};
  try { sheet_('Settings').getDataRange().getDisplayValues().slice(1).forEach(function (r) { if (r[0]) out[r[0]] = r[1]; }); }
  catch (err) { /* no Settings tab yet */ }
  return out;
}
function setSetting_(key, value) {
  const sh = sheet_('Settings');
  const v = sh.getDataRange().getDisplayValues();
  for (let i = 1; i < v.length; i++) {
    if (v[i][0] === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  }
  sh.appendRow([key, value]);
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
  const u = email ? userRow_(d, email) : null;
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
    setPassword_(google, info.password);
    setSetting_('Church Name', church);
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
  if (u) sheet_('Users').getRange(u._row, 9).setValue("'" + stampNow_());
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
  return ScriptApp.getService().getUrl() + '?invite=' + token;
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
  const d = data_();
  const me = me_(d, token);
  const st = settings_();
  if (me.role === 'None') return { me: me, state: me.state, church: st['Church Name'] || '' };
  const t = at_(iso);
  const devices = d.devices.filter(function (v) { return deviceOk_(me, v); }).map(function (v) {
    const now = resolve_(v, t, d);
    return { id: v['Device ID'], name: v.Name, location: v.Location, profile: v.Profile, hardware: v.Hardware,
             lastSeen: v['Last Seen'], version: v['App Version'], pairedAt: v['Paired At'] || '', pairedBy: v['Paired By'] || '',
             online: minutesAgo_(v['Last Seen']) <= 3,
             ip: v['IP Address'] || '', nowShowing: v['Now Showing'] || '', defaultTheme: v['Default Theme'] || '',
             defaultMode: v['Default Mode'] || '', launcher: v.Launcher || '', muteLive: bool_(v['Mute Live']), wayfinding: bool_(v.Wayfinding),
             reportedApps: (function () { try { return JSON.parse(props_().getProperty('apps:' + v['Device ID']) || '[]').length; } catch (e) { return 0; } })(),
             now: now, screen: screen_(v, now, t, d) };
  });
  const themes = d.themes.filter(function (x) { return themeOk_(me, x.Theme); });
  return {
    me: me, perms: PERMS[me.role], t: t, url: ScriptApp.getService().getUrl(), church: st['Church Name'] || '',
    users: can_(me, 'users') ? d.users.map(function (u) {
      return { email: u.Email, name: u.Name, role: u.Role, themes: split_(u.Themes, ','), devices: split_(u.Devices, ','),
               status: u.Status, invitedBy: u['Invited By'], invitedAt: u['Invited At'], lastSignIn: u['Last Sign-in'] };
    }) : [],
    owner: can_(me, 'users') ? { name: st['Owner Name'] || 'Owner', email: st['Owner Email'] || '' } : null,
    roles: ROLES, allThemes: d.themes.map(function (x) { return x.Theme; }),
    launchers: needAdminOk_(me) ? d.launchers.map(function (l) {
      return { name: l.Name, tiles: parseTiles_(l.Tiles), idleMinutes: Number(l['Idle Minutes']) || 0, notes: l.Notes || '',
               devices: d.devices.filter(function (v) { return String(v.Launcher || '') === l.Name; }).map(function (v) { return v['Device ID']; }) };
    }) : [],
    builtinTiles: BUILTIN_TILES, reportedApps: needAdminOk_(me) ? reportedApps_() : [],
    launcherNames: d.launchers.map(function (l) { return l.Name; }),
    greenRoom: can_(me, 'greenroom') ? greenRoomForPanel_(d) : null,
    deviceList: d.devices.map(function (v) { return { id: v['Device ID'], name: v.Name, profile: v.Profile, launcher: v.Launcher || '' }; }),
    devices: devices, allDevices: d.devices.map(function (v) { return { id: v['Device ID'], name: v.Name, profile: v.Profile }; }),
    themes: themes, themeObjs: themes.map(themeObj_), fallbackTheme: fallbackTheme_(d),
    slidesByTheme: themes.reduce(function (m, th) { m[th.Theme] = slidesFor_(th, t); return m; }, {}),
    folders: (can_(me, 'slides') || can_(me, 'theme')) ? themes.reduce(function (m, th) { m[th.Theme] = folderFiles_(th); return m; }, {}) : {},
    eventsByTheme: themes.reduce(function (m, th) { m[th.Theme] = eventsFor_(th, t); return m; }, {}),
    calStatus: themes.reduce(function (m, th) {
      const c = calendar_(th, t);
      m[th.Theme] = { linked: !!String(th.Calendar || '').trim(), count: c.count, errors: c.errors };
      return m;
    }, {}),
    weekly: can_(me, 'schedule') ? d.weekly : [], special: can_(me, 'schedule') ? d.special : [],
    conflicts: can_(me, 'schedule') ? conflicts_(d) : [],
    override: d.override, presets: can_(me, 'override') ? d.presets : [],
    activity: can_(me, 'activity') ? rows_('Activity').slice(-50).reverse() : [],
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
  return { t: t, now: now, screen: screen_(dev, now, t, d), weather: weather_() };
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
    else out = { error: 'Unknown action.' };
  } catch (err) {
    out = { error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
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
  return { device: dev.Name, church: settings_()['Church Name'] || '', batch: toProductionBatch_(d, t),
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
  const all = props_().getProperties();
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
    return [th.Theme, th.Main, th.Accent, th['Display Name'] || th.Theme, th['Logo URL'] || '', th['Logo URL'] || '',
            th['Wayfinding Left'] || '', th['Wayfinding Right'] || '', th['QR Link'] || '', tvCalendar_(th.Calendar),
            th['Wi-Fi Name'] || '', th['Wi-Fi Password'] || '', th['Calendar Hide'] || ''];
  });
  // Each theme's slides folder doubles as a production "folder" of the same name.
  const folders = d.themes.map(function (th) { return [th.Theme, th['Slides Folder'] || '']; });
  // Green Room: the tab's rows as-is (settings by label, then the Mic Label table), like the production tab.
  const ranges = [override, special, weekly, devices, themes, folders, [], d.greenRoom || []];
  return { valueRanges: ranges.map(function (values) { return { values: values.map(function (r) { return r.map(String); }) }; }) };
}

/**
 * The TV app reads iCal links itself; a Google Calendar ID would need an API key, so it's sent
 * as the calendar's public iCal link. Only the first link is sent (the app reads one calendar).
 */
function tvCalendar_(src) {
  return calUrls_(src || '').filter(function (u) { return !!u; })[0] || '';
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
    return { code: code, secret: secret, exp: exp, church: settings_()['Church Name'] || '' };
  });
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
  try { return fn(); } finally { lock.releaseLock(); }
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
    if (o.duration === 'eod') ends = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') + ' 23:59';
    else if (Number(o.duration) > 0) ends = Utilities.formatDate(new Date(Date.now() + Number(o.duration) * 60000), TZ, 'yyyy-MM-dd HH:mm');
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
  try { return sheet_('Green Room').getDataRange().getDisplayValues().map(function (r) { return r.slice(0, 4).map(String); }); }
  catch (err) { return []; }
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
  const raw = props_().getProperty('pco');
  const pco = raw ? JSON.parse(raw) : null;
  return {
    settings: parsed.settings, mics: parsed.mics, micSources: MIC_SOURCES, hasTab: (d.greenRoom || []).length > 0,
    // Never the secret itself: only whether a login is saved, its last 4 ID characters, and who saved it when.
    planningCenter: pco ? { saved: true, idHint: '…' + String(pco.appId).slice(-4), savedBy: pco.savedBy, savedAt: pco.savedAt } : { saved: false },
    tvs: d.devices.filter(isGreenRoom_).map(function (v) {
      const r = props_().getProperty('grstatus:' + v['Device ID']);
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
  return {
    fallback: fallbackTheme_(d), isFallback: fallbackTheme_(d) === theme,
    devices: r.devices.map(function (v) { return v.Name; }),
    scheduleRows: r.weekly.length + r.special.length, override: r.override.length > 0,
    presets: r.presets.map(function (x) { return x.Name; }),
    users: r.users.map(function (u) { return u.Name || u.Email; }),
  };
}

function deleteTheme(theme, token) {
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
    sheet_('Themes').deleteRow(row._row);
    log_(me, 'Deleted theme', theme + ': ' + r.devices.length + ' TVs moved to ' + fallback + ', ' +
         (r.weekly.length + r.special.length + r.override.length + r.presets.length) + ' schedule rows now follow each TV\'s theme');
    return { fallback: fallback, devices: r.devices.length };
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
