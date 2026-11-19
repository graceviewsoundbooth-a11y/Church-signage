const vm=require('vm'),fs=require('fs');const noop=()=>{};let listeners=[];
const el=()=>({className:'',style:{},innerHTML:'',textContent:'',querySelectorAll:()=>[]});
const ctx={console,addEventListener:noop,setInterval:noop,setTimeout:(f)=>f(),clearTimeout:noop,localStorage:{getItem:()=>'',setItem:noop,removeItem:noop},
  document:{addEventListener:(t,f)=>{if(t==='input')listeners.push(f)},getElementById:id=>id==='params'?{textContent:'{}'}:(['busy','toast','who','nav','main'].includes(id)?el():null),querySelector:()=>null,querySelectorAll:()=>[]},
  google:{script:{run:new Proxy({},{get:(t,k)=>k.startsWith('with')?()=>ctx.google.script.run:noop})}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2],'utf8')+'\n;\n'+fs.readFileSync(process.argv[3],'utf8'),ctx);
ctx.__fire=v=>listeners.forEach(f=>f({target:{value:v,dataset:{calsrc:'1'},closest:()=>null}}));
vm.runInContext(`
view='themes';S={override:{},me:{name:'Pat',role:'Owner',themes:['ALL']},perms:['theme'],t:{ymd:'2026-11-16',mins:600,today:'2026-11-16'},weather:null,fallbackTheme:'Church',
 themes:[{Theme:'School',Main:'#111111',Accent:'#222222',Calendar:'https://a/x.ics'}],themeObjs:[],slidesByTheme:{},eventsByTheme:{},calStatus:{},folders:{}};
var ok=function(l,c){console.log((c?'PASS ':'FAIL ')+l);};
themeForm=JSON.parse(JSON.stringify(S.themes[0]));vThemes();ACT.calAdd();
__fire('<style>a{b:c;d:e;f:g}</style>;more;stuff');
console.log(JSON.stringify(themeForm.Calendar));ok('a paste with ; stays in its one box', calList().length===2 && calList()[1]==='<style>a{b:c d:e f:g}</style> more stuff');
for(var i=0;i<10;i++)ACT.calAdd();console.log(calList().length);ok('adding stops at 8', calList().length===8);
themeForm.Calendar=new Array(1340).fill('x').join(';');ok('a cell with too many shows only 8', calList().length===8);
`,ctx);
