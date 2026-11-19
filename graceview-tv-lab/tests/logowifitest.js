// Church logo and default guest Wi-Fi: theme fallbacks, TV rows, upload/replace/remove, permissions.
const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
let settings=[['Setting','Value'],['Church Name','Graceview'],['Slides Root Folder','https://drive.google.com/drive/folders/ROOTFOLDER0123456789']];
const files={},trashed=[];let n=0;
const mkFile=(name,parent)=>{const id='FILEID'+(++n)+'abcdefghijklmnopqrstu';files[id]={id,name,parent,shared:false};return {getId:()=>id,setSharing:()=>{files[id].shared=true;}};};
const ctx={console,
  Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},computeDigest:(a,s)=>[...crypto.createHash(a).update(String(s)).digest()],
    base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),base64Decode:b=>[...Buffer.from(b,'base64')],newBlob:(b,m,nm)=>({name:nm,mime:m}),
    formatDate:()=>'2026-11-18 10:00'},
  CacheService:{getScriptCache:()=>({get:()=>null,put(){},remove(){}})},
  LockService:{getScriptLock:()=>({waitLock(){},tryLock:()=>true,releaseLock(){}})},
  DriveApp:{Access:{ANYONE_WITH_LINK:1},Permission:{VIEW:1},
    getFolderById:id=>({getId:()=>id,createFile:b=>mkFile(b.name,id)}),
    getFileById:id=>{if(!files[id])throw new Error('gone');return {setTrashed:()=>trashed.push(id),getParents:()=>{let d=false;return {hasNext:()=>!d,next:()=>{d=true;return {getId:()=>files[id].parent};}};}};}},
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);
const sheet={getDataRange:()=>({getDisplayValues:()=>settings.map(r=>r.slice())}),getRange:(r,c)=>({setValue:v=>{settings[r-1][c-1]=String(v);}}),appendRow:r=>settings.push(r.map(String))};
ctx.sheet_=()=>sheet;ctx.tabSheet_=()=>sheet;let role='Owner';ctx.data_=()=>({});ctx.me_=()=>({role});ctx.log_=()=>{};
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
const own={Theme:'Church',Main:'#CF2020',Accent:'#B50606','Logo URL':'https://drive.google.com/file/d/THEMELOGO012345678901234/view','Wi-Fi Name':'Lobby-Guest','Wi-Fi Password':'pw1'};
const bare={Theme:'Renter',Main:'#18453B',Accent:'#68B1A1'};

let o=ctx.themeObj_(bare);ok('no church defaults: a bare theme has no logo or Wi-Fi', o.logo===''&&o.wifiName==='');
o=ctx.themeObj_(own);ok('a theme Drive logo becomes an image link browsers can show', o.logo==='https://drive.google.com/thumbnail?id=THEMELOGO012345678901234&sz=w1000');

const png=Buffer.from('fakepng').toString('base64');
let c=ctx.uploadChurchLogo('logo.png','image/png',png,'t');
const first=ctx.driveFileId_(c.logoLink);
ok('upload saves the logo in the slides root, shared by link', files[first]&&files[first].parent==='ROOTFOLDER0123456789'&&files[first].shared&&files[first].name==='Church logo.png');
ok('the setting holds its Drive link and screens get an image link', /\/file\/d\/FILEID1/.test(c.logoLink)&&/thumbnail\?id=FILEID1/.test(c.logo));
c=ctx.uploadChurchLogo('new.jpg','image/jpeg',png,'t');
ok('replacing trashes the old church logo', trashed.includes(first)&&/FILEID2/.test(c.logoLink));
ctx.saveChurchSettings({name:'Graceview',timeZone:'America/Chicago',lat:'',lon:'',wifiName:'Graceview-Guest',wifiPass:'welcome'},'t');

o=ctx.themeObj_(bare);ok('a theme with no logo uses the church logo', /thumbnail\?id=FILEID2/.test(o.logo));
ok('a theme with no Wi-Fi uses the church guest Wi-Fi', o.wifiName==='Graceview-Guest'&&o.wifiPass==='welcome');
o=ctx.themeObj_(own);ok("a theme's own logo and Wi-Fi win", /THEMELOGO/.test(o.logo)&&o.wifiName==='Lobby-Guest'&&o.wifiPass==='pw1');

const rows=ctx.toProductionBatch_({devices:[],themes:[bare,own],weekly:[],special:[],override:{},launchers:[]},{ymd:'2026-11-18',mins:600});
const themeRange=rows.valueRanges.map(r=>r.values).filter(v=>v.some(r=>r[0]==='Renter'&&r.length===13))[0];
const rr=themeRange.filter(r=>r[0]==='Renter')[0],rc=themeRange.filter(r=>r[0]==='Church')[0];
ok('TVs get the church logo (Drive link) and Wi-Fi for a bare theme', /\/file\/d\/FILEID2/.test(rr[4])&&rr[4]===rr[5]&&rr[10]==='Graceview-Guest'&&rr[11]==='welcome');
ok("TVs get a theme's own values unchanged", /THEMELOGO/.test(rc[4])&&rc[10]==='Lobby-Guest');
const sc=ctx.churchForScreens_();ok('screens and TVs get the church logo', /thumbnail/.test(sc.logo)&&/\/file\/d\//.test(sc.logoLink));
ok('the church Wi-Fi password is not in the screen settings', !('wifiPass' in sc));

ctx.saveChurchSettings({name:'Graceview',timeZone:'America/Chicago',lat:'',lon:'',wifiName:'',wifiPass:'leftover'},'t');
ok('clearing the Wi-Fi name clears the password too', ctx.church_().wifiPass==='');
const before=trashed.length;c=ctx.removeChurchLogo('t');
ok('remove clears the logo and trashes the file', c.logo===''&&trashed.length===before+1);
settings.push(['Church Logo','https://drive.google.com/file/d/SOMEONEELSESFILE012345678/view']);
ctx.removeChurchLogo('t');ok("a logo file that isn't ours is never trashed", !trashed.includes('SOMEONEELSESFILE012345678'));

const bad=(fn,re,l)=>{try{fn();ok(l,false);}catch(e){ok(l,re.test(e.message));}};
bad(()=>ctx.uploadChurchLogo('x.gif','image/gif',png,'t'),/PNG or JPG/,'a GIF is refused');
bad(()=>ctx.uploadChurchLogo('big.png','image/png',Buffer.alloc(6*1024*1024).toString('base64'),'t'),/over 5 MB/,'a logo over 5 MB is refused');
role='Staff';
bad(()=>ctx.uploadChurchLogo('logo.png','image/png',png,'t'),/Owner or an Admin/,'Staff cannot upload the church logo');
bad(()=>ctx.removeChurchLogo('t'),/Owner or an Admin/,'Staff cannot remove it');
