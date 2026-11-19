const vm=require('vm'),fs=require('fs');const noop=()=>{};
const el=()=>({className:'',style:{},innerHTML:'',textContent:'',querySelectorAll:()=>[]});
const ctx={console,addEventListener:noop,setInterval:noop,setTimeout:(f)=>f(),clearTimeout:noop,localStorage:{getItem:()=>'',setItem:noop,removeItem:noop},
  document:{addEventListener:noop,getElementById:id=>id==='params'?{textContent:'{}'}:(['busy','toast','who','nav','main'].includes(id)?el():null),querySelector:()=>null,querySelectorAll:()=>[]},
  google:{script:{run:new Proxy({},{get:(t,k)=>k.startsWith('with')?()=>ctx.google.script.run:noop})}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8')+'\n;\n'+fs.readFileSync(process.argv[3],'utf8'),ctx);
vm.runInContext(`
view='themes';
var th=function(n){return {Theme:n,'Display Name':n,Main:'#CF2020',Accent:'#B50606','Main Text':'#FFFFFF','Accent Text':'#FFFFFF'};};
S={override:{},me:{name:'Pat',role:'Owner',themes:['ALL']},perms:['theme'],t:{ymd:'2026-11-16',mins:600,today:'2026-11-16'},weather:null,fallbackTheme:'Church',
 themes:[th('Church'),th('VBS')],themeObjs:[],slidesByTheme:{},eventsByTheme:{},calStatus:{},folders:{}};
var ok=function(l,c){console.log((c?'PASS ':'FAIL ')+l);};
themeForm=null;var h=vThemes();
ok('the fallback theme is marked in the list', h.indexOf('Church</b> <span class="chip">Fallback</span>')>=0 && h.indexOf('VBS</b> <span class="chip">Fallback')<0);
ok('the fallback theme explains why it cannot be deleted', h.indexOf('make another theme the fallback first')>=0 && h.indexOf('themeDelAsk')<0);
ACT.pickTheme({dataset:{t:'VBS'}});h=vThemes();
ok('another theme offers Make fallback and Delete', h.indexOf('data-act="themeFallback" data-t="VBS"')>=0 && h.indexOf('data-act="themeDelAsk" data-t="VBS"')>=0);
themeDel={theme:'VBS',usage:{fallback:'Church',devices:['Coffee Spot'],scheduleRows:2,override:true,presets:['VBS Welcome'],users:['Camp']}};h=vThemes();
ok('delete shows what will change before confirming', h.indexOf('1 TV (Coffee Spot) will switch to <b>Church</b>')>=0 && h.indexOf('2 schedule rows')>=0 && h.indexOf('Camp will lose access')>=0 && h.indexOf('data-act="themeDelGo"')>=0);
themeDel={theme:'VBS',usage:{fallback:'Church',devices:[],scheduleRows:0,override:false,presets:[],users:[]}};h=vThemes();
ok('an unused theme says nothing uses it', h.indexOf('Nothing uses it.')>=0);
S.me.role='Limited';themeDel=null;h=vThemes();
ok('a Limited user gets no fallback or delete controls', h.indexOf('themeFallback')<0 && h.indexOf('themeDelAsk')<0);
`,ctx);
