'use strict';
const {HttpError,C}=require('./security');
const labels={pending:'Ожидает подтверждения',confirmed:'Подтверждена',rejected:'Отклонена',expired:'Истекла',cancelled:'Отменена',completed:'Выполнена'};
function extend(Store){
 Store.prototype.settings=async function(){return (await this.pool.query('SELECT key,value,updated_at FROM qf_settings')).rows;};
 Store.prototype.setting=async function(key,value){return this.transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(7303)');await c.query('INSERT INTO qf_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=clock_timestamp()',[key,JSON.stringify(value)]);});};
 Store.prototype.operationsList=async function(status='pending',offset=0){await this.transaction(c=>this.expire(c));return (await this.pool.query("SELECT o.*,u.telegram_id FROM qf_orders o JOIN qf_users u ON u.id=o.owner_id WHERE o.mode='live' AND o.status=$1 ORDER BY o.created_at DESC LIMIT 6 OFFSET $2",[status,offset])).rows;};
 Store.prototype.operationsOrder=async function(id){return (await this.pool.query("SELECT o.*,u.telegram_id FROM qf_orders o JOIN qf_users u ON u.id=o.owner_id WHERE o.id=$1 AND o.mode='live'",[id])).rows[0];};
}
function buttons(rows){return {inline_keyboard:rows};}
const b=(text,data)=>({text,callback_data:'ops:'+data});
const home=()=>({text:'Управление QAZFUEL\n\nЗаявки, цены и доступность точек. Ручная рыночная котировка действует 24 часа, скидка всегда 3 ₽/л.',reply_markup:buttons([[b('🆕 Новые','list:pending:0'),b('✅ Подтверждённые','list:confirmed:0')],[b('🏁 Выполненные','list:completed:0'),b('Отменённые','list:cancelled:0')],[b('Отклонённые','list:rejected:0'),b('Истёкшие','list:expired:0')],[b('₽ Ручные цены','prices'),b('📍 Работа точек','points')]])});
async function handle(tg,data,chat){
 if(/^(order|ask|change):/.test(data)&&!/[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(data))throw new HttpError(422,'Некорректный номер заявки');
 const send=v=>tg.call('sendMessage',{chat_id:chat,...v});const parts=data.split(':');
 if(data==='home')return send(home());
 if(parts[0]==='list'){
  const status=parts[1],offset=Number(parts[2]);if(!Object.hasOwn(labels,status)||!Number.isSafeInteger(offset)||offset<0||offset>10000)throw new HttpError(422,'Неверный список');
  const rows=await tg.store.operationsList(status,offset);const more=rows.length===6;const visible=rows.slice(0,5);
  return send({text:labels[status]+(visible.length?'':'\nЗаявок пока нет.'),reply_markup:buttons([...visible.map(o=>[b(`${o.id.slice(-6).toUpperCase()} · ${o.payload.fullTank?'Полный бак':o.payload.liters+' л'} · ${(o.kind==='truck'?C.points.find(p=>p.id===o.payload.pointId)?.name:o.payload.address).slice(0,25)}`,'order:'+o.id)]),...(offset?[[b('← Назад',`list:${status}:${Math.max(0,offset-5)}`)]]:[]),...(more?[[b('Далее →',`list:${status}:${offset+5}`)]]:[]),[b('Меню менеджера','home')]])});
 }
 if(parts[0]==='order'){
  await tg.store.transaction(c=>tg.store.expire(c));const o=await tg.store.operationsOrder(parts[1]);if(!o)throw new HttpError(404,'Заявка не найдена');
  const actions=o.status==='pending'?[[b('Подтвердить','change:confirmed:'+o.id),b('Отклонить','change:rejected:'+o.id)]]:o.status==='confirmed'?[[b('🏁 Выполнено','ask:completed:'+o.id),b('Отменить','ask:cancelled:'+o.id)]]:[];
  return send({text:tg.message(o)+'\nСтатус: '+labels[o.status],reply_markup:buttons([...actions,...(o.telegram_id?[[{text:'Связаться с клиентом',url:'tg://user?id='+o.telegram_id}]]:[]),[b('Обновить','order:'+o.id),b('Меню','home')]])});
 }
 if(parts[0]==='ask'&&['completed','cancelled'].includes(parts[1]))return send({text:'Изменить статус заявки '+parts[2]+' на «'+labels[parts[1]]+'»?',reply_markup:buttons([[b('Да, изменить','change:'+parts[1]+':'+parts[2])],[b('Назад к заявке','order:'+parts[2])]])});
 if(parts[0]==='change'&&['confirmed','rejected','completed','cancelled'].includes(parts[1])){await tg.store.change(parts[2],parts[1],'manager:'+tg.env.MANAGER_TELEGRAM_ID,{liveOnly:true});return handle(tg,'order:'+parts[2],chat);}
 if(data==='points'){
  const settings=await tg.store.settings();return send({text:'Точки: нажмите, чтобы изменить доступность. Закрытая точка остаётся на карте, новые заявки сервер отклоняет. Существующие заявки сохраняются.',reply_markup:buttons([...C.points.map(p=>{const closed=settings.find(s=>s.key==='point:'+p.id)?.value.closed;return [b((closed?'🔴 Закрыта · ':'🟢 Открыта · ')+p.name,`point:${p.id}:${closed?'open':'close'}`)];}),[b('Меню','home')]])});
 }
 if(parts[0]==='point'&&C.points.some(p=>p.id===parts[1])&&['open','close'].includes(parts[2]))return send({text:(parts[2]==='close'?'Закрыть':'Открыть')+' точку '+C.points.find(p=>p.id===parts[1]).name+'?',reply_markup:buttons([[b('Подтвердить',`pointset:${parts[1]}:${parts[2]}`)],[b('Назад','points')]])});
 if(parts[0]==='pointset'&&C.points.some(p=>p.id===parts[1])&&['open','close'].includes(parts[2])){await tg.store.setting('point:'+parts[1],{closed:parts[2]==='close'});return handle(tg,'points',chat);}
 if(data==='prices'){
  const settings=await tg.store.settings();const lines=settings.filter(s=>s.key.startsWith('price:')).map(s=>`${s.value.region} · ${s.value.fuel}: рынок ${s.value.marketPrice}, QAZFUEL ${(s.value.marketPrice-3).toFixed(2)} ₽/л · ${new Date(s.updated_at).toISOString()}`);
  return send({text:'Ручные рыночные цены\n\n'+(lines.join('\n')||'Котировки не заданы.')+'\n\nКоманда:\n/price moscow 95 65.50\n/price moscow_oblast 98 80.00\n/price moscow dt 75.00\n\nУказывайте проверенную рыночную цену, не цену QAZFUEL. Вычтем 3 ₽/л. Действует 24 часа. Для удаления: /price moscow 95 off\n\nРучная настройка помечается как данные менеджера, не как API.',reply_markup:buttons([[b('Меню','home')]])});
 }
 throw new HttpError(422,'Неизвестное действие менеджера');
}
async function priceCommand(tg,text){const m=/^\/price(?:@\w+)?\s+(moscow|moscow_oblast)\s+(95|98|dt)\s+(off|\d{1,3}(?:[.,]\d{1,2})?)$/i.exec(text.trim());if(!m)throw new HttpError(422,'Формат: /price moscow 95 65.50. Регион: moscow или moscow_oblast; топливо: 95, 98, dt; цена либо off.');const fuel={'95':'АИ-95','98':'АИ-98',dt:'ДТ'}[m[2].toLowerCase()],region=m[1].toLowerCase(),price=Number(m[3].replace(',','.'));if(m[3].toLowerCase()!=='off'&&(!Number.isFinite(price)||price<=3||price>300))throw new HttpError(422,'Рыночная цена должна быть больше 3 и не выше 300 ₽/л');await tg.store.setting(`price:${region}:${fuel}`,m[3].toLowerCase()==='off'?{disabled:true}:{region,fuel,marketPrice:price});return 'Цена сохранена. '+(m[3].toLowerCase()==='off'?'Ручная котировка отключена.':`QAZFUEL: ${(price-3).toFixed(2)} ₽/л, действует 24 часа.`);}
module.exports={extend,handle,home,priceCommand,labels};
