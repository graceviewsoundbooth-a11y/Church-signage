const vm=require('vm'),fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const ok=(l,c)=>console.log((c?'PASS ':'FAIL ')+l);
async function run(store,search,page){
  const reqs=[],written=[];
  const ls={getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=v;}};
  const ctx={JSON,Promise,location:{search},localStorage:ls,
    document:{getElementById:()=>({innerHTML:''}),open(){},write:h=>written.push(h),close(){},title:''},
    fetch:(u,o)=>{reqs.push({u,o});return Promise.resolve({ok:true,json:()=>Promise.resolve(o&&o.method==='POST'?{ok:true,result:{}}:page)});}};
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);
  for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));
  return {reqs,written,ctx};
}
(async()=>{
  const store={'gvlab-token':'TOK'};
  let r=await run(store,'',{html:'<p>v1</p>',title:'T'});
  ok('asks for the page and the state at the same time', r.reqs.length===2&&r.reqs.some(q=>q.o&&q.o.method==='POST'&&JSON.parse(q.o.body).args[1]==='TOK'));
  ok('no Google accounts sent on either', r.reqs.every(q=>q.o.credentials==='omit'));
  ok('first visit shows the page and keeps a copy', r.written[0]==='<p>v1</p>'&&JSON.parse(store['cs-dash-page']).html==='<p>v1</p>');
  ok('the head start is left for the page', r.ctx.__csFirst&&r.ctx.__csFirst.token==='TOK');
  r=await run(store,'',{html:'<p>v2</p>',title:'T'});
  ok('next visit shows the kept copy at once', r.written.length===1&&r.written[0]==='<p>v1</p>');
  ok('and keeps the newer page for next time', JSON.parse(store['cs-dash-page']).html==='<p>v2</p>');
  r=await run(store,'?invite=ABC',{html:'<p>inv</p>',title:'T'});
  ok('an invite link always loads fresh, and isn’t kept', r.written[0]==='<p>inv</p>'&&JSON.parse(store['cs-dash-page']).html==='<p>v2</p>'&&r.reqs.some(q=>/invite=ABC/.test(q.u)));
})();
