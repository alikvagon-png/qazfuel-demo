'use strict';
const http=require('node:http');const {Pool}=require('pg');const {Store}=require('./store');const {Prices,REGIONS}=require('./prices');const {Telegram}=require('./telegram');const {HttpError,validateInitData}=require('./security');
function createApp({store=null,prices=new Prices(),env=process.env,telegram=null}={}){
 const tg=telegram||(store?new Telegram(store,env):null);const allowed=new Set((env.ALLOWED_ORIGINS||'https://qazfuel-v3-preview.onrender.com').split(',').map(s=>s.trim()).filter(Boolean));const limits=new Map();
 function limit(req,bucket,max){const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',').pop().trim();const key=bucket+':'+ip;const now=Date.now();let r=limits.get(key);if(!r||now>r.reset)r={n:0,reset:now+60000};r.n++;limits.set(key,r);if(r.n>max)throw new HttpError(429,'Слишком много запросов. Повторите через минуту.');if(limits.size>10000)for(const [k,v] of limits)if(v.reset<now)limits.delete(k);}
 async function body(req){if(!(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(415,'Нужен JSON');const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>32768)throw new HttpError(413,'Слишком большой запрос');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw new HttpError(400,'Некорректный JSON');}}
 async function mode(){return store?(env.ORDER_INTAKE_ENABLED==='true'&&tg&&await tg.ready()?'live':'server_test'):'local_demo';}
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Vary','Origin');
  const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
  try{
   if(origin&&!allowed.has(origin))throw new HttpError(403,'Этот сайт не разрешён');
   if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,Idempotency-Key');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,OPTIONS');}
   if(req.method==='OPTIONS')return send(204,{});
   const url=new URL(req.url,'http://localhost');limit(req,'all',120);
   if(url.pathname==='/health'){if(store)await store.pool.query('SELECT 1');return send(200,{ok:true,database:!!store,service:'qazfuel-v3-api'});}
   if(url.pathname==='/api/config'&&req.method==='GET')return send(200,{mode:await mode(),database:!!store,telegramConfigured:!!tg?.configured(),managerBound:store?!!await store.manager():false,managerChecks:store?await store.verificationStatus():null,botPresentation:store?await store.botProfileStatus():null,discount:3,serverNow:new Date().toISOString(),databaseExpiresAt:env.DATABASE_EXPIRES_AT||null});
   if(url.pathname==='/api/points'&&req.method==='GET')return send(200,{points:store?(await store.settings()).filter(s=>s.key.startsWith('point:')).map(s=>({id:s.key.slice(6),closed:!!s.value.closed})):[]});
   if(url.pathname==='/api/prices'&&req.method==='GET'){const region=url.searchParams.get('region')||'moscow';if(!REGIONS[region])throw new HttpError(422,'Неизвестный регион');const result=await prices.get(region);if(store){const settings=await store.settings();result.items=result.items.map(item=>{if(item.available)return item;const row=settings.find(s=>s.key==='price:'+region+':'+item.fuel);if(!row||row.value.disabled||Date.now()-Date.parse(row.updated_at)>86400000)return item;return {...item,available:true,manual:true,price:Math.round((row.value.marketPrice-3)*100)/100,marketPrice:row.value.marketPrice,discount:3,region:REGIONS[region],currency:'RUB',unit:'liter',source:'Ручная котировка менеджера',sourceUrl:'https://t.me/qazfuel',observedAt:new Date(row.updated_at).toISOString()};});if(result.items.some(i=>i.manual)){result.notice='Ручные рыночные котировки менеджера обозначены отдельно; скидка 3 ₽/л, срок действия 24 часа.';}}return send(200,result);}
   if(url.pathname==='/telegram/webhook'&&req.method==='POST'){if(!store||!tg)throw new HttpError(503,'Telegram отключён');return send(200,await tg.handle(await body(req),req.headers['x-telegram-bot-api-secret-token']));}
   if(!store)throw new HttpError(503,'Серверное хранилище ещё не подключено','database_unconfigured');
   if(['POST','PUT','DELETE'].includes(req.method)&&(!origin||!allowed.has(origin)))throw new HttpError(403,'Для записи требуется разрешённый Origin');
   if(url.pathname==='/api/session'&&req.method==='POST'){
    limit(req,'session',12);const data=await body(req);if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>k!=='initData'))throw new HttpError(422,'Недопустимые данные входа');
    const currentMode=await mode();let identity=null;if(data.initData){identity=validateInitData(data.initData,env.BOT_TOKEN);}else if(currentMode==='live')throw new HttpError(401,'Откройте приложение через Telegram');
    return send(201,await store.createSession(identity));
   }
   const bearer=(req.headers.authorization||'').replace(/^Bearer /,'');const user=await store.session(bearer);
   if(url.pathname==='/api/profile'&&req.method==='GET')return send(200,{profile:await store.profile(user),telegramVerified:!!user.telegram_id});
   if(url.pathname==='/api/profile'&&req.method==='PUT')return send(200,{profile:await store.profile(user,await body(req))});
   if(url.pathname==='/api/orders'&&req.method==='GET')return send(200,{orders:await store.list(user),serverNow:new Date().toISOString(),mode:await mode()});
   if(url.pathname==='/api/orders'&&req.method==='POST'){
    limit(req,'orders',15);const currentMode=await mode();if(currentMode==='live'&&!user.telegram_id)throw new HttpError(401,'Нужен подтверждённый вход Telegram');const r=await store.createOrder(user,await body(req),req.headers['idempotency-key'],currentMode);if(currentMode==='live')void tg.drain().catch(()=>{});return send(r.replayed?200:201,{...r,serverNow:new Date().toISOString(),mode:currentMode});
   }
   const match=/^\/api\/orders\/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})(?:\/(cancel|simulate))?$/i.exec(url.pathname);
   if(match){if(!match[2]&&req.method==='GET')return send(200,{order:await store.get(user,match[1]),serverNow:new Date().toISOString()});
    if(req.method==='POST'&&match[2]){const data=await body(req);let order;if(match[2]==='cancel')order=await store.change(match[1],'cancelled','client',{ownerId:user.id});else{if(await mode()!=='server_test')throw new HttpError(403,'Тестовые переходы отключены');if(!['confirmed','rejected'].includes(data.status))throw new HttpError(422,'Недопустимый статус');order=await store.change(match[1],data.status,'test-client',{ownerId:user.id,testOnly:true});}return send(200,{order,serverNow:new Date().toISOString()});}
   }
   throw new HttpError(404,'Не найдено');
  }catch(e){if(res.headersSent)return res.end();if(e instanceof HttpError)return send(e.status,{error:e.message,code:e.code});console.error('request_failed',{code:'internal_error'});send(503,{error:'Сервис временно недоступен. Данные заявки остаются в форме.',code:'service_unavailable'});}
 });return {server,telegram:tg};
}
async function main(){let pool,store=null;if(process.env.DATABASE_URL){pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:10000,statement_timeout:10000,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:false});store=new Store(pool);await store.migrate();}
 const {server,telegram}=createApp({store});server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('qazfuel_api_ready',{database:!!store}));
 const {syncProfile}=require('./bot-profile');if(telegram)void syncProfile(telegram).then(r=>console.log('bot_profile_ready',{configured:r.configured,cached:r.cached})).catch(e=>console.error('bot_profile_failed',{code:e.message.startsWith('telegram_')||e.message==='unexpected_bot_identity'?e.message:'profile_setup_failed'}));
 const interval=setInterval(()=>{if(store)void store.transaction(c=>store.expire(c)).catch(()=>console.error('expiry_failed'));if(telegram){void telegram.drain().catch(()=>console.error('notification_retry_failed'));void require('./customer-messages').drain(telegram).catch(()=>console.error('customer_notification_failed'));}},60000);interval.unref();
 process.on('SIGTERM',()=>{clearInterval(interval);server.close(()=>{pool?.end().finally(()=>process.exit(0));if(!pool)process.exit(0);});setTimeout(()=>process.exit(1),25000).unref();});
}
if(require.main===module)main().catch(()=>{console.error('startup_failed');process.exit(1);});module.exports={createApp};
