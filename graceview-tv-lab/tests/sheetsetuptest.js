// A new church's blank Sheet: the app adds every tab it needs, and never touches existing ones.
const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
function makeBook(initial){
  const sheets=[];
  const mk=(name,data)=>{
    const s={name,data:data||[],frozen:0,checks:{},rules:{},formats:{},bold:[],
      getName:()=>s.name, getLastRow:()=>s.data.filter(r=>r.some(c=>c!==''&&c!==undefined)).length,
      getLastColumn:()=>Math.max(0,...s.data.map(r=>r.length)),
      setFrozenRows:n=>{s.frozen=n;},
      getDataRange:()=>({getDisplayValues:()=>s.data.map(r=>r.map(c=>c===true?'TRUE':c===false?'FALSE':String(c==null?'':c)))}),
      getRange:(r,c,nr,nc)=>{nr=nr||1;nc=nc||1;const rg={
        setValues:v=>{v.forEach((row,i)=>row.forEach((x,j)=>{while(s.data.length<r+i)s.data.push([]);s.data[r-1+i][c-1+j]=x;}));return rg;},
        setValue:x=>{while(s.data.length<r)s.data.push([]);s.data[r-1][c-1]=x;return rg;},
        setNumberFormat:f=>{s.formats[c]=f;return rg;}, insertCheckboxes:()=>{s.checks[c]=nr;return rg;},
        setDataValidation:v=>{s.rules[c]=v;return rg;}, setFontWeight:w=>{s.bold.push(r);return rg;},
        getDisplayValues:()=>s.data.slice(r-1,r-1+nr).map(x=>x.slice(c-1,c-1+nc).map(String))};return rg;},
      appendRow:row=>s.data.push(row), deleteRow:r=>s.data.splice(r-1,1)};
    return s;};
  Object.keys(initial).forEach(n=>sheets.push(mk(n,initial[n])));
  return {sheets,getSheets:()=>sheets.slice(),getSheetByName:n=>sheets.find(s=>s.name===n)||null,
    insertSheet:n=>{const s=mk(n);sheets.push(s);return s;},deleteSheet:s=>sheets.splice(sheets.indexOf(s),1)};
}
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
function load(book){
  const store=new Map();
  const ctx={console,
    SpreadsheetApp:{getActive:()=>book,flush(){},newDataValidation:()=>{const b={requireValueInRange:(rg)=>{b.rg=rg;return b;},setAllowInvalid:()=>b,build:()=>({list:b.rg})};return b;}},
    CacheService:{getScriptCache:()=>({get:k=>store.get(k)||null,getAll:ks=>{const o={};ks.forEach(k=>{if(store.has(k))o[k]=store.get(k);});return o;},put:(k,v)=>store.set(k,v),remove:k=>store.delete(k)})},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){},tryLock:()=>true})},
    PropertiesService:{getScriptProperties:()=>{const p={};return {getProperties:()=>p,getProperty:k=>p[k]||null,setProperty:(k,v)=>{p[k]=v;},deleteProperty:k=>{delete p[k];}};}},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},computeDigest:(a,s)=>[...crypto.createHash(a).update(String(s)).digest()],
      base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),getUuid:()=>crypto.randomUUID(),formatDate:()=>'2026-11-19 10:00'},
    Session:{getActiveUser:()=>({getEmail:()=>'owner@newchurch.org'}),getEffectiveUser:()=>({getEmail:()=>'owner@newchurch.org'})},
    ScriptApp:{getService:()=>({getUrl:()=>'https://x/exec'})},
  };
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
  return ctx;
}

// 1. A brand-new blank Sheet.
let book=makeBook({Sheet1:[]});let ctx=load(book);
const made=ctx.setupSheet();
const names=book.sheets.map(s=>s.name);
ok('adds all 12 tabs to a blank Sheet', made.length===12&&['Settings','Override','Weekly','Special Dates','Devices','Themes','Launchers','Green Room','Presets','Users','Activity','Lists'].every(n=>names.includes(n)));
ok('removes the empty Sheet1', !names.includes('Sheet1'));
const g=n=>book.getSheetByName(n);
ok('headings match the lab Sheet (Devices)', g('Devices').data[0].join('|')==='Device ID|Name|Location|Profile|Hardware|Default Theme|Default Mode|Mute Live|Wayfinding|Last Seen|App Version|Now Showing|Paired At|Paired By|Launcher|IP Address');
ok('headings match (Themes)', g('Themes').data[0].length===16&&g('Themes').data[0][13]==='Slides Folder');
ok('every heading row is frozen and bold', book.sheets.every(s=>s.frozen===1&&s.bold.includes(1)));
ok('checkboxes on Enabled, Active, Mute Live, Wayfinding', g('Weekly').checks[1]&&g('Special Dates').checks[1]&&g('Override').checks[1]&&g('Devices').checks[8]&&g('Devices').checks[9]);
ok('times and dates stay as text', g('Weekly').formats[3]==='@'&&g('Weekly').formats[4]==='@'&&g('Special Dates').formats[3]==='@');
ok('Mode, Day and Profile have dropdowns from the Lists tab', g('Weekly').rules[6]&&g('Weekly').rules[2]&&g('Devices').rules[4]);
ok('Lists has every mode and day', g('Lists').data.map(r=>r[0]).includes('Live Option')&&g('Lists').data.map(r=>r[1]).includes('Weekends'));
ok('a starter Church theme', g('Themes').data[1][0]==='Church'&&g('Themes').data[1][2]==='#333333');
ok('two override presets with no church name in them', g('Presets').data.length===3&&!/graceview/i.test(JSON.stringify(g('Presets').data)));
ok('Green Room settings and the mic table heading', g('Green Room').data[10][0]==='Mic Label'&&g('Green Room').data[2][1]==='Position name');
ok('running it again changes nothing', ctx.setupSheet().length===0&&book.sheets.length===12);

// The app reads it.
const d=ctx.data_();
ok('the app reads the new Sheet', d.themes.length===1&&d.devices.length===0&&d.presets.length===2&&d.weekly.length===0);
ok('fallback theme is Church', ctx.fallbackTheme_(d)==='Church');
ok('before setup, the owner sees the setup page', ctx.me_(null,'').state==='Setup');

// First-time setup on it.
ctx.setupChurch=ctx.setupChurch; // real one
ctx.ensureThemeFolder_=()=>'https://drive.google.com/drive/folders/X';ctx.log_=()=>{};
ctx.setupChurch({church:'Hope Community Church',name:'Pat',password:'longenough1'});
const st=ctx.settings_();
ok('setup records the church and owner', st['Church Name']==='Hope Community Church'&&st['Owner Email']==='owner@newchurch.org');
ok('the starter theme shows the church name', g('Themes').data[1][1]==='Hope Community Church');

// 2. Graceview's Sheet already has every tab: nothing changes.
const full={};['Settings','Override','Weekly','Special Dates','Devices','Themes','Launchers','Green Room','Presets','Users','Activity','Lists'].forEach(n=>full[n]=[['x']]);
full.Themes=[['Theme'],['Church']];
book=makeBook(full);ctx=load(book);
const before=JSON.stringify(book.sheets.map(s=>s.data));
ok('an existing Sheet is left exactly as it is', ctx.setupSheet().length===0&&JSON.stringify(book.sheets.map(s=>s.data))===before);

// 3. A Sheet missing just one tab gets only that one.
delete full.Launchers;book=makeBook(full);ctx=load(book);
const m=ctx.setupSheet();
ok('only the missing tab is added', m.length===1&&m[0]==='Launchers'&&book.getSheetByName('Themes').data.length===2);
