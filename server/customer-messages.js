'use strict';
const {labels}=require('./operations');
const {appUrl}=require('./bot-ui');
async function drain(tg){
 if(tg.operationsBusy)return;tg.operationsBusy=true;
 try{if(!await tg.ready())return;await tg.store.transaction(async c=>{
  const rows=(await c.query("SELECT n.event_id,e.status,o.id,o.kind,o.expires_at,u.telegram_id FROM qf_customer_messages n JOIN qf_order_events e ON e.id=n.event_id JOIN qf_orders o ON o.id=e.order_id JOIN qf_users u ON u.id=o.owner_id WHERE n.state='pending' AND n.next_attempt_at<=now() ORDER BY n.event_id FOR UPDATE OF n SKIP LOCKED LIMIT 5")).rows;
  for(const r of rows)try{await tg.call('sendMessage',{chat_id:String(r.telegram_id),text:`QAZFUEL · Заявка ${r.id}\n${labels[r.status]}${r.status==='confirmed'&&r.kind==='truck'?'\nБронь до: '+new Date(r.expires_at).toISOString()+' (24 часа с создания)':''}\nАктуальные детали смотрите в приложении.`,reply_markup:{inline_keyboard:[[{text:'Мои заявки',web_app:{url:appUrl('orders')}}]]}});await c.query("UPDATE qf_customer_messages SET state='sent',attempts=attempts+1 WHERE event_id=$1",[r.event_id]);}catch{console.error('telegram_delivery_retry',{queue:'customer'});await c.query("UPDATE qf_customer_messages SET attempts=attempts+1,next_attempt_at=now()+CASE WHEN attempts>=4 THEN interval '6 hours' ELSE interval '5 minutes' END WHERE event_id=$1",[r.event_id]);}
  // A single reminder, after 15 minutes. Only orders created after this feature's migration.
  const manager=await tg.store.manager();
  const pending=(await c.query("SELECT o.id FROM qf_orders o JOIN qf_outbox b ON b.order_id=o.id WHERE o.mode='live' AND o.status='pending' AND b.state='sent' AND o.created_at<now()-interval '15 minutes' AND o.created_at>(SELECT installed_at FROM qf_operations_install WHERE singleton=true) AND (o.expires_at IS NULL OR o.expires_at>clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM qf_reminders r WHERE r.order_id=o.id) ORDER BY o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT 3")).rows;
  for(const o of pending)try{await tg.call('sendMessage',{chat_id:String(manager.chat_id),text:'⏳ Заявка '+o.id+' ожидает решения более 15 минут.',reply_markup:{inline_keyboard:[[{text:'Открыть заявку',callback_data:'ops:order:'+o.id}]]}});await c.query('INSERT INTO qf_reminders(order_id) VALUES($1) ON CONFLICT DO NOTHING',[o.id]);}catch{/* Retry on next worker pass; no state is falsely marked delivered. */}
 });}finally{tg.operationsBusy=false;}
}
module.exports={drain};
