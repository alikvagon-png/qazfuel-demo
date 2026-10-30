'use strict';
const fs=require('node:fs/promises');const path=require('node:path');
const {hash,token,HttpError,normalizeOrder,canonical}=require('./security');
class Store{
 constructor(pool){this.pool=pool;}
 async migrate(){await this.pool.query(await fs.readFile(path.join(__dirname,'schema.sql'),'utf8'));}
 async transaction(fn){const c=await this.pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async createSession(identity){
  const bearer=token();
  const user=await this.transaction(async c=>{
   let u;if(identity){
    u=(await c.query('INSERT INTO qf_users(telegram_id) VALUES($1) ON CONFLICT(telegram_id) DO UPDATE SET telegram_id=excluded.telegram_id RETURNING *',[identity.telegramId])).rows[0];
    const replay=await c.query('INSERT INTO qf_auth_replays(fingerprint,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING fingerprint',[identity.fingerprint,u.id]);
    if(!replay.rowCount)throw new HttpError(401,'Данные входа уже использованы. Откройте приложение заново.');
   }else u=(await c.query('INSERT INTO qf_users DEFAULT VALUES RETURNING *')).rows[0];
   await c.query('INSERT INTO qf_sessions(token_hash,user_id) VALUES($1,$2)',[hash(bearer),u.id]);return u;
  });return {token:bearer,userId:user.id,telegramVerified:!!user.telegram_id};
 }
 async authenticate(identity,bearer){
  if(identity&&bearer){let user;try{user=await this.session(bearer);}catch(e){if(!(e instanceof HttpError)||e.status!==401)throw e;}
   if(user&&String(user.telegram_id)===identity.telegramId){await this.transaction(async c=>{const row=(await c.query('INSERT INTO qf_auth_replays(fingerprint,user_id) VALUES($1,$2) ON CONFLICT(fingerprint) DO UPDATE SET fingerprint=excluded.fingerprint RETURNING user_id',[identity.fingerprint,user.id])).rows[0];if(row.user_id!==user.id)throw new HttpError(401,'Данные входа принадлежат другому пользователю');});return {token:bearer,userId:user.id,telegramVerified:true};}
  }
  return this.createSession(identity);
 }
 async session(bearer){if(typeof bearer!=='string'||!/^[\w-]{40,100}$/.test(bearer))throw new HttpError(401,'Сеанс не найден');const r=await this.pool.query('SELECT u.* FROM qf_sessions s JOIN qf_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp()',[hash(bearer)]);if(!r.rowCount)throw new HttpError(401,'Сеанс истёк. Войдите заново.');return r.rows[0];}
 async expire(c=this.pool){const r=await c.query("UPDATE qf_orders SET status='expired',updated_at=clock_timestamp() WHERE kind='truck' AND status IN ('pending','confirmed') AND expires_at<=clock_timestamp() RETURNING id");for(const o of r.rows)await c.query("INSERT INTO qf_order_events(order_id,status,actor) VALUES($1,'expired','server')",[o.id]);}
 serialize(r){return {...r.payload,id:r.id,status:r.status,createdAt:new Date(r.created_at).toISOString(),expiresAt:r.expires_at?new Date(r.expires_at).toISOString():null,updatedAt:new Date(r.updated_at).toISOString(),mode:r.mode,server:true,verification:r.mode==='server_test'&&r.idempotency_key.startsWith('telegram_verification_'),notification:r.notification==='sent'?'sent':r.notification==='pending'?'pending':r.mode==='server_test'?'disabled':'pending'};}
 async createOrder(user,input,key,mode,notifyVerification=false){
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(key||''))throw new HttpError(422,'Отсутствует ключ защиты от повторной отправки');
  const data=normalizeOrder(input),digest=hash(canonical(data));
  return this.transaction(async c=>{
   const prior=(await c.query('SELECT * FROM qf_orders WHERE owner_id=$1 AND idempotency_key=$2',[user.id,key])).rows[0];if(prior){if(prior.payload_hash!==digest)throw new HttpError(409,'Ключ повторной отправки уже использован с другими данными');return {order:this.serialize(prior),replayed:true};}
   if(data.kind==='truck'){await c.query("SELECT pg_advisory_xact_lock(7303)");const setting=(await c.query('SELECT value FROM qf_settings WHERE key=$1',['point:'+data.pointId])).rows[0];if(setting?.value?.closed)throw new HttpError(409,'Точка временно закрыта. Выберите другую.');}
   const r=await c.query("INSERT INTO qf_orders(owner_id,kind,payload,expires_at,idempotency_key,payload_hash,mode) VALUES($1,$2,$3,CASE WHEN $2='truck' THEN now()+interval '24 hours' ELSE NULL END,$4,$5,$6) ON CONFLICT(owner_id,idempotency_key) DO NOTHING RETURNING *",[user.id,data.kind,JSON.stringify({...data,pricing:require('./rosstat').snapshot(await require('./rosstat').latest(c),data)}),key,digest,mode]);
   if(!r.rowCount){const old=(await c.query('SELECT * FROM qf_orders WHERE owner_id=$1 AND idempotency_key=$2',[user.id,key])).rows[0];if(old.payload_hash!==digest)throw new HttpError(409,'Ключ повторной отправки уже использован с другими данными');return {order:this.serialize(old),replayed:true};}
   const o=r.rows[0];await c.query("INSERT INTO qf_order_events(order_id,status,actor) VALUES($1,'pending','client')",[o.id]);
   if(mode==='live'||(mode==='server_test'&&notifyVerification))await c.query('INSERT INTO qf_outbox(order_id) VALUES($1)',[o.id]);
   return {order:this.serialize(o),replayed:false};
  });
 }
 async list(user){return this.transaction(async c=>{await this.expire(c);const r=await c.query('SELECT o.*,b.state AS notification FROM qf_orders o LEFT JOIN qf_outbox b ON b.order_id=o.id WHERE owner_id=$1 ORDER BY o.created_at DESC LIMIT 100',[user.id]);return r.rows.map(r=>this.serialize(r));});}
 async get(user,id){return this.transaction(async c=>{await this.expire(c);const r=await c.query('SELECT o.*,b.state AS notification FROM qf_orders o LEFT JOIN qf_outbox b ON b.order_id=o.id WHERE o.owner_id=$1 AND o.id=$2',[user.id,id]);if(!r.rowCount)throw new HttpError(404,'Заявка не найдена');const events=(await c.query('SELECT status,actor,created_at FROM qf_order_events WHERE order_id=$1 ORDER BY id',[id])).rows;return {...this.serialize(r.rows[0]),events:events.map(e=>({status:e.status,actor:e.actor,createdAt:new Date(e.created_at).toISOString()}))};});}
 async change(id,status,actor,{ownerId=null,testOnly=false,liveOnly=false}={}){
  if(!['confirmed','rejected','cancelled','completed'].includes(status))throw new HttpError(422,'Недопустимый статус');
  return this.transaction(async c=>{
   await this.expire(c);const r=await c.query('SELECT * FROM qf_orders WHERE id=$1 FOR UPDATE',[id]);const o=r.rows[0];
   if(!o||(ownerId&&o.owner_id!==ownerId)||(testOnly&&o.mode!=='server_test')||(liveOnly&&o.mode!=='live'))throw new HttpError(404,'Заявка не найдена');
   if(o.mode==='server_test'&&o.idempotency_key.startsWith('telegram_verification_')){const expected=o.idempotency_key.includes('_confirm_')?'confirmed':'rejected';if(status!==expected||actor!=='manager:'+(await this.manager())?.telegram_id)throw new HttpError(422,expected==='confirmed'?'Служебная проверка: нажмите «Подтвердить» в Telegram':'Служебная проверка: нажмите «Отклонить» в Telegram');}
   if(o.status===status)return this.serialize(o);
   if(status==='completed'&&o.status!=='confirmed')throw new HttpError(409,'Завершить можно только подтверждённую заявку');
   if((status==='cancelled'&&!['pending','confirmed'].includes(o.status))||(!['cancelled','completed'].includes(status)&&o.status!=='pending'))throw new HttpError(409,o.status==='expired'?'Срок заявки истёк':'Статус уже изменён');
   const updated=await c.query("UPDATE qf_orders SET status=$2,updated_at=clock_timestamp() WHERE id=$1 AND (expires_at IS NULL OR expires_at>clock_timestamp()) RETURNING *",[id,status]);
   if(!updated.rowCount)throw new HttpError(409,'Срок заявки истёк');await c.query('INSERT INTO qf_order_events(order_id,status,actor) VALUES($1,$2,$3)',[id,status,actor]);return this.serialize(updated.rows[0]);
  });
 }
 async profile(user,data){if(data===undefined)return user.profile||{};
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['truck','phone','address'].includes(k)))throw new HttpError(422,'Некорректный профиль');
  const p={};if(data.truck!==undefined){if(data.truck!==null){const o=normalizeOrder({kind:'truck',fuel:'ДТ',pointId:'martuk',liters:300,brand:data.truck.brand,plate:data.truck.plate});p.truck={brand:o.brand,plate:o.plate};}else p.truck=null;}
  if(data.phone!==undefined){const {C}=require('./security');if(data.phone&&!C.phone(data.phone))throw new HttpError(422,'Некорректный телефон');p.phone=data.phone?C.phone(data.phone):'';}
  if(data.address!==undefined){if(typeof data.address!=='string'||data.address.length>240)throw new HttpError(422,'Некорректный адрес');p.address=data.address.trim();}
  const r=await this.pool.query('UPDATE qf_users SET profile=profile || $2::jsonb WHERE id=$1 RETURNING profile',[user.id,JSON.stringify(p)]);return r.rows[0].profile;
 }
 async createVerificationOrders(telegramId){
  const user=(await this.pool.query('INSERT INTO qf_users(telegram_id) VALUES($1) ON CONFLICT(telegram_id) DO UPDATE SET telegram_id=excluded.telegram_id RETURNING *',[telegramId])).rows[0];
  const result=[];
  for(const [step,brand] of [['confirm','ТЕСТ ПОДТВЕРЖДЕНИЯ — НЕ ВЫПОЛНЯТЬ'],['reject','ТЕСТ ОТКЛОНЕНИЯ — НЕ ВЫПОЛНЯТЬ']])result.push(await this.createOrder(user,{kind:'truck',fuel:'ДТ',pointId:'martuk',liters:50,brand,plate:'TEST 0000'},'telegram_verification_'+step+'_v1','server_test',true));
  return result;
 }
 async verificationStatus(){
  const rows=(await this.pool.query("SELECT o.status,o.idempotency_key,b.state AS notification,EXISTS(SELECT 1 FROM qf_order_events e WHERE e.order_id=o.id AND e.status=o.status AND e.actor='manager:'||m.telegram_id::text) AS manager_decision FROM qf_manager m JOIN qf_users u ON u.telegram_id=m.telegram_id JOIN qf_orders o ON o.owner_id=u.id JOIN qf_outbox b ON b.order_id=o.id WHERE o.mode='server_test' AND o.idempotency_key IN ('telegram_verification_confirm_v1','telegram_verification_reject_v1')")).rows;
  return {delivered:rows.filter(r=>r.notification==='sent').length,confirmPassed:rows.some(r=>r.idempotency_key==='telegram_verification_confirm_v1'&&r.status==='confirmed'&&r.manager_decision),rejectPassed:rows.some(r=>r.idempotency_key==='telegram_verification_reject_v1'&&r.status==='rejected'&&r.manager_decision)};
 }
 async botProfileStatus(){const row=(await this.pool.query('SELECT applied_at FROM qf_bot_profiles ORDER BY applied_at DESC LIMIT 1')).rows[0];return {applied:!!row,appliedAt:row?new Date(row.applied_at).toISOString():null};}
 async manager(){return (await this.pool.query('SELECT * FROM qf_manager WHERE singleton=true')).rows[0]||null;}
}
require('./operations').extend(Store);
module.exports={Store};
