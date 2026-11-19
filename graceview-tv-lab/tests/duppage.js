const vm=require('vm'),fs=require('fs');const noop=()=>{};
const el=()=>({className:'',style:{},innerHTML:'',textContent:'',querySelectorAll:()=>[]});
const ctx={console,addEventListener:noop,setInterval:noop,setTimeout:(f)=>f(),clearTimeout:noop,localStorage:{getItem:()=>'',setItem:noop,removeItem:noop},
  document:{addEventListener:noop,getElementById:id=>id==='params'?{textContent:'{}'}:(['busy','toast','who','nav','main'].includes(id)?el():null),querySelector:()=>null,querySelectorAll:()=>[]},
  google:{script:{run:new Proxy({},{get:(t,k)=>k.startsWith('with')?()=>ctx.google.script.run:noop})}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8')+'\n;\n'+fs.readFileSync(process.argv[3],'utf8'),ctx);
vm.runInContext(`
view='themes';
S={override:{},me:{name:'Pat',role:'Owner',themes:['ALL']},perms:['theme'],t:{ymd:'2026-11-16',mins:600,today:'2026-11-16'},weather:null,fallbackTheme:'Church',
 themes:[{Theme:'Church','Display Name':'Graceview Baptist Church',Main:'#CF2020',Accent:'#B50606','Main Text':'#FFFFFF','Accent Text':'#FFFFFF'}],themeObjs:[],slidesByTheme:{},eventsByTheme:{},calStatus:{},folders:{}};
var ok=function(l,c){console.log((c?'PASS ':'FAIL ')+l);};
themeForm=null;var h=vThemes();
ok('every theme (even the fallback) offers Duplicate', h.indexOf('data-act="dupOpen" data-t="Church"')>=0);
ok('no rename box any more', h.indexOf('thRename')<0 && h.indexOf('themeRename')<0);
ACT.dupOpen({dataset:{t:'Church'}});h=vThemes();
ok('the form is prefilled from the original', h.indexOf('id="dupDisplay" value="Graceview Baptist Church"')>=0 && h.indexOf('id="dupMain" value="#CF2020"')>=0 && h.indexOf('value="new" checked')>=0);
ok('it shows a color sample and all three slide choices', h.indexOf('id="dupSwatch"')>=0 && h.indexOf('value="copy"')>=0 && h.indexOf('value="share"')>=0);
ACT.dupGo();ok('a missing name is caught before saving', themeDup!==null);
ACT.dupCancel();ok('cancel closes it', themeDup===null);
S.me.role='Limited';h=vThemes();ok('a Limited user cannot duplicate', h.indexOf('dupOpen')<0);
`,ctx);
