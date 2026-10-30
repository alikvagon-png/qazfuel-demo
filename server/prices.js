'use strict';
const {C}=require('./security');
const SOURCES={ehai:{name:'Ехай',url:'https://eh-ai.ru/assets/prices.json',docs:'https://eh-ai.ru/api/'},wherefuel:{name:'ГдеТопливо',url:'https://wherefuel.ru/api/stations?bbox=37.3,55.5,37.9,55.9',docs:'https://wherefuel.ru/for-business'}};
const REGIONS={moscow:'Москва',moscow_oblast:'Московская область'};
async function getJSON(url,fetcher=fetch){const r=await fetcher(url,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json','User-Agent':'QAZFUEL-V3-preview/0.2'}});if(!r.ok)throw Error('upstream_http_'+r.status);const raw=await r.text();if(raw.length>2000000)throw Error('upstream_too_large');return JSON.parse(raw);}
function normalizeEhai(data,region,now=Date.now()){
 const name=REGIONS[region];const updated=Number.isFinite(data?.updated)?new Date(data.updated*1000).toISOString():null;
 const row=Array.isArray(data?.regions)?data.regions.find(x=>x?.name===name):null;
 const result=[];
 for(const [fuel,key] of [['АИ-95','ai95'],['ДТ','dt']]){
  if(!row||!Number.isFinite(row.n)||row.n<3||!Number.isFinite(row[key]))continue;
  try{result.push(C.priceFromMarket({fuel,marketPrice:row[key],region:name,currency:'RUB',unit:'liter',source:'Ехай',sourceUrl:SOURCES.ehai.docs,observedAt:updated},now));}catch{/* Missing or stale quotes are not prices. */}
 }
 return {quotes:result,sourceUpdatedAt:updated,reason:!row?'no_region':(!updated||now-Date.parse(updated)>C.TTL)?'stale':'partial_coverage'};
}
class Prices{
 constructor(fetcher=fetch){this.fetcher=fetcher;this.cached=new Map();this.inflight=new Map();}
 async get(region='moscow'){
  if(!REGIONS[region])throw Error('unknown_region');const old=this.cached.get(region);
  if(old&&Date.now()-old.fetched<3600000){return this.recheck(old.data);}
  if(this.inflight.has(region))return this.inflight.get(region);
  const promise=this.load(region).then(data=>{this.cached.set(region,{fetched:Date.now(),data});return data;}).finally(()=>this.inflight.delete(region));this.inflight.set(region,promise);return promise;
 }
 recheck(data){const now=Date.now();return {...data,items:data.items.map(q=>q.available&&now-Date.parse(q.observedAt)>C.TTL?{fuel:q.fuel,available:false,reason:'stale',price:null,marketPrice:null}:q)};}
 async load(region){
  const checkedAt=new Date().toISOString();const [eh,wf]=await Promise.allSettled([getJSON(SOURCES.ehai.url,this.fetcher),getJSON(SOURCES.wherefuel.url,this.fetcher)]);
  const e=eh.status==='fulfilled'?normalizeEhai(eh.value,region):{quotes:[],sourceUpdatedAt:null,reason:'upstream_unavailable'};
  const stations=wf.status==='fulfilled'&&Array.isArray(wf.value)?wf.value:[];
  // The verified public station schema contains no fuel-price values/timestamps.
  // Do not invent a schema, infer AI-98, or use a national quote for Moscow.
  const sources=[{...SOURCES.ehai,reachable:eh.status==='fulfilled',sourceUpdatedAt:e.sourceUpdatedAt,reason:e.reason},{...SOURCES.wherefuel,reachable:wf.status==='fulfilled',stations:stations.length,sourceUpdatedAt:null,reason:stations.length?'no_verified_price_fields':'upstream_unavailable'}];
  const items=['АИ-95','АИ-98','ДТ'].map(fuel=>{const q=e.quotes.find(q=>q.fuel===fuel);return q?{...q,available:true}:{fuel,price:null,marketPrice:null,available:false,reason:fuel==='АИ-98'?'no_reliable_ai98':e.reason};});
  return {region:REGIONS[region],regionId:region,discount:3,currency:'RUB',unit:'liter',checkedAt,cacheSeconds:3600,items,sources,notice:items.some(x=>x.available)?'Региональные рыночные ориентиры; скидка 3 ₽/л':'Цена уточняется: проверенные источники не вернули актуальные региональные котировки'};
 }
}
module.exports={Prices,normalizeEhai,SOURCES,REGIONS};
