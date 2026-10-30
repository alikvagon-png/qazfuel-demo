'use strict';
const {safeEqual,hash,HttpError,C}=require('./security');
class Telegram{
 constructor(store,env=process.env,fetcher=fetch){this.store=store;this.env=env;this.fetcher=fetcher;this.busy=false;}
 configured(){return !!(this.env.BOT_TOKEN&&this.env.TELEGRAM_WEBHOOK_SECRET&&this.env.MANAGER_TELEGRAM_ID&&this.env.WEBHOOK_ENABLED==='true');}
 async ready(){return this.configured()&&!!await this.store.manager();}
 async call(method,payload){if(!this.env.BOT_TOKEN)throw Error('telegram_not_configured');let r;try{r=await this.fetcher(`https://api.telegram.org/bot${this.env.BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});}catch{throw Error('telegram_network_error');}const data=await r.json().catch(()=>({}));if(!r.ok||!data.ok)throw Error('telegram_api_error');return data.result;}
 message(order){const p=order.payload;const location=p.kind==='truck'?C.points.find(x=>x.id===p.pointId)?.name:p.address;return `QAZFUEL · Заявка ${order.id}\n${p.kind==='truck'?'Дизель на трассе':'Доставка'}\n${p.fuel} · ${p.fullTank?'полный бак':p.liters+' л'}\nМесто: ${location}\n${p.kind==='truck'?`Грузовик: ${p.brand} · ${p.plate}`:`Телефон: ${p.phone}`}\n${p.comment?'Комментарий: '+p.comment+'\n':''}Контакт Telegram: ${order.telegram_id?'tg://user?id='+order.telegram_id:'не подтверждён'}\nСоздана: ${new Date(order.created_at).toISOString()}${order.expires_at?'\nБронь до: '+new Date(order.expires_at).toISOString():''}`;}
 async drain(){if(this.busy||!await this.ready())return;this.busy=true;try{await this.store.transaction(async c=>{const manager=await this.store.manager();const rows=(await c.query("SELECT o.*,u.telegram_id FROM qf_outbox b JOIN qf_orders o ON o.id=b.order_id JOIN qf_users u ON u.id=o.owner_id WHERE b.state='pending' AND b.next_attempt_at<=now() AND b.attempts<5 AND o.mode='live' AND o.status='pending' AND (o.expires_at IS NULL OR o.expires_at>clock_timestamp()) ORDER BY o.created_at FOR UPDATE OF b SKIP LOCKED LIMIT 5")).rows;for(const o of rows){try{const msg=await this.call('sendMessage',{chat_id:String(manager.chat_id),text:this.message(o),reply_markup:{inline_keyboard:[[{text:'Подтвердить',callback_data:'confirm:'+o.id},{text:'Отклонить',callback_data:'reject:'+o.id}]]}});await c.query("UPDATE qf_outbox SET state='sent',message_id=$2,attempts=attempts+1,last_error=NULL WHERE order_id=$1",[o.id,msg.message_id]);}catch{await c.query("UPDATE qf_outbox SET attempts=attempts+1,next_attempt_at=now()+interval '5 minutes',last_error='telegram_delivery_failed' WHERE order_id=$1",[o.id]);}}});}finally{this.busy=false;}}
 async handle(update,secret){
  if(!this.configured())throw new HttpError(503,'Telegram не подключён');if(!safeEqual(secret||'',this.env.TELEGRAM_WEBHOOK_SECRET))throw new HttpError(401,'Недопустимая подпись webhook');
  if(!update||!Number.isSafeInteger(update.update_id))throw new HttpError(400,'Некорректный update');
  const claimed=await this.store.pool.query('INSERT INTO qf_webhook_updates(update_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING update_id',[update.update_id]);if(!claimed.rowCount)return {ok:true,duplicate:true};
  const m=update.message;
  if(m?.chat?.type==='private'&&String(m.from?.id)===this.env.MANAGER_TELEGRAM_ID&&typeof m.text==='string'&&m.text.startsWith('/start manager_')){
   const code=m.text.slice('/start manager_'.length);if(!this.env.MANAGER_PAIRING_TOKEN||!safeEqual(hash(code),hash(this.env.MANAGER_PAIRING_TOKEN)))throw new HttpError(403,'Код привязки не принят');
   await this.store.pool.query('INSERT INTO qf_manager(singleton,telegram_id,chat_id) VALUES(true,$1,$2) ON CONFLICT(singleton) DO NOTHING',[m.from.id,m.chat.id]);await this.call('sendMessage',{chat_id:m.chat.id,text:'QAZFUEL: ID менеджера подтверждён. Этот чат привязан для заявок.'});return {ok:true};
  }
  const q=update.callback_query,manager=await this.store.manager();
  if(!q||!manager||String(q.from?.id)!==String(manager.telegram_id)||String(q.message?.chat?.id)!==String(manager.chat_id))throw new HttpError(403,'Доступ менеджера не подтверждён');
  const match=/^(confirm|reject):([a-f\d-]{36})$/i.exec(q.data||'');if(!match)throw new HttpError(400,'Неизвестное действие');
  try{const o=await this.store.change(match[2],match[1]==='confirm'?'confirmed':'rejected','manager:'+manager.telegram_id,{liveOnly:true});await this.call('answerCallbackQuery',{callback_query_id:q.id,text:match[1]==='confirm'?'Заявка подтверждена':'Заявка отклонена'});await this.call('editMessageReplyMarkup',{chat_id:String(manager.chat_id),message_id:q.message.message_id,reply_markup:{inline_keyboard:[]}});return {ok:true,status:o.status};}catch(e){if(e instanceof HttpError){await this.call('answerCallbackQuery',{callback_query_id:q.id,text:e.message,show_alert:true});return {ok:true,changed:false};}throw e;}
 }
}
module.exports={Telegram};
