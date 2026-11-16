// Graceview Event Screen (web). A port of the TV app's Signage, Fullscreen, Countdown, Message and
// Live screens (android/app ui/SignageScreen.kt, ModeScreens.kt). Keep them in step.
// The server (android/web) runs the schedule; this page polls /api/state and draws it.
'use strict';

const TZ = 'America/Chicago';
const POLL_MS = 5000;
const NO_EVENTS = 'See all events at graceview.org';
const params = new URLSearchParams(location.search);
// Testing: ?fakeNow=2026-11-15T15:05:00 runs the schedule from that time (Chicago), moving forward.
const fakeNow = params.get('fakeNow');
const loadedAt = Date.now();

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} },
};

let device = params.get('device') || store.get('device');
let picking = params.has('pick') || !device;
let state = null;          // the last /api/state reply
let clockOffset = 0;       // server time minus this computer's time
let fetchFailed = false;
let firstVersion = null;
let manual = null;         // F1-F3: a mode chosen at the keyboard, until the next scheduled change or F4
let lastKey = null;        // the schedule's key, to notice a scheduled change
let screen = null;         // { sig, el, update(), dispose() }

const stage = document.getElementById('stage');
const banner = document.getElementById('banner');

// ---- Helpers --------------------------------------------------------------

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function txt(text, size, extra = '', style = '') {
  return `<div class="${extra}" style="font-size:${size}px;${style}">${esc(text)}</div>`;
}
const nowMs = () => Date.now() + clockOffset;

const parts = (opts) => {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts });
  return ms => Object.fromEntries(f.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
};
const pTime = parts({ hour: 'numeric', minute: '2-digit', hour12: true });
const pDate = parts({ weekday: 'short', day: '2-digit', month: 'long' });
const fLongDate = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });
const clock = ms => { const p = pTime(ms); return { hm: `${p.hour}:${p.minute}`, ampm: (p.dayPeriod || '').toUpperCase() }; };
const clockText = ms => { const c = clock(ms); return `${c.hm} ${c.ampm}`; };

// ---- Scaling: the 1920x1080 design fitted into the window -----------------

function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px, ${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
}
addEventListener('resize', fit);
fit();

// ---- Notes at the bottom ----------------------------------------------------

let bannerTimer = 0;
function note(text, ms = 5000) {
  banner.textContent = text;
  banner.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { banner.hidden = true; }, ms);
}

// ---- Polling ----------------------------------------------------------------

