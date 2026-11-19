const vm=require('vm'),fs=require('fs');const noop=()=>{};
const el=()=>({className:'',style:{},innerHTML:'',textContent:'',querySelectorAll:()=>[]});
const ctx={console,addEventListener:noop,setInterval:noop,setTimeout:noop,clearTimeout:noop,localStorage:{getItem:()=>'',setItem:noop,removeItem:noop},
  document:{addEventListener:noop,getElementById:id=>id==='params'?{textContent:'{}'}:(['busy','toast','who','nav','main'].includes(id)?el():null),querySelectorAll:()=>[]},
  google:{script:{run:new Proxy({},{get:(t,k)=>k.startsWith('with')?()=>ctx.google.script.run:noop})}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8')+'\n;\n'+fs.readFileSync(process.argv[3],'utf8'),ctx);
vm.runInContext(`
var scr={device:{id:'LOBBY',name:'Lobby',profile:'Signage',wayfinding:true},mode:'Signage',message:'',endMins:null,
  theme:{name:'Church',display:'Graceview',main:'#CF2020',accent:'#B50606',wayL:[],wayR:[],qrLabel:'Info'},slides:[],events:[]};
S={me:{name:'Pat',role:'Owner',themes:['ALL']},perms:['override','schedule','theme','slides','activity','users'],url:'https://x/exec',
 t:{ymd:'2026-11-16',mins:600,today:'2026-11-16'},weather:null,conflicts:[],allThemes:['Church','School'],
 allDevices:[{id:'LOBBY',name:'Lobby',profile:'Signage'},{id:'COFFEE',name:'Coffee Spot',profile:'Signage'}],
 devices:[{id:'LOBBY',name:'Lobby',profile:'Signage',pairedAt:'2026-11-16 10:00',lastSeen:'2026-11-16 10:01',now:{mode:'Signage',label:'Weekly row 10',source:'Weekly'},screen:scr},
          {id:'COFFEE',name:'Coffee Spot',profile:'Signage',pairedAt:'',lastSeen:'',now:{mode:'Off',label:'Default',source:'Default'},screen:Object.assign({},scr,{mode:'Off'})}]};
var ok=function(l,c){console.log((c?'PASS ':'FAIL ')+l);};
var h=vNow();
ok('admin sees Pair a TV', h.indexOf('data-act="pairOpen"')>=0);
ok('paired card says online or offline', /Online|Offline/.test(h));
ok('unpaired card says so', h.indexOf('Not paired yet')>=0);
ok('cards offer Edit (Unpair lives in the editor)', h.indexOf('data-act="devEditOpen"')>=0&&h.indexOf('unpairAsk')<0);
ok('cards link to the full-size screen', h.indexOf('>Full size</a>')>=0 && h.indexOf('?tv=LOBBY')>=0);
pairForm={target:'__new'};h=vNow();
ok('pair form shows the screen link', h.indexOf('https://x/exec?screen')>=0);
ok('new-TV fields appear', h.indexOf('id="pairName"')>=0 && h.indexOf('id="pairProfile"')>=0);
pairForm={target:'LOBBY'};h=vNow();
ok('picking an existing TV hides new-TV fields and warns about replacing', h.indexOf('id="pairName"')<0 && h.indexOf('replaces its current screen')>=0);
S.me.role='Staff';S.perms=['override','slides','activity'];pairForm=null;h=vNow();
ok('staff sees no Pair or Unpair buttons', h.indexOf('pairOpen')<0 && h.indexOf('unpairAsk')<0);
`,ctx);
