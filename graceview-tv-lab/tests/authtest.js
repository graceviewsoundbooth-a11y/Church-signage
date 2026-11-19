const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
const props=new Map(),cache=new Map();
let active='',effective='owner@example.com';
const settings={};const users=[];const log=[];
const ctx={console,
  Utilities:{DigestAlgorithm:{SHA_256:'sha256',MD5:'md5'},Charset:{UTF_8:'utf8'},
    computeDigest:(a,s)=>[...crypto.createHash(a).update(String(s),'utf8').digest()],
    base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),getUuid:()=>crypto.randomUUID(),
    formatDate:()=>'2026-11-16 12:00'},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.has(k)?props.get(k):null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
  CacheService:{getScriptCache:()=>({get:k=>cache.has(k)?cache.get(k):null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
  Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  ScriptApp:{getService:()=>({getUrl:()=>'https://script.google.com/macros/s/X/exec'})}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8'),ctx);ctx.setupSheet_=()=>[];ctx.setupSheet=()=>[];
// Stand-ins for the Sheet
ctx.settings_=()=>({...settings});
ctx.setSetting_=(k,v)=>{settings[k]=String(v).replace(/^'/,'');};
ctx.log_=(me,a,d)=>log.push(a);
ctx.data_=()=>({users:users.map((u,i)=>({...u,_row:i+2})),themes:[],devices:[]});
ctx.appendRow_=(sh,v)=>{users.push({Email:v[0],Name:v[1],Role:v[2],Themes:v[3],Devices:v[4],Status:v[5]});};
const COLS={2:'Name',6:'Status',9:'Last Sign-in'};
ctx.sheet_=()=>({getRange:(r,c,nr,nc)=>({setValue:v=>{users[r-2][COLS[c]]=String(v).replace(/^'/,'');},
  setValues:vv=>{const row=users[r-2];['Name','Role','Themes','Devices'].forEach((k,i)=>row[k]=vv[0][i]);}}),
  deleteRow:r=>users.splice(r-2,1)});
const me=(tok)=>ctx.me_(ctx.data_(),tok);
const ok=(label,cond)=>console.log((cond?'PASS ':'FAIL ')+label);
const throws=(fn)=>{try{fn();return '';}catch(e){return e.message;}};

// 1. Before setup
active='owner@example.com'; ok('owner sees Setup before setup', me('').state==='Setup');
active=''; ok('stranger sees NotReady before setup', me('').state==='NotReady');
ok('stranger cannot run setup', /signed in to the Google account/.test(throws(()=>ctx.setupChurch({church:'X',name:'Y',password:'longenough'}))));
// 2. Setup
active='owner@example.com';
ok('short password refused', /at least 8/.test(throws(()=>ctx.setupChurch({church:'Graceview',name:'Pat',password:'short'}))));
ctx.setupChurch({church:'Graceview',name:'Pat',password:'owner-pass-1'});
ok('owner recognized through Google', me('').role==='Owner' && me('').viaGoogle===true);
ok('setup cannot run twice', /already set up/.test(throws(()=>ctx.setupChurch({church:'X',name:'Y',password:'longenough'}))));
ok('no password stored in Settings', !JSON.stringify(settings).includes('owner-pass-1'));
// 3. Stranger after setup: THE important one
active=''; ok('stranger is NOT the owner (needs sign-in)', me('').state==='SignIn' && me('').role==='None');
ok('made-up token does nothing', me('abc123').state==='SignIn');
// 4. Owner by password
const ownerTok=ctx.signIn('Owner@Example.com','owner-pass-1'); ok('owner signs in with password', me(ownerTok).role==='Owner');
// 5. Invite flow
const res=ctx.saveUser({email:'Sam@Example.org',name:'Sam',role:'Staff'},ownerTok);
ok('invite link created', /\?invite=[a-f0-9]{64}$/.test(res.link));
const inv=res.link.split('invite=')[1];
ok('invite info shows email and role', ctx.inviteInfo(inv).email==='sam@example.org' && ctx.inviteInfo(inv).role==='Staff');
ok('invited person cannot sign in before accepting', /don't match/.test(throws(()=>ctx.signIn('sam@example.org','anything123'))));
const samTok=ctx.acceptInvite(inv,'Sam S','sam-pass-123');
ok('accepted invite signs them in as Staff', me(samTok).role==='Staff' && users[0].Status==='Active');
ok('invite link works only once', /already been used/.test(throws(()=>ctx.acceptInvite(inv,'x','another-pass'))));
ok('staff cannot manage people', /can't do that/.test(throws(()=>ctx.saveUser({email:'z@z.org',role:'Admin'},samTok))));
// 6. Wrong passwords and lockout
for(let i=0;i<5;i++) throws(()=>ctx.signIn('sam@example.org','wrong-pass'));
ok('locked after 5 wrong tries', /Too many tries/.test(throws(()=>ctx.signIn('sam@example.org','sam-pass-123'))));
cache.clear();
ok('right password works after the lock clears', !!ctx.signIn('sam@example.org','sam-pass-123'));
// 7. Limited role
const l=ctx.saveUser({email:'school@example.org',name:'School',role:'Limited',themes:['School'],devices:['Coffee Spot']},ownerTok);
const lTok=ctx.acceptInvite(l.link.split('invite=')[1],'School office','school-pass-1');
const lm=me(lTok); ok('limited user only gets their theme and TV', lm.role==='Limited' && lm.themes.join()==='School' && lm.devices.join()==='Coffee Spot');
ok('limited needs at least one theme', /at least one theme/.test(throws(()=>ctx.saveUser({email:'r@r.org',role:'Limited',themes:[]},ownerTok))));
// 8. Turn off, reinvite, remove
ctx.setUserActive('sam@example.org',false,ownerTok); ok('turned-off person is signed out at once', me(samTok).state==='SignIn');
ctx.setUserActive('sam@example.org',true,ownerTok); ok('turned back on works', me(samTok).role==='Staff');
const r2=ctx.reinviteUser('sam@example.org',ownerTok); const t2=ctx.acceptInvite(r2.link.split('invite=')[1],'Sam','new-pass-456');
ok('new link resets a forgotten password', !!ctx.signIn('sam@example.org','new-pass-456') && /don't match/.test(throws(()=>ctx.signIn('sam@example.org','sam-pass-123'))));
ctx.removeUser('sam@example.org',ownerTok); ok('removed person loses access', me(t2).state==='SignIn');
ok('cannot invite the owner email', /Owner's email/.test(throws(()=>ctx.saveUser({email:'owner@example.com',role:'Admin'},ownerTok))));
ctx.signOut(ownerTok); ok('sign out ends the session', me(ownerTok).state==='SignIn');
ok('no plain passwords anywhere in storage', ![...props.values()].some(v=>/owner-pass-1|sam-pass-123|new-pass-456|school-pass-1/.test(v)));
// Staff permissions
const staff={role:'Staff',themes:['ALL'],devices:['ALL']};
ok('staff can manage slides for any theme', ctx.can_(staff,'slides') && !throws(()=>ctx.need_(staff,'slides','Church')));
ok('staff still runs overrides', ctx.can_(staff,'override'));
ok('staff cannot edit themes', /can't do that/.test(throws(()=>ctx.need_(staff,'theme','Church'))));
ok('staff cannot edit the schedule', !ctx.can_(staff,'schedule'));
ok('staff cannot manage people', !ctx.can_(staff,'users'));