async function poll() {
  try {
    const q = new URLSearchParams();
    if (device) q.set('device', device);
    if (fakeNow) { q.set('fakeNow', fakeNow); q.set('elapsed', String(Date.now() - loadedAt)); }
    const res = await fetch('api/state?' + q, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const s = await res.json();
    clockOffset = s.now - Date.now();
    // A new server build: load the new page.
    if (firstVersion && s.version !== firstVersion) { location.reload(); return; }
    firstVersion = s.version;
    const key = s.schedule ? s.schedule.key : null;
    if (lastKey !== null && key !== null && key !== lastKey && manual) {
      manual = null;
      note('Schedule changed: following the schedule');
    }
    if (key !== null) lastKey = key;
    state = s;
    fetchFailed = false;
  } catch (e) {
    fetchFailed = true;
  }
  render();
}

// ---- Choosing what to show --------------------------------------------------

function render() {
  const s = state;
  let want;
  if (!s && fetchFailed) want = status('Can’t reach the Event Screen server', 'It runs on the vMix computer. Is that computer on, and is this one on the church network?\n\nTrying again every 5 seconds.');
  else if (!s) want = status('Starting up…', 'Loading the schedule.');
  else if (!s.apiKey) want = status('Google API key is missing', 'Add google.apiKey to android/local.properties and rebuild the server.');
  else if (!s.sheetLoaded && s.sheetError) want = status('Can’t load the schedule sheet', s.sheetError + '\n\nTrying again every 3 minutes. Is the vMix computer online?');
  else if (!s.sheetLoaded) want = status('Starting up…', 'Loading the schedule sheet.');
  else if (!s.devices || !s.devices.length) want = status('No devices in the sheet', 'Add an Event Screen row in the Devices tab.');
  else if (picking || !s.device) want = { sig: 'picker:' + s.devices.map(d => d.name).join('|') + ':' + device, make: () => pickerScreen(s.devices) };
  else want = modeScreen(s);

  document.body.style.background = s && s.theme && s.device && !picking ? s.theme.main : '#000';
  if (!screen || screen.sig !== want.sig) {
    if (screen && screen.dispose) screen.dispose();
    stage.replaceChildren();
    screen = want.make();
    screen.sig = want.sig;
    stage.appendChild(screen.el);
  }
  if (screen.update) screen.update(s);
}

function status(title, detail) {
  return {
    sig: 'status:' + title + detail,
    make: () => ({
      el: el(`<div class="panel" style="justify-content:center;padding:120px">
        ${txt(title, 64, 'mont bold')}
        <div style="height:24px"></div>
        ${txt(detail, 32, '', 'color:#ccc;line-height:1.35;white-space:pre-line')}
      </div>`),
    }),
  };
}

function shownMode(s) {
  const m = manual || s.schedule.mode;
  return ['Launcher', 'LiveOption', 'Dashboard'].includes(m) ? 'Signage' : m;
}

function modeScreen(s) {
  const mode = shownMode(s);
  const t = s.theme;
  const base = [mode, s.device, JSON.stringify(t), s.logoDark, s.logoLight, s.folderName, s.folderLinked].join('|');
  const hint = !s.folderLinked
    ? `The "${s.folderName}" folder has no Drive link in the Folders tab.`
    : `Add JPG, PNG or MP4 files to the "${s.folderName}" Drive folder.`;
  const logo = s.logoDark || s.logoLight;
  switch (mode) {
    case 'Fullscreen': return { sig: base, make: () => fullscreenScreen(t, hint) };
    case 'Countdown': return { sig: base + '|' + s.schedule.end, make: () => countdownScreen(t, hint, logo) };
    case 'Message': return { sig: base + '|' + s.schedule.message, make: () => messageScreen(t, s.schedule.message, logo) };
    case 'Live': return { sig: base + '|' + JSON.stringify(s.live), make: () => liveScreen(t, s.live, logo) };
    case 'Off': return { sig: 'off', make: () => ({ el: el('<div class="screen" style="background:#000"></div>') }) };
    default: return { sig: base, make: () => signageScreen(t, hint, s.logoDark, s.logoLight) };
  }
}

// ---- Slides -----------------------------------------------------------------

/** Rotates the folder's slides: 12 s each, a "[full]" video up to 3 minutes, a video that ends sooner advances. */
function slideArea(bg, title, hint, dotsBottom = 28) {
  const root = el(`<div class="slides" style="background:${esc(bg)}"></div>`);
  const dots = el(`<div class="dots" style="bottom:${dotsBottom}px"></div>`);
  let list = null;
  let counter = 0;
  let current = null;   // { url, node }
  let timer = 0;

  function clearCurrent() {
    clearTimeout(timer);
    if (current && current.node) {
      const n = current.node;
      if (n.tagName === 'VIDEO') { n.pause(); n.removeAttribute('src'); n.load(); }
      n.remove();
    }
    current = null;
  }

  function showEmpty() {
    clearCurrent();
    root.replaceChildren(el(`<div class="empty">${txt(title, 72, 'mont bold')}${txt(hint, 30, '', 'color:rgba(255,255,255,.8)')}</div>`));
  }

  function show() {
    if (!list.length) { showEmpty(); return; }
    const i = counter % list.length;
    const slide = list[i];
    const old = current;
    clearTimeout(timer);
    const startedAt = Date.now();
    const advance = () => { counter++; show(); };
    // A slide that fails to load (server restarting, file gone) waits 5 s, so a failure can't spin.
    const failed = () => { clearTimeout(timer); timer = setTimeout(advance, Math.max(0, 5000 - (Date.now() - startedAt))); };
    let node;
    if (slide.video && old && old.url === slide.url && old.node && old.node.tagName === 'VIDEO') {
      // The same video again (a folder with one video): restart it instead of making a new player.
      node = old.node;
      node.onended = advance;
      node.onerror = failed;
      node.currentTime = 0;
      node.play().catch(() => {});
    } else if (slide.video) {
      node = document.createElement('video');
      node.muted = true; node.playsInline = true; node.autoplay = true; node.preload = 'auto';
      node.onended = advance;
      node.onerror = failed;
      node.src = slide.url;
      root.appendChild(node);
      node.play().catch(() => {});
      if (old && old.node) dropNode(old.node);
    } else {
      node = new Image();
      node.decoding = 'async';
      node.onload = () => { if (old && old.node && old.node !== node) dropNode(old.node); };
      node.onerror = () => { if (old && old.node && old.node !== node) dropNode(old.node); failed(); };
      node.src = slide.url;
      root.appendChild(node);
    }
    [...root.querySelectorAll('.empty')].forEach(e => e.remove());
    current = { url: slide.url, node };
    timer = setTimeout(advance, slide.maxMs);
    drawDots(i);
  }

  function dropNode(n) {
    if (n.tagName === 'VIDEO') { n.pause(); n.removeAttribute('src'); n.load(); }
    n.remove();
  }

  function drawDots(i) {
    if (list.length >= 2 && list.length <= 20) {
      dots.innerHTML = list.map((_, n) => `<i class="${n === i ? 'on' : ''}"></i>`).join('');
      if (!dots.isConnected) root.appendChild(dots); else root.appendChild(dots);
    } else dots.remove();
  }

  return {
    el: root,
    set(slides) {
      const next = slides || [];
      const same = list && next.length === list.length && next.every((s, k) => s.url === list[k].url);
      if (same) return;
      const was = list ? list.length : 0;
      list = next;
      if (!list.length) { showEmpty(); return; }
      if (!was || !current || !list.some(s => s.url === current.url)) { counter = 0; show(); }
      else { counter = list.findIndex(s => s.url === current.url); drawDots(counter); }
    },
    dispose() { clearCurrent(); },
  };
}

// ---- Signage ----------------------------------------------------------------

function sidebarTitle(t) { return /school/i.test(t.displayName) ? 'This Week at School' : 'This Week'; }
function infoLabel(t) { return /school/i.test(t.displayName) ? 'School Info' : /church/i.test(t.displayName) ? 'Church Info' : 'More Info'; }
const qrImg = (text, size) => `<div class="qrbox" style="width:${size + 16}px;height:${size + 16}px"><img src="qr.png?text=${encodeURIComponent(text)}" alt=""></div>`;
const wayfinding = t => (t.wayLeft && t.wayLeft.length) || (t.wayRight && t.wayRight.length);

function signageScreen(t, hint, logoDark, logoLight) {
  const root = el(`<div class="screen col" style="background:${esc(t.main)}"></div>`);
  const top = el(`<div class="row" style="height:864px"></div>`);
  const slideBox = el(`<div style="position:relative;width:1536px;height:864px;background:${esc(t.main)}"></div>`);
  const slides = slideArea(t.main, t.displayName, hint);
  slideBox.appendChild(slides.el);
  const side = sidebar(t);
  top.append(slideBox, side.el);
  const bar = bottomBar(t, logoDark, logoLight);
  root.append(top, bar.el);
  return {
    el: root,
    update(s) { slides.set(s.slides); side.update(s.events); bar.update(s.weather); },
    dispose() { slides.dispose(); bar.dispose(); },
  };
}

function sidebar(t) {
  const wifi = t.wifi || null;
  const info = t.qrLink || null;
  const qrCount = (wifi ? 1 : 0) + (info ? 1 : 0);
  const root = el(`<div class="sidebar" style="background:${esc(t.main)}"></div>`);
  const head = el(`<div>${txt(sidebarTitle(t), 36, 'mont bold', 'line-height:1.2')}<div style="height:18px"></div><div style="height:2px;background:rgba(255,255,255,.6)"></div></div>`);
  const list = el(`<div class="events"></div>`);
  const spacer = el(`<div style="flex:1"></div>`);
  let qr = null;
  if (wifi && info) {
    qr = el(`<div class="col" style="gap:18px">
      <div class="row" style="gap:24px">
        <div class="col" style="align-items:center;gap:10px">${qrImg(info, 124)}${txt(infoLabel(t), 22, 'semi nowrap')}</div>
        <div class="col" style="align-items:center;gap:10px">${qrImg(wifi, 124)}${txt('Free Wi-Fi', 22, 'semi nowrap')}</div>
      </div>
      ${txt('Point your phone camera at a code', 20, '', 'line-height:1.3')}
    </div>`);
  } else if (wifi || info) {
    const [code, title, sub] = wifi ? [wifi, 'Free Wi-Fi', `Scan to join ${t.wifiName}`] : [info, infoLabel(t), 'Scan with your phone camera'];
    qr = el(`<div class="row" style="align-items:center;gap:20px">${qrImg(code, 140)}
      <div class="col" style="flex:1;gap:4px">${txt(title, 30, 'semi', 'line-height:1.15')}${txt(sub, 22, 'clamp4', 'line-height:1.3')}</div></div>`);
  }
  let lastEvents;
  return {
    el: root,
    update(events) {
      const sig = JSON.stringify(events ?? null);
      if (sig === lastEvents) return;
      lastEvents = sig;
      root.replaceChildren();
      if (events) {
        root.append(head, list);
        list.replaceChildren();
        if (!events.length) list.appendChild(el(txt(NO_EVENTS, 30, '', 'line-height:1.2')));
        else events.slice(0, qrCount === 0 ? 4 : 3).forEach(ev => list.appendChild(el(`<div class="col" style="gap:4px">
          ${txt(ev.label.toUpperCase(), 22, 'semi clamp2', 'letter-spacing:.1em;line-height:1.2')}
          ${txt(ev.title, 32, 'clamp2', 'line-height:1.15')}</div>`)));
      } else root.append(spacer);
      if (qr) root.append(qr);
      // Leave out any event that doesn't fit whole, like the TVs.
      requestAnimationFrame(() => {
        const box = list.getBoundingClientRect();
        [...list.children].forEach(c => { if (c.getBoundingClientRect().bottom > box.bottom + 1) c.remove(); });
      });
    },
  };
}

function logoHtml(src, name, width, maxHeight, textColor) {
  return src
    ? `<img class="logo" src="${esc(src)}" alt="" style="width:${width}px;max-height:${maxHeight}px">`
    : txt(name, 26, 'semi', `width:${width}px;color:${esc(textColor)};text-align:center;line-height:1.15`);
}

const CLOUD = 'M17 40h31a11 11 0 0 0 1-22 16 16 0 0 0-30-5A13.5 13.5 0 0 0 17 40z';
function sky(w) {
  if (!w) return 'cloud';
  const c = w.code;
  if (c === 0 || c === 1) return w.isDay === false ? 'moon' : 'sun';
  if (c === 2 || c === 3) return 'cloud';
  if (c === 45 || c === 48) return 'fog';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if (c >= 95 && c <= 99) return 'storm';
  return 'cloud';
}
function weatherIcon(w, width, height) {
  const kind = sky(w);
  const small = `<path d="${CLOUD}" transform="translate(10 -3) scale(.7)" stroke-width="5"/>`;
  let body;
  switch (kind) {
    case 'sun': {
      let rays = '';
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4, dx = Math.cos(a), dy = Math.sin(a);
        rays += `<line x1="${32 + dx * 13}" y1="${22 + dy * 13}" x2="${32 + dx * 18}" y2="${22 + dy * 18}"/>`;
      }
      body = `<circle cx="32" cy="22" r="8"/>${rays}`;
      break;
    }
    // The circle (32,22) r15 minus the circle (41,15) r12, as on the TVs.
    case 'moon': body = `<path d="M32.06 7A15 15 0 1 0 46.55 25.63A12 12 0 1 1 32.06 7z"/>`; break;
    case 'fog': body = small + '<line x1="14" y1="34" x2="50" y2="34"/><line x1="14" y1="41" x2="50" y2="41"/>'; break;
    case 'rain': body = small + [24, 33, 42].map(x => `<line x1="${x}" y1="33" x2="${x - 3}" y2="42"/>`).join(''); break;
    case 'snow': body = small + [24, 33, 42].map(x => `<circle cx="${x}" cy="38" r="2.4" fill="#fff" stroke="none"/>`).join(''); break;
    case 'storm': body = small + '<path d="M35 29L28 37H33L29 44L38 34H33Z" fill="#fff" stroke="none"/>'; break;
    default: body = `<path d="${CLOUD}"/>`;
  }
  return `<svg viewBox="0 0 64 44" width="${width}" height="${height}" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function bottomBar(t, logoDark, logoLight) {
  const root = el(`<div class="row" style="height:216px"></div>`);
  const cell = (w, bg, inner, start = false) => `<div class="cell${start ? ' start' : ''}" style="width:${w}px;background:${esc(bg)}">${inner}</div>`;
  const clockHtml = `<div class="row" style="align-items:center;gap:14px">
      <div class="light" data-k="hm" style="font-size:116px;line-height:1"></div>
      <div class="light" data-k="ampm" style="font-size:42px;line-height:1;padding-top:24px"></div></div>`;
  const temp = `<span data-k="temp">--°</span>`;
  if (wayfinding(t)) {
    const way = (items, left) => `<div class="col" style="padding:0 30px;gap:4px;min-width:0">${(items || []).slice(0, 4)
      .map(x => txt(left ? `← ${x}` : `${x} →`, 34, 'nowrap')).join('')}</div>`;
    root.innerHTML =
      cell(384, t.accent, clockHtml) +
      cell(384, t.main, `<div class="row" style="align-items:center;gap:20px">
        <div class="light" data-k="dow" style="font-size:96px;line-height:1"></div>
        <div class="col" style="align-items:center"><div class="light" data-k="dd" style="font-size:116px;line-height:1"></div>
        <div data-k="month" style="font-size:26px"></div></div></div>`) +
      cell(384, t.accent, way(t.wayLeft, true), true) +
      cell(384, t.main, way(t.wayRight, false), true) +
      cell(384, t.accent, `<div class="col" style="align-items:center;gap:18px">
        ${logoHtml(logoDark || logoLight, t.displayName, 250, 100, '#fff')}
        <div class="row" style="align-items:center;gap:12px"><span data-k="icon" data-w="52" data-h="36"></span>
        <div class="light nowrap" style="font-size:34px">${temp} Tomball</div></div></div>`);
  } else {
    // No wayfinding (the Coffee Spot layout): clock, big weather, logo on white, wide date.
    root.innerHTML =
      cell(384, t.accent, clockHtml) +
      cell(480, t.main, `<div class="col" style="align-items:center;gap:4px">
        <div class="row" style="align-items:center;gap:20px"><span data-k="icon" data-w="120" data-h="84"></span>
        <div class="light" style="font-size:110px;line-height:1">${temp}</div></div>
        <div style="font-size:26px">Tomball</div></div>`) +
      cell(216, '#FFFFFF', logoHtml(logoLight || logoDark, t.displayName, 180, 180, t.main)) +
      cell(840, t.main, `<div class="row" style="align-items:center;gap:24px">
        <div class="col" style="align-items:flex-end"><div class="light" data-k="dow" style="font-size:96px;line-height:1"></div>
        <div data-k="month" style="font-size:30px"></div></div>
        <div class="light" data-k="dd" style="font-size:120px;line-height:1"></div></div>`);
  }
  const q = k => [...root.querySelectorAll(`[data-k="${k}"]`)];
  const set = (k, v) => q(k).forEach(n => { if (n.textContent !== v) n.textContent = v; });
  let lastWeather;
  function tick() {
    const ms = nowMs();
    const c = clock(ms);
    const d = pDate(ms);
    set('hm', c.hm); set('ampm', c.ampm);
    set('dow', d.weekday); set('dd', d.day); set('month', d.month);
  }
  tick();
  const timer = setInterval(tick, 1000);
  return {
    el: root,
    update(w) {
      const sig = JSON.stringify(w ?? null);
      if (sig === lastWeather) return;
      lastWeather = sig;
      set('temp', w ? `${w.tempF}°` : '--°');
      q('icon').forEach(n => { n.innerHTML = weatherIcon(w, +n.dataset.w, +n.dataset.h); });
    },
    dispose() { clearInterval(timer); },
  };
}

// ---- Fullscreen, Countdown, Message -------------------------------------------

function fullscreenScreen(t, hint) {
  const root = el(`<div class="screen" style="background:${esc(t.main)}"></div>`);
  const slides = slideArea(t.main, t.displayName, hint);
  root.appendChild(slides.el);
  return { el: root, update(s) { slides.set(s.slides); }, dispose() { slides.dispose(); } };
}

function countdownScreen(t, hint, logo) {
  const root = el(`<div class="screen" style="background:#000"></div>`);
  const top = el(`<div style="position:absolute;left:0;top:0;width:1920px;height:880px"></div>`);
  const slides = slideArea('#000', t.displayName, hint, 20);
  top.appendChild(slides.el);
  const bar = el(`<div class="row" style="position:absolute;left:0;bottom:0;width:1920px;height:200px;background:${esc(t.accent)};
      padding:0 96px;align-items:center;justify-content:space-between">
    <div class="row" style="align-items:center;gap:32px">${txt('Worship begins in', 48, 'semi')}
      <div class="mont bold" data-k="left" style="font-size:136px;line-height:1"></div></div>
    <div class="row" style="align-items:center;gap:36px">
      <div class="col" data-k="when" style="align-items:flex-end;gap:2px"></div>
      ${logoHtml(logo, t.displayName, 280, 140, '#fff')}</div></div>`);
  root.append(top, bar);
  let end = null;
  const left = bar.querySelector('[data-k="left"]');
  const when = bar.querySelector('[data-k="when"]');
  function tick() {
    const secs = end == null ? 0 : Math.max(0, Math.floor((end - nowMs()) / 1000));
    const p2 = n => String(n).padStart(2, '0');
    left.textContent = secs >= 3600 ? `${Math.floor(secs / 3600)}:${p2(Math.floor(secs % 3600 / 60))}:${p2(secs % 60)}` : `${Math.floor(secs / 60)}:${p2(secs % 60)}`;
  }
  const timer = setInterval(tick, 250);
  return {
    el: root,
    update(s) {
      slides.set(s.slides);
      if (end !== s.schedule.end) {
        end = s.schedule.end;
        when.innerHTML = end == null ? '' : txt(`Sanctuary · ${clockText(end)}`, 42, 'semi') + txt(fLongDate.format(new Date(end)), 30);
      }
      tick();
    },
    dispose() { slides.dispose(); clearInterval(timer); },
  };
}

function messageScreen(t, message, logo) {
  const amber = '#F2A900';
  const size = message.length > 140 ? 72 : message.length > 80 ? 96 : 120;
  const root = el(`<div class="screen col" style="background:#14171C">
    <div style="height:28px;background:${amber}"></div>
    <div class="col" style="flex:1;padding:100px 160px;gap:40px;justify-content:center">
      <div class="row" style="align-items:center;gap:24px">
        <svg viewBox="0 0 48 48" width="84" height="84" fill="none" stroke="${amber}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"><path d="M24 5L44 41H4z"/><path d="M24 19v10M24 35v1"/></svg>
        ${txt('IMPORTANT UPDATE', 48, 'mont xbold', `color:${amber};letter-spacing:.08em`)}
      </div>
      ${txt(message || ' ', size, 'mont xbold', 'line-height:1.08')}
      ${txt('Watch graceview.org and your email for updates.', 50, '', 'color:#D6D9DF')}
    </div>
    <div class="row" style="height:150px;border-top:1px solid #2E333C;padding:0 160px;align-items:center;justify-content:space-between">
      ${logoHtml(logo, t.displayName, 240, 110, '#fff')}
      <div class="light" data-k="clock" style="font-size:48px"></div>
    </div></div>`);
  const c = root.querySelector('[data-k="clock"]');
  const tick = () => { c.textContent = clockText(nowMs()); };
  tick();
  const timer = setInterval(tick, 1000);
  return { el: root, dispose() { clearInterval(timer); } };
}

// ---- Live ---------------------------------------------------------------------

function liveTitle(s) {
  const n = (s && s.schedule && s.schedule.note) || '';
  return !n.trim() || /^sunday service$/i.test(n.trim()) ? 'Worship from the Sanctuary' : n;
}

function liveScreen(t, live, logo) {
  const root = el(`<div class="screen col" style="background:#0B0C0F">
    <div data-k="video" style="position:relative;height:940px;background:#16181D"></div>
    <div class="row" style="height:140px;background:${esc(t.accent)};padding:0 72px;align-items:center;justify-content:space-between">
      <div class="row" style="align-items:center;gap:28px;min-width:0">
        <div class="row" style="background:#fff;border-radius:8px;padding:10px 22px;align-items:center;gap:12px">
          <div style="width:16px;height:16px;border-radius:8px;background:${esc(t.accent)}"></div>
          ${txt('LIVE', 34, 'mont xbold', `color:${esc(t.accent)};letter-spacing:.08em`)}
        </div>
        <div class="semi nowrap" data-k="title" style="font-size:44px"></div>
      </div>
      <div class="row" style="align-items:center;gap:36px">
        <div class="light" data-k="clock" style="font-size:52px"></div>
        ${logoHtml(logo, t.displayName, 230, 100, '#fff')}
      </div></div></div>`);
  const box = root.querySelector('[data-k="video"]');
  const title = root.querySelector('[data-k="title"]');
  const c = root.querySelector('[data-k="clock"]');
  const tick = () => { c.textContent = clockText(nowMs()); };
  tick();
  const timer = setInterval(tick, 1000);
  let player = null;
  if (!live || !live.available || !live.path) {
    box.appendChild(el(`<div class="col center" style="position:absolute;inset:0;gap:28px">
      <svg viewBox="0 0 120 80" width="180" height="120" fill="none" stroke="#8A8F9C" stroke-width="3" stroke-linejoin="round"><rect x="4" y="4" width="112" height="72" rx="6"/><path d="M50 26l26 14-26 14z"/></svg>
      ${txt('No Local stream row in the Live Feeds tab.', 44, '', 'color:#B8BCC6;text-align:center')}</div>`));
  } else {
    player = livePlayer(box, live);
  }
  return {
    el: root,
    update(s) { const v = liveTitle(s); if (title.textContent !== v) title.textContent = v; },
    dispose() { clearInterval(timer); if (player) player.stop(); },
  };
}

/**
 * The sanctuary stream from MediaMTX on the vMix PC. Muted (Mute Live checked): WebRTC, about a
 * second behind. With sound: HLS, a few seconds behind, because WebRTC can't carry vMix's AAC audio.
 * Like the TVs: a "Connecting" cover until the picture moves, a retry 5 seconds after a failure,
 * and a reconnect when the picture hasn't moved for 10 seconds. Two failures in a row try the other way.
 */
function livePlayer(box, live) {
  const video = document.createElement('video');
  video.playsInline = true; video.autoplay = true; video.muted = !!live.muted;
  Object.assign(video.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain', background: '#000' });
  const cover = el(`<div class="col center" style="position:absolute;inset:0;background:#1F242C">${txt('Connecting to the sanctuary feed…', 30, '', 'color:#AAB2BD')}</div>`);
  box.append(video, cover);

  const host = live.host || location.hostname;
  // Testing: ?liveVia=webrtc or ?liveVia=hls picks the way to start with.
  let method = ['webrtc', 'hls'].includes(params.get('liveVia')) ? params.get('liveVia') : live.muted ? 'webrtc' : 'hls';
  let failures = 0;
  let stopped = false;
  let pc = null, hls = null, retry = 0;
  let lastTime = -1, stuckSince = Date.now(), everPlayed = false;
  let waiting = false;   // between a failure and the retry

  function teardown() {
    if (pc) { try { pc.close(); } catch (e) {} pc = null; }
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    video.pause();
    video.srcObject = null;
    video.removeAttribute('src');
    try { video.load(); } catch (e) {}
  }

  function fail(why) {
    if (stopped || waiting) return;
    console.log('Live:', method, why);
    waiting = true;
    teardown();
    cover.hidden = false;
    failures++;
    if (failures >= 2) { method = method === 'webrtc' ? 'hls' : 'webrtc'; failures = 0; }
    clearTimeout(retry);
    retry = setTimeout(connect, 5000);
  }

  async function connectWebRTC() {
    pc = new RTCPeerConnection();
    const mine = pc;
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    const stream = new MediaStream();
    video.srcObject = stream;
    pc.ontrack = e => stream.addTrack(e.track);
    pc.onconnectionstatechange = () => {
      if (pc === mine && ['failed', 'closed'].includes(mine.connectionState)) fail('WebRTC ' + mine.connectionState);
    };
    await pc.setLocalDescription(await pc.createOffer());
    // Send the offer with all its candidates (no trickle).
    await new Promise(res => {
      if (mine.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, 2000);
      mine.addEventListener('icegatheringstatechange', () => { if (mine.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
    const r = await fetch('api/whep', { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: mine.localDescription.sdp });
    if (r.status !== 201 && r.status !== 200) throw new Error('WHEP ' + r.status);
    if (pc !== mine) return;
    await mine.setRemoteDescription({ type: 'answer', sdp: await r.text() });
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.Hls) return res();
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('hls.js'));
      document.head.appendChild(s);
    });
  }

  async function connectHls() {
    const url = `http://${host}:8888/${live.path}/index.m3u8`;
    // hls.js wherever it runs (Chrome, Edge, Safari on a Mac). Some Chrome versions say they can play
    // HLS themselves and then fail, so the browser's own player is only for devices hls.js can't run on.
    await loadScript('hls.js').catch(() => {});
    if (!window.Hls || !window.Hls.isSupported()) {
      if (!video.canPlayType('application/vnd.apple.mpegurl')) throw new Error('HLS not supported');
      video.src = url;
    } else {
      hls = new window.Hls({ lowLatencyMode: true, liveSyncDurationCount: 2 });
      const mine = hls;
      hls.on(window.Hls.Events.ERROR, (_, d) => { if (d.fatal && hls === mine) fail('HLS ' + d.details); });
      hls.loadSource(url);
      hls.attachMedia(video);
    }
  }

  async function connect() {
    if (stopped) return;
    teardown();
    waiting = false;
    lastTime = -1; stuckSince = Date.now(); everPlayed = false;
    try {
      if (method === 'webrtc') await connectWebRTC(); else await connectHls();
      const p = video.play();
      if (p) p.catch(() => {
        // The browser wouldn't start sound without a click: play muted until someone clicks.
        if (!video.muted) { video.muted = true; video.play().catch(() => {}); note('Click the page to turn the sound on', 8000); }
      });
    } catch (e) {
      fail(e.message || String(e));
    }
  }

  // Sound back on after a click, if the Sheet didn't ask for it muted.
  const unmute = () => { if (!live.muted && video.muted) { video.muted = false; video.play().catch(() => {}); } };
  document.addEventListener('click', unmute);

  const watch = setInterval(() => {
    if (stopped || waiting) return;
    const t = video.currentTime;
    if (video.readyState >= 2 && t > 0 && t !== lastTime) {
      lastTime = t; stuckSince = Date.now();
      if (!everPlayed) { everPlayed = true; failures = 0; }
      cover.hidden = true;
    } else if (Date.now() - stuckSince >= 10000) {
      fail('No new picture for 10 s');
    }
  }, 1000);

  connect();
  return {
    stop() { stopped = true; clearInterval(watch); clearTimeout(retry); document.removeEventListener('click', unmute); teardown(); },
  };
}

