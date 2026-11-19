// Runs every dashboard test. From the project folder:  node graceview-tv-lab/tests/run-tests.js
// Each suite prints PASS/FAIL lines; this prints one line per suite and exits 1 if anything failed.
// Run it before pasting changed files into Apps Script.
//
//   Server suites  run Code.gs in a stand-in for Apps Script (node X.js Code.gs)
//   Page suites    run the dashboard and screen scripts (node X.js Screen.js Panel.js)
//   loadertest     the website loader (site/loader.html)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const here = __dirname, lab = path.join(here, '..'), as = path.join(lab, 'apps-script');

// The page suites read the <script> blocks of the .html files as plain .js.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-tests-'));
function extract(name) {
  const h = fs.readFileSync(path.join(as, name + '.html'), 'utf8');
  const out = path.join(tmp, name + '.js');
  fs.writeFileSync(out, [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n'));
  return out;
}
const code = path.join(as, 'Code.gs'), panelHtml = path.join(as, 'Panel.html');
const screenJs = extract('Screen'), panelJs = extract('Panel');

const server = ['authtest', 'foldertest', 'pairtest', 'labapitest', 'launchtest', 'grtest', 'devtest', 'themedeltest', 'duptest',
  'delfoldertest', 'caltest2', 'churchtest', 'logowifitest', 'cachetest', 'limitedtest', 'sheetsetuptest', 'livetest', 'videotest'];
const pages = ['themepage', 'nowpage', 'launchpage', 'grpage', 'devpage', 'themedelpage', 'duppage', 'calpage', 'capage',
  'churchpage', 'logopage', 'navpage', 'sitepage'];
const runs = server.map(s => [s, [code]])
  .concat([['sitetest', [code, panelHtml]]])
  .concat(pages.map(p => [p, [screenJs, panelJs]]))
  .concat([['loadertest', [path.join(lab, 'site', 'loader.html')]]]);

let failed = 0, passed = 0;
for (const [name, args] of runs) {
  const r = cp.spawnSync(process.execPath, [path.join(here, name + '.js')].concat(args), { encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const p = (out.match(/^PASS /gm) || []).length;
  const bad = out.split('\n').filter(l => /^FAIL |Error/.test(l));
  passed += p;
  if (bad.length || r.status !== 0 || p === 0) {
    failed++;
    console.log('FAIL ' + name + ' (' + p + ' passed)');
    bad.slice(0, 5).forEach(l => console.log('     ' + l));
  } else {
    console.log('ok   ' + name + ' (' + p + ')');
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? '\n' + failed + ' suite(s) failed.' : '\nAll ' + runs.length + ' suites passed (' + passed + ' checks).');
process.exit(failed ? 1 : 0);
