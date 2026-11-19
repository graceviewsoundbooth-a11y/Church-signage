const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
const fetched=[];
const ctx={console,
  Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},
    computeDigest:(a,s)=>[...crypto.createHash(a).update(String(s),'utf8').digest()],
    base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),getUuid:()=>crypto.randomUUID(),
    formatDate:(d,tz,f)=>f==='yyyy-MM-dd'?'2026-11-16':f==='HH:mm'?'10:00':'2026-11-16 10:00'},
  CacheService:{getScriptCache:()=>({get:()=>null,put(){},remove(){}})}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
const ev=(ymd,mins,title,allDay)=>({ymd,mins,endMins:mins+60,allDay:!!allDay,title});
const feeds={
  'https://school/cal.ics':{ok:true,events:[ev('2026-11-17',540,'Chapel')],error:''},
  'https://church/cal.ics':{ok:true,events:[ev('2026-11-18',1080,'Bible Study'),ev('2026-11-17',540,'Chapel'),ev('2026-11-19',600,'Prayer'),ev('2026-11-20',600,'Choir'),ev('2026-11-21',600,'Private Event')],error:''},
  'https://busy/cal.ics':{ok:true,events:[ev('2026-11-17',600,'A'),ev('2026-11-18',600,'B'),ev('2026-11-19',600,'C'),ev('2026-11-20',600,'D'),ev('2026-11-21',600,'E')],error:''},
  'https://broken/cal.ics':{ok:false,events:[],error:'Didn\'t return a calendar (HTTP 404).'},
  'https://past/cal.ics':{ok:true,events:[ev('2026-11-16',480,'Earlier today'),ev('2026-11-17',600,'Tomorrow')],error:''},
};
ctx.fetchCalendar_=(url)=>{fetched.push(url);return feeds[url]||{ok:false,events:[],error:'unknown'};};
const t={ymd:'2026-11-16',mins:600};
const th=(cal,hide)=>({Theme:'School',Calendar:cal,'Calendar Hide':hide||''});
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);

fetched.length=0;let r=ctx.calendar_(th('https://busy/cal.ics; https://church/cal.ics'),t);
ok('main with 3+ events: fallback is not read, shows up to 4', r.events.map(e=>e.title).join()==='A,B,C,D' && fetched.join()==='https://busy/cal.ics' && r.sources[1].state==='unused' && !r.sources[1].used);
fetched.length=0;r=ctx.calendar_(th('https://school/cal.ics; https://church/cal.ics','Private Event'),t);
ok('thin main: the fallback tops up to 4 in time order, each event once, hide list applied', r.events.map(e=>e.title).join()==='Chapel,Bible Study,Prayer,Choir' && r.sources[0].used && r.sources[1].used && r.sources[1].count===4);
r=ctx.calendar_(th('https://school/cal.ics; https://broken/cal.ics; https://church/cal.ics'),t);
ok('a broken fallback is skipped and the next one fills in', r.events.length===4 && r.sources[1].state==='error' && r.sources[2].used && r.errors.length===1 && /^Fallback 1: /.test(r.errors[0]));
r=ctx.calendar_(th('https://broken/cal.ics; https://church/cal.ics'),t);
ok('a broken main calendar: the fallback still fills This Week', r.events.length===4 && r.sources[0].state==='error' && r.sources[1].used && /^Main calendar: /.test(r.errors[0]));
fetched.length=0;r=ctx.calendar_(th('https://busy/cal.ics; https://church/cal.ics'),t,true);
ok('Check all reads every calendar but This Week is the same', fetched.length===2 && r.events.map(e=>e.title).join()==='A,B,C,D' && r.sources[1].state==='loaded' && !r.sources[1].used);
r=ctx.calendar_(th('https://school/cal.ics; not a link'),t);
ok('a non-link entry is flagged, not fetched', r.sources[1].state==='invalid' && r.errors.some(e=>/Fallback 1: Isn't a webcal/.test(e)));
r=ctx.calendar_(th('https://past/cal.ics'),t);
ok('events already over today are left out', r.events.map(e=>e.title).join()==='Tomorrow');
ok('no calendar: empty, no sources', ctx.calendar_(th(''),t).sources.length===0);
ok('TVs get every valid calendar in order, Google IDs as iCal links', ctx.tvCalendar_('webcal://school/x.ics; bad entry; abc123@group.calendar.google.com')==='https://school/x.ics; https://calendar.google.com/calendar/ical/abc123%40group.calendar.google.com/public/basic.ics');