// ---- Device picker ------------------------------------------------------------

function pickerScreen(devices) {
  // The Event Screen row first: it's the usual choice.
  const list = [...devices].sort((a, b) => (/^event screen$/i.test(a.name) ? 0 : 1) - (/^event screen$/i.test(b.name) ? 0 : 1));
  const root = el(`<div class="panel">
    ${txt('Which screen is this?', 64, 'mont bold')}
    <div style="height:16px"></div>
    ${txt('Click one, or use the arrow keys and Enter. Change it later with Ctrl+D (Cmd+D on a Mac).', 30, '', 'color:#ccc')}
    <div class="pick"></div></div>`);
  const pick = root.querySelector('.pick');
  list.forEach(d => {
    const current = device && d.name.toLowerCase() === device.toLowerCase();
    const b = el(`<button>${txt(d.name + (current ? '  (current)' : ''), 40, 'semi')}${txt(d.detail, 26, '', 'color:#bbb')}</button>`);
    b.onclick = e => { e.stopPropagation(); choose(d.name); };
    pick.appendChild(b);
  });
  setTimeout(() => {
    const i = Math.max(0, list.findIndex(d => d.name.toLowerCase() === (device || 'event screen').toLowerCase()));
    if (pick.children[i]) pick.children[i].focus();
  }, 0);
  return { el: root };
}

