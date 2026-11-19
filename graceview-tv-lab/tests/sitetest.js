// The dashboard at the church's own address: the API whitelist, the page for the loader, invite links.
const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
let settings=[['Setting','Value'],['Church Name','Graceview Baptist Church']];
const ctx={console,
  Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},computeDigest:(a,s)=>[...crypto.createHash(a).update(String(s)).digest()],
    base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),getUuid:()=>crypto.randomUUID(),formatDate:()=>'2026-11-18 10:00'},
  CacheService:{getScriptCache:()=>({get:()=>null,put(){},remove(){}})},
  LockService:{getScriptLock:()=>({waitLock(){},tryLock:()=>true,releaseLock(){}})},
  ScriptApp:{getService:()=>({getUrl:()=>'https://script.google.com/macros/s/EXEC/exec'})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({text:t,setMimeType(){return this;}})},
  HtmlService:{createTemplateFromFile:n=>({evaluate(){const self=this;return {getContent:()=>'<html>'+n+' params='+self.params+'</html>'};}})},
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);ctx.setupSheet_=()=>[];ctx.setupSheet=()=>[];
const sheet={getDataRange:()=>({getDisplayValues:()=>settings.map(r=>r.slice())}),getRange:(r,c)=>({setValue:v=>{settings[r-1][c-1]=String(v);}}),appendRow:r=>settings.push(r.map(String))};
ctx.sheet_=()=>sheet;ctx.tabSheet_=()=>sheet;
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
const post=b=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(b)}}).text);

// Every function the panel calls is on the list, and every listed one exists.
const panel=fs.readFileSync(process.argv[3],'utf8');
const called=new Set([...panel.matchAll(/call\('([a-zA-Z]+)'/g)].map(m=>m[1]).concat([...panel.matchAll(/\.(getState|signIn|signOut|inviteInfo|acceptInvite|findPlace|checkCalendars|themeUsage|uploadSlide|setupChurch)\(/g)].map(m=>m[1])));
const api=ctx.panelApi_();
const missing=[...called].filter(f=>!(f in api)&&f!=='setupChurch');
ok('every call the dashboard makes is allowed ('+called.size+' names)', missing.length===0||console.log('  missing:',missing.join(', ')));
ok('every allowed name is a real function', Object.keys(api).every(k=>typeof api[k]==='function'));
ok('first-time setup is not reachable from the website (needs the Google link)', !('setupChurch' in api));

ctx.getState=function(iso,token){return {seen:[iso,token]};};
let r=post({action:'panel',fn:'getState',args:['','TOKEN1']});
ok('a call runs and returns its result', r.ok===true&&r.result.seen[1]==='TOKEN1');
ok('arguments arrive in order, token last', JSON.stringify(post({action:'panel',fn:'getState',args:['2026-11-22T10:45','T2']}).result.seen)==='["2026-11-22T10:45","T2"]');
r=post({action:'panel',fn:'doGet',args:[]});ok('functions not on the list are refused', r.ok===false&&r.error==='Unknown call.');
r=post({action:'panel',fn:'toString',args:[]});ok('built-in object names are refused', r.ok===false&&r.error==='Unknown call.');
r=post({action:'panel',fn:'deleteRow_',args:[]});ok('private helpers are refused', r.ok===false);
r=post({action:'panel',fn:'getState',args:'not a list'});ok('bad arguments do not crash it', typeof r.ok==='boolean');
ctx.signIn=function(){throw new Error('Wrong email or password.');};
r=post({action:'panel',fn:'signIn',args:['a@b.c','x']});ok('errors come back as messages the page shows', r.ok===false&&r.error==='Wrong email or password.');

const page=JSON.parse(ctx.doGet({parameter:{app:'panel',invite:'INV123'}}).text);
ok('the loader gets the dashboard page as JSON', /<html>Panel/.test(page.html)&&page.title==='Graceview Baptist Church Signage');
const params=JSON.parse(page.html.match(/params=(.*)<\/html>/)[1].replace(/\\u003c/g,'<'));
ok('the page knows where to send calls, and the invite is passed on', params.exec==='https://script.google.com/macros/s/EXEC/exec'&&params.site===true&&params.invite==='INV123'&&!('app' in params));
const evil=JSON.parse(ctx.doGet({parameter:{app:'panel',x:'</script><script>alert(1)</script>'}}).text);
ok('nothing in the address can break out of the page data', evil.html.indexOf('</script><script>')<0);

ok('invite links use Google’s link when no address is set', ctx.dashboardLink_()==='https://script.google.com/macros/s/EXEC/exec');
settings.push(['Dashboard Address','https://www.graceview.org/signage']);vm.runInContext('settingsCache_=null;tabMemo_={}',ctx);
ok('invite links use the church’s address once set', ctx.dashboardLink_()==='https://www.graceview.org/signage');
settings[settings.length-1][1]='javascript:alert(1)';vm.runInContext('settingsCache_=null;tabMemo_={}',ctx);
ok('a bad address is ignored', ctx.dashboardLink_()==='https://script.google.com/macros/s/EXEC/exec');
const tvp=JSON.parse(ctx.doGet({parameter:{app:'panel',tv:'LOBBY',at:'2026-11-22T10:45'}}).text);
ok('a full-size preview through the website gets the screen page', /<html>Tv/.test(tvp.html)&&tvp.title==='Preview: LOBBY');
const tvParams=JSON.parse(tvp.html.match(/params=(.*)<\/html>/)[1].replace(/\u003c/g,'<'));
ok('with the screen, the time and where to send calls', tvParams.tv==='LOBBY'&&tvParams.at==='2026-11-22T10:45'&&tvParams.site===true&&!!tvParams.exec);
ok('and the preview call is allowed', 'previewTv' in ctx.panelApi_());