function choose(name) {
  device = name;
  store.set('device', name);
  picking = false;
  manual = null;
  lastKey = null;
  if (params.has('device') || params.has('pick')) {
    params.set('device', name); params.delete('pick');
    history.replaceState(null, '', '?' + params);
  }
  poll();
}

// ---- Keyboard and mouse ---------------------------------------------------------

function setManual(mode) {
  manual = mode;
  note(mode ? `Manual: ${mode} (F4 returns to the schedule)` : 'Following the schedule');
  render();
}

function toggleFullscreen() {
  const d = document;
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  else {
    const e = d.documentElement;
    const r = (e.requestFullscreen || e.webkitRequestFullscreen).call(e);
    if (r && r.catch) r.catch(() => {});
  }
}

addEventListener('keydown', e => {
  if (picking) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...document.querySelectorAll('.pick button')];
      const i = items.indexOf(document.activeElement);
      const n = items[Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n) { n.focus(); n.scrollIntoView({ block: 'nearest' }); }
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && device) { picking = false; render(); return; }
    return;
  }
  // Macs need fn for F1-F4, so the number keys 1-4 work too.
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && (k === 'd' || k === 'D')) { e.preventDefault(); picking = true; render(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === 'F1' || k === '1') { e.preventDefault(); setManual('Signage'); }
  else if (k === 'F2' || k === '2') { e.preventDefault(); setManual('Fullscreen'); }
  else if (k === 'F3' || k === '3') { e.preventDefault(); setManual('Live'); }
  else if (k === 'F4' || k === '4' || k === '0') { e.preventDefault(); setManual(null); }
  else if (k === 'f' || k === 'F') { toggleFullscreen(); }
});

// A click on the page goes full screen (browsers only allow it after a click or key press).
addEventListener('click', () => {
  if (!picking && !(document.fullscreenElement || document.webkitFullscreenElement)) toggleFullscreen();
});

// Hide the mouse pointer after 3 seconds without movement.
let idleTimer = 0;
function wake() { document.body.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => document.body.classList.add('idle'), 3000); }
addEventListener('mousemove', wake);
wake();

// ---- Start ------------------------------------------------------------------------

poll();
setInterval(poll, POLL_MS);
setTimeout(() => {
  if (!picking && !(document.fullscreenElement || document.webkitFullscreenElement)) note('Click anywhere or press F for full screen', 8000);
}, 1500);
