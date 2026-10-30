/* QAZFUEL V3: explicit local / server-test / live modes; no client secrets. */
(() => {
 'use strict';
 const C=window.QFCore,$=id=>document.getElementById(id),KEY='qazfuel_v3_state',DRAFT_KEY='qazfuel_v3_drafts';
 let state={version:3,orders:[],truck:null},current='home',filter='all',selected=C.points[0].id,map=null,markers=[],pending=null,submitting=false,toastTimer,geo=null,fuel='АИ-95',fullTank=false,lastSubmit=0,draftTimer,storageBroken=false,previousFocus=null;
 const API=window.QF_CONFIG?.apiBase||'',SESSION_KEY='qazfuel_v3_session',RETRY_KEY='qazfuel_v3_retry';
 let remote={mode:'local_demo',ready:false,orders:[],token:'',config:null,error:''},clockOffset=0,priceRequest=0;
 const allOrders=()=>[...remote.orders,...state.orders],findOrder=id=>allOrders().find(o=>o.id===id),orderStatus=o=>C.status(o,Date.now()+clockOffset);
 const modeLabel=()=>remote.ready?(remote.mode==='live'?'ЗАЯВКА':'СЕРВЕРНЫЙ ТЕСТ'):'ЛОКАЛЬНОЕ ДЕМО';
 const modeNote=()=>remote.ready?(remote.mode==='live'?'Заявка сохранится на сервере и будет отправлена менеджеру. Подтверждение отобразится в истории.':'Заявка сохранится в тестовой базе на сервере. Менеджеру не отправится и реальную бронь не создаст.'):'Заявка сохранится только в этом браузере. Менеджеру не отправится и реальную бронь не создаст.';
 const when=value=>new Date(value).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
 const point=id=>C.points.find(p=>p.id===id)||C.points[0];
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function storageProblem(message){storageBroken=true;$('storageBanner').textContent=message;$('storageBanner').hidden=false;}
 function readState(){
  try{
   const raw=localStorage.getItem(KEY);
   if(raw){const parsed=JSON.parse(raw);if(parsed.version!==3||!Array.isArray(parsed.orders)||!parsed.orders.every(C.validateOrder))throw Error('Invalid data');state={...parsed,orders:parsed.orders};}
   else {
    // Preserve earlier prototype records, never mistake them for server orders.
    const oldRaw=localStorage.getItem('qazfuel_v3_orders');
    if(oldRaw){const old=JSON.parse(oldRaw);if(!Array.isArray(old))throw Error('Invalid legacy data');state.orders=old.filter(o=>o&&typeof o.desc==='string'&&typeof o.created==='string'&&Number.isFinite(Date.parse(o.created))).map((o,i)=>({id:'legacy-'+i+'-'+Date.parse(o.created),kind:'legacy',createdAt:o.created,status:'pending',note:o.type+' · '+o.desc}));}
   }
  }catch(e){storageProblem('Не удалось прочитать локальные данные. Они не перезаписаны. Новые заявки отключены: сохраните важное и очистите демоданные в разделе «О нас».');}
 }
 function persist(next){if(storageBroken)throw Error('Локальное хранилище недоступно. Очистите повреждённые демоданные в разделе «О нас».');localStorage.setItem(KEY,JSON.stringify(next));state=next;}
 function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
 function go(id,{history=true,focus=true}={}){
  if(!$(id)||!$(id).classList.contains('view'))id='home';
  current=id;document.body.dataset.screen=id;
  document.querySelectorAll('.view').forEach(v=>{v.hidden=v.id!==id;v.classList.toggle('active',v.id===id);});
  const navId=['booking','delivery','prices'].includes(id)?'home':id;
  document.querySelectorAll('.bottom-nav button').forEach(b=>{if(b.dataset.go===navId)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(history&&location.hash!=='#'+id)window.history.pushState({screen:id},'','#'+id);
  window.scrollTo({top:0,behavior:'instant'});
  if(id==='points')requestAnimationFrame(initMap);
  if(id==='orders')renderOrders();
  if(id==='delivery')updateDelivery();
  if(focus){const heading=$(id).querySelector('h1');heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}
  updateViewport();window.dispatchEvent(new Event('qf:navigate'));
 }
 function choosePoint(id,{openBooking=false,scrollToCard=false}={}){
  selected=point(id).id;$('pointSelect').value=selected;renderSelectedPoint();updateTruck();
  document.querySelectorAll('.point-card').forEach(el=>el.classList.toggle('point-selected',el.dataset.point===selected));
  markers.forEach((m,i)=>{const el=m.getElement();if(el)el.classList.toggle('selected',C.points[i].id===selected);});
  if(openBooking)go('booking');
  if(scrollToCard){const card=document.querySelector('[data-point="'+selected+'"]');if(card)requestAnimationFrame(()=>{card.focus({preventScroll:true});card.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});});}
 }
 function routeLink(p,label='Построить маршрут ↗'){return `<a class="route-link" href="${C.routeUrl(p)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(label+' — '+p.name)}">${label}</a>`;}
 function renderPoints(){
  $('pointSelect').innerHTML=C.points.map(p=>`<option value="${p.id}">${p.name} · ${p.country}</option>`).join('');
  $('pointList').innerHTML=C.points.map((p,i)=>`<article class="point-card ${p.id===selected?'point-selected':''}" data-point="${p.id}" id="point-card-${p.id}" tabindex="-1"><span class="point-index">${String(i+1).padStart(2,'0')}</span><div class="point-copy"><h3>${p.name}</h3><p>${p.country} · дизель</p><small>${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</small><div class="point-actions">${routeLink(p,'Маршрут ↗')}<button class="text-btn" data-book-point="${p.id}" aria-label="Забронировать — ${p.name}">Забронировать →</button></div></div></article>`).join('');renderSelectedPoint();
 }
 function renderSelectedPoint(){const p=point(selected);$('selectedPoint').innerHTML=`<div><span class="eyebrow">ВЫБРАННАЯ ТОЧКА</span><h2>${p.name}</h2><p>${p.country} · только дизель</p></div><div class="selected-actions">${routeLink(p)}<button class="primary-btn" data-book-point="${p.id}">Тестовая бронь →</button></div>`;}
 function mapFallback(){ $('fuelMap').hidden=true;$('mapFallback').hidden=false;$('fitMap').disabled=true; }
 function initMap(){
  if(map){map.invalidateSize();return;}
  if(!window.L){mapFallback();return;}
  try{
   map=L.map('fuelMap',{scrollWheelZoom:false,attributionControl:true,zoomControl:false}).setView([49.3,48.4],4);L.control.zoom({position:'bottomleft'}).addTo(map);
   const layer=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'}).addTo(map);
   let failedTiles=0;layer.on('tileerror',()=>{if(++failedTiles===3)toast('Подложка карты недоступна. Точки и маршруты работают в списке.');});
   markers=C.points.map((p,i)=>{const m=L.marker([p.lat,p.lng],{title:p.name,keyboard:true,alt:p.name,icon:L.divIcon({className:'map-pin'+(p.id===selected?' selected':''),html:`<span>${i+1}</span>`,iconSize:[34,40],iconAnchor:[17,40]})}).addTo(map);const selectMarker=()=>{choosePoint(p.id,{scrollToCard:true});map.setView([p.lat,p.lng],Math.max(map.getZoom(),9));};m.on('click',selectMarker);const icon=m.getElement();if(icon){icon.setAttribute('aria-label','Выбрать точку '+p.name);icon.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();selectMarker();}});}return m;});
   fitMap();
  }catch(e){mapFallback();}
 }
 function fitMap(){if(map)map.fitBounds(C.points.map(p=>[p.lat,p.lng]),{padding:[30,30],maxZoom:8});}
 function updateTruck(){
  $('truckVolume').textContent=$('truckLiters').value;
  document.querySelectorAll('[data-truck-liters]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.truckLiters===$('truckLiters').value)));
  const p=point($('pointSelect').value);$('bookingPointInfo').textContent=p.country+' · '+p.lat.toFixed(6)+', '+p.lng.toFixed(6);
  $('bookingSummary').innerHTML=`<div><span>Ваш выбор</span><strong>ДТ · ${escape($('truckLiters').value)} л</strong></div><div><span>Точка</span><strong>${p.name}</strong></div><div><span>Стоимость</span><strong>Уточняется</strong></div>`;
 }
 function updateDelivery(){
  $('deliveryVolume').textContent=fullTank?'Полный бак':$('deliveryLiters').value;$('deliveryUnit').textContent=fullTank?'':'л';$('fullTank').setAttribute('aria-pressed',String(fullTank));$('fullTankNote').hidden=!fullTank;
  document.querySelectorAll('[data-delivery-liters]').forEach(b=>b.setAttribute('aria-pressed',String(!fullTank&&b.dataset.deliveryLiters===$('deliveryLiters').value)));
  document.querySelectorAll('[data-fuel]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.fuel===fuel)));
  $('deliverySummary').innerHTML=`<div><span>Ваш выбор</span><strong>${escape(fuel)} · ${fullTank?'полный бак':escape($('deliveryLiters').value)+' л'}</strong></div><div><span>Оплата</span><strong>Наличными на месте</strong></div><div><span>Стоимость</span><strong>${fullTank?'По фактическим литрам':'Уточняется'}</strong></div>`;
 }
 function truckData(){return {kind:'truck',pointId:$('pointSelect').value,fuel:'ДТ',liters:Number($('truckLiters').value),brand:$('truckBrand').value.trim(),plate:$('truckPlate').value.trim().toUpperCase()};}
 function deliveryData(){return {kind:'delivery',fuel,liters:fullTank?null:Number($('deliveryLiters').value),fullTank,address:$('deliveryAddress').value.trim(),phone:$('deliveryPhone').value.trim(),comment:$('deliveryComment').value.trim(),geo};}
 function clearErrors(kind){const fields=kind==='truck'?['truckBrand','truckPlate']:['deliveryAddress','deliveryPhone'];fields.forEach(id=>{$(id).removeAttribute('aria-invalid');$(id+'Error').textContent='';});$(kind==='truck'?'bookingError':'deliveryError').textContent='';}
 function showErrors(kind,errors){
  const ids=kind==='truck'?{brand:'truckBrand',plate:'truckPlate'}:{address:'deliveryAddress',phone:'deliveryPhone'};let first=null;
  Object.entries(errors).forEach(([key,message])=>{const id=ids[key];if(id){$(id).setAttribute('aria-invalid','true');$(id+'Error').textContent=message;if(!first)first=$(id);}else $(kind==='truck'?'bookingError':'deliveryError').textContent=message;});
  if(first)first.focus();
 }
 function review(kind){
  clearErrors(kind);const data=kind==='truck'?truckData():deliveryData(),errors=kind==='truck'?C.validateTruck(data):C.validateDelivery(data);
  if(Object.keys(errors).length){showErrors(kind,errors);return;}
  if(storageBroken&&!API){$(kind==='truck'?'bookingError':'deliveryError').textContent='Не удалось открыть локальное хранилище. Сохранение отключено.';return;}
  if(kind==='delivery')data.phone=C.phone(data.phone);
  pending=data;openDialog(`<div class="page-kicker">ПОЧТИ ГОТОВО / ${modeLabel()}</div><h2 id="dialogTitle">Проверьте заявку</h2><p class="lead">${kind==='truck'?'Дизель для вашего рейса':'Доставка по Москве и области'}</p><div class="confirm-card"><span class="eyebrow">${kind==='truck'?point(data.pointId).name:'ДОСТАВКА'}</span><h3>${escape(data.fuel)} · ${data.fullTank?'полный бак':data.liters+' л'}</h3><p>${kind==='truck'?escape(data.brand+' · '+data.plate):escape(data.address)}</p></div>${detailRows(data)}<div class="demo-note"><span>◉</span><p><strong>${modeLabel()}</strong>${modeNote()}</p></div><p id="dialogError" class="form-error" role="alert"></p><button class="primary-btn" id="confirmOrder">${remote.mode==='live'&&remote.ready?'Отправить заявку':'Сохранить тестовую заявку'} <span>→</span></button><button class="secondary-btn" id="editOrder">Изменить данные</button>`);
 }
 function openDialog(html){delete $('orderDialog').dataset.orderId;previousFocus=document.activeElement;$('dialogBody').innerHTML=html;const d=$('orderDialog');if(!d.open)d.showModal();document.body.classList.add('dialog-open');$('closeDialog').focus();}
 function closeDialog(){if(submitting)return;$('orderDialog').close();document.body.classList.remove('dialog-open');pending=null;if(previousFocus&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});}
 async function saveOrder(){
  if(submitting||!pending||Date.now()-lastSubmit<1000)return;
  submitting=true;const btn=$('confirmOrder');btn.disabled=true;btn.textContent='Сохраняем…';
  try{
   if(API){
    if(!remote.ready||!navigator.onLine)throw Error('Нет связи с сервером. Заявка не отправлена. Проверьте интернет и повторите.');
    const payload=JSON.stringify(pending);let retry;try{retry=JSON.parse(sessionStorage.getItem(RETRY_KEY)||'null');}catch{}
    if(!retry||retry.payload!==payload)retry={payload,key:crypto.randomUUID()};
    sessionStorage.setItem(RETRY_KEY,JSON.stringify(retry));
    const result=await request('/api/orders',{method:'POST',body:pending,key:retry.key});syncClock(result.serverNow);
    remote.orders=[result.order,...remote.orders.filter(o=>o.id!==result.order.id)];sessionStorage.removeItem(RETRY_KEY);
    const profile=pending.kind==='truck'?{truck:$('saveTruck').checked?{brand:pending.brand,plate:pending.plate}:null}:{phone:pending.phone,address:pending.address};
    try{await request('/api/profile',{method:'PUT',body:profile});}catch{toast('Заявка сохранена, но профиль не обновлён.');}
    lastSubmit=Date.now();submitting=false;closeDialog();go('orders');toast(result.order.mode==='live'?'Заявка № '+result.order.id.slice(-6).toUpperCase()+' сохранена на сервере. Ожидайте решения менеджера.':'Серверный тест № '+result.order.id.slice(-6).toUpperCase()+' сохранён. Менеджеру не отправлен.');return;
   }
   const createdAt=new Date().toISOString(),id=window.crypto?.randomUUID?window.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
   const order={...pending,id,createdAt,status:'pending'};if(order.kind==='truck')order.expiresAt=C.expiration(order);
   const next={...state,orders:[order,...state.orders],truck:order.kind==='truck'?($('saveTruck').checked?{brand:order.brand,plate:order.plate}:null):state.truck};
   persist(next);lastSubmit=Date.now();submitting=false;closeDialog();go('orders');toast('Тестовая заявка сохранена. Менеджеру не отправлена.');
  }catch(e){$('dialogError').textContent=API?e.message:'Не удалось сохранить заявку. Проверьте доступ к хранилищу или свободное место. Данные формы сохранены на экране.';btn.disabled=false;btn.textContent='Повторить сохранение';submitting=false;}
 }
 const statuses={archived:'Архив прототипа',pending:'Ожидает подтверждения',confirmed:'Забронировано',expired:'Срок истёк',cancelled:'Отменена',rejected:'Отклонена'};
 function orderName(o){return o.kind==='truck'?'Дизель на трассе':o.kind==='delivery'?'Доставка топлива':'Из прошлой демоверсии';}
 function orderQuantity(o){return o.kind==='legacy'?'Архивная заявка':o.fuel+' · '+(o.fullTank?'полный бак':o.liters+' л');}
 function renderOrders(){
  $('ordersCount').textContent=allOrders().length;$('navOrderCount').hidden=!allOrders().length;$('navOrderCount').textContent=allOrders().length>9?'9+':allOrders().length;
  const filtered=allOrders().filter(o=>filter==='all'||o.kind===filter);
  $('orderList').innerHTML=filtered.length?filtered.map(o=>{const s=orderStatus(o);return `<article class="order-card" data-order="${o.id}"><div class="order-card-top"><span class="order-type">${orderName(o)}</span><span class="order-demo">${o.server?(o.mode==='live'?'СЕРВЕР':'ТЕСТ · БД'):'ДЕМО · БРАУЗЕР'}</span></div><h2>${escape(orderQuantity(o))}</h2><p class="order-place">${escape(o.kind==='truck'?point(o.pointId).name:o.kind==='delivery'?o.address:o.note)}</p><span class="status-badge status-${s}">● ${s==='confirmed'&&o.kind==='delivery'?'Подтверждена':statuses[s]}${o.mode==='live'?'':' · тест'}</span>${o.kind==='truck'?`<div class="order-countdown"><span>До ${when(C.expiration(o))}</span><strong data-countdown="${o.id}">${s==='cancelled'?'Отменена':C.remaining(o,Date.now()+clockOffset)}</strong></div>`:''}<div class="order-meta"><span>№ ${escape(o.id.slice(-6).toUpperCase())}</span><time datetime="${escape(o.createdAt)}">${when(o.createdAt)}</time></div><div class="order-actions"><button class="secondary-btn" data-details="${o.id}">Подробнее</button>${o.kind!=='legacy'?`<button class="secondary-btn accent" data-repeat="${o.id}">Повторить ↗</button>`:''}</div></article>`;}).join(''):`<div class="empty-state"><span aria-hidden="true">▤</span><h2>${allOrders().length?'Здесь пока пусто':'Первая заправка впереди'}</h2><p>${allOrders().length?'В этой категории ещё нет тестовых заявок.':'Выберите услугу. Здесь появятся ваши тестовые заявки и их статусы.'}</p><button class="primary-btn" data-go="home">Выбрать услугу →</button></div>`;
 }
 function detailRows(o){const rows=o.kind==='truck'?[['Топливо','Дизель'],['Объём',o.liters+' л'],['Грузовик',o.brand],['Госномер',o.plate],['Точка',point(o.pointId).name]]:o.kind==='delivery'?[['Топливо',o.fuel],['Объём',o.fullTank?'Полный бак · по факту':o.liters+' л'],['Адрес',o.address],['Телефон',o.phone],['Комментарий',o.comment||'Не указан'],...(o.geo?[['Геолокация',o.geo.lat.toFixed(5)+', '+o.geo.lng.toFixed(5)]]:[])]:[['Детали',o.note]];return `<dl class="detail-grid">${rows.map(([k,v])=>`<div class="detail-row"><dt>${k}</dt><dd>${escape(v)}</dd></div>`).join('')}<div class="detail-row"><dt>Стоимость</dt><dd>Уточняется</dd></div></dl>`;}
 function details(id){const o=findOrder(id);if(!o)return;const s=orderStatus(o);openDialog(`<div class="page-kicker">${o.mode==='live'?'ЗАЯВКА':'ТЕСТОВАЯ ЗАЯВКА'} / ${escape(o.id.slice(-6).toUpperCase())}</div><h2 id="dialogTitle">${orderName(o)}</h2><span class="status-badge status-${s}">${s==='confirmed'&&o.kind==='delivery'?'Подтверждена':statuses[s]}${o.mode==='live'?'':' · тест'}</span>${detailRows(o)}<dl class="detail-grid"><div class="detail-row"><dt>Создана</dt><dd>${when(o.createdAt)}</dd></div>${o.kind==='truck'?`<div class="detail-row"><dt>Срок до</dt><dd>${when(C.expiration(o))}</dd></div><div class="detail-row"><dt>Осталось</dt><dd data-countdown="${o.id}">${s==='cancelled'?'Отменена':C.remaining(o,Date.now()+clockOffset)}</dd></div>`:''}</dl><div class="demo-note"><span>◉</span><p><strong>${o.mode==='live'?'Сохранено на сервере':'Это не реальная бронь'}</strong>${o.server?(o.mode==='live'?(o.notification==='sent'?'Уведомление доставлено в Telegram менеджера.':'Уведомление менеджеру ожидает отправки.'):'Заявка хранится в тестовой базе. Менеджер её не получает.'):'Статусы существуют только в браузере. Менеджер не получает эти данные.'}</p></div><p id="dialogError" class="form-error" role="alert"></p>${o.kind!=='legacy'?`<button class="primary-btn" data-repeat="${o.id}">Повторить заявку →</button>`:''}${o.mode!=='live'&&s==='pending'?`<button class="secondary-btn" data-simulate="${o.id}">Тест: смоделировать подтверждение</button><button class="secondary-btn danger" data-reject="${o.id}">Тест: отклонить заявку</button>`:''}${['pending','confirmed'].includes(s)?`<button class="secondary-btn danger" data-cancel-order="${o.id}">Отменить заявку</button>`:''}`);$('orderDialog').dataset.orderId=id;if(o.server)refreshDetails(id);}
 async function changeOrder(id,newStatus){const o=findOrder(id);if(o?.server){try{const r=await request('/api/orders/'+id+'/'+(newStatus==='cancelled'?'cancel':'simulate'),{method:'POST',body:newStatus==='cancelled'?{}:{status:newStatus}});remote.orders=remote.orders.map(x=>x.id===id?r.order:x);renderOrders();details(id);toast(o.mode==='live'?'Статус обновлён на сервере.':'Тестовый статус обновлён в базе. Реальной брони нет.');}catch(e){if($('dialogError'))$('dialogError').textContent=e.message;}return;}if(!o)return;if(newStatus==='confirmed'&&orderStatus(o)!=='pending'){toast('Срок истёк или заявка уже изменена. Создайте новую.');details(id);return;}try{persist({...state,orders:state.orders.map(x=>x.id===id?{...x,status:newStatus}:x)});renderOrders();details(id);toast(newStatus==='confirmed'?'Подтверждение смоделировано. Реальной брони нет.':'Тестовая заявка отменена.');}catch(e){$('dialogError').textContent='Не удалось сохранить статус. Попробуйте ещё раз.';}}
 function repeat(id){const o=findOrder(id);if(!o||o.kind==='legacy')return;closeDialog();if(o.kind==='truck'){$('truckBrand').value=o.brand;$('truckPlate').value=o.plate;$('truckLiters').value=o.liters;choosePoint(o.pointId);clearErrors('truck');go('booking');}else{fuel=o.fuel;fullTank=!!o.fullTank;$('deliveryLiters').value=o.liters||50;$('deliveryAddress').value=o.address;$('deliveryPhone').value=o.phone;$('deliveryComment').value=o.comment||'';geo=o.geo||null;updateGeoStatus();clearErrors('delivery');updateDelivery();go('delivery');}toast('Данные заполнены. Проверьте их перед новой заявкой.');}
 function tick(){let expiredChange=false;document.querySelectorAll('[data-countdown]').forEach(el=>{const o=findOrder(el.dataset.countdown);if(o){const s=orderStatus(o);el.textContent=s==='cancelled'?'Отменена':C.remaining(o,Date.now()+clockOffset);if(s==='expired'&&el.closest('.order-card')?.querySelector('.status-pending,.status-confirmed'))expiredChange=true;}});if(expiredChange&&current==='orders')renderOrders();const d=$('orderDialog');if(d.open&&d.dataset.orderId){const o=findOrder(d.dataset.orderId);if(o&&orderStatus(o)==='expired'&&!d.querySelector('.status-expired'))details(o.id);}}
 function updateGeoStatus(){ $('geoStatus').textContent=geo?`Геолокация добавлена: ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}. Адрес обязателен.`:'Необязательно. Адрес всё равно нужно указать.';$('locateMe').textContent=geo?'× Удалить геолокацию':'⌖ Добавить мою геолокацию'; }
 function locate(){
  if(geo){geo=null;updateGeoStatus();return;}
  if(!navigator.geolocation){$('geoStatus').textContent='Геолокация недоступна в этом браузере. Укажите адрес вручную.';return;}
  const b=$('locateMe');b.disabled=true;$('geoStatus').textContent='Запрашиваем разрешение на геолокацию…';
  navigator.geolocation.getCurrentPosition(pos=>{geo={lat:pos.coords.latitude,lng:pos.coords.longitude};b.disabled=false;updateGeoStatus();saveDraft();},err=>{b.disabled=false;$('geoStatus').textContent=err.code===1?'Доступ к геолокации не разрешён. Просто укажите адрес вручную.':'Не удалось определить местоположение. Укажите адрес вручную.';},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});
 }
 function saveDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(()=>{try{if(!storageBroken)sessionStorage.setItem(DRAFT_KEY,JSON.stringify({truck:truckData(),delivery:deliveryData(),remember:$('saveTruck').checked}));}catch(e){/* A draft is optional; orders report durable-storage errors separately. */}},250);}
 function restoreDraft(){
  if(state.truck){$('truckBrand').value=state.truck.brand||'';$('truckPlate').value=state.truck.plate||'';}
  try{const d=JSON.parse(sessionStorage.getItem(DRAFT_KEY)||'null');if(!d)return;if(d.truck){const t=d.truck;if(C.points.some(p=>p.id===t.pointId))selected=t.pointId;$('pointSelect').value=selected;if(t.liters>=50&&t.liters<=600)$('truckLiters').value=t.liters;$('truckBrand').value=String(t.brand||'').slice(0,60);$('truckPlate').value=String(t.plate||'').slice(0,20);}$('saveTruck').checked=d.remember!==false;if(d.delivery){const x=d.delivery;fuel=['АИ-95','АИ-98','ДТ'].includes(x.fuel)?x.fuel:'АИ-95';fullTank=!!x.fullTank;if(x.liters>=10&&x.liters<=200)$('deliveryLiters').value=x.liters;$('deliveryAddress').value=String(x.address||'').slice(0,240);$('deliveryPhone').value=String(x.phone||'').slice(0,24);$('deliveryComment').value=String(x.comment||'').slice(0,500);geo=x.geo&&Number.isFinite(x.geo.lat)&&Number.isFinite(x.geo.lng)?x.geo:null;}}catch(e){/* Ignore invalid session draft without modifying durable orders. */}
 }
 function clearDataDialog(){openDialog('<div class="page-kicker">ЛОКАЛЬНЫЕ ДАННЫЕ</div><h2 id="dialogTitle">Очистить демоданные?</h2><p class="lead">Удалятся заявки новой версии, грузовик и черновики в этом браузере. Старый архив прототипа сохранится.</p><p id="dialogError" class="form-error" role="alert"></p><button class="primary-btn danger" id="confirmClear">Да, удалить демоданные</button><button class="secondary-btn" id="editOrder">Оставить данные</button>');}
 function clearData(){try{localStorage.removeItem(KEY);sessionStorage.removeItem(DRAFT_KEY);state={version:3,orders:[],truck:null};storageBroken=false;$('storageBanner').hidden=true;$('truckBrand').value='';$('truckPlate').value='';$('deliveryAddress').value='';$('deliveryPhone').value='';$('deliveryComment').value='';geo=null;updateGeoStatus();closeDialog();renderOrders();toast('Локальные данные новой демоверсии удалены.');}catch(e){$('dialogError').textContent='Браузер не разрешил очистку. Используйте настройки сайта.';}}
 function updateViewport(){const vv=window.visualViewport,base=window.innerHeight,keyboard=!!(vv&&base-vv.height>130);document.body.classList.toggle('keyboard-open',keyboard);const h=document.querySelector('.app-header').getBoundingClientRect().height;document.documentElement.style.setProperty('--app-header-height',h+'px');if(vv)document.documentElement.style.setProperty('--visual-height',vv.height+'px');}
 let telegramBound=false;
 function telegram(){
  const tg=window.Telegram?.WebApp;if(!tg||telegramBound)return;telegramBound=true;
  const sync=()=>{document.documentElement.style.setProperty('--tg-safe-top',(tg.safeAreaInset?.top||0)+'px');document.documentElement.style.setProperty('--tg-content-top',(tg.contentSafeAreaInset?.top||0)+'px');document.documentElement.style.setProperty('--tg-safe-bottom',(tg.safeAreaInset?.bottom||0)+'px');if(tg.colorScheme)document.documentElement.dataset.telegramTheme=tg.colorScheme;updateViewport();};
  try{tg.ready();tg.expand();if(tg.isVersionAtLeast?.('6.1')){tg.setHeaderColor('#0d1520');tg.setBackgroundColor('#0d1520');}['themeChanged','viewportChanged','safeAreaChanged','contentSafeAreaChanged'].forEach(event=>tg.onEvent(event,sync));const supportsBack=!!tg.isVersionAtLeast?.('6.1');if(supportsBack)tg.BackButton?.onClick(()=>{if($('orderDialog').open)closeDialog();else go('home');});const backSync=()=>{if(!supportsBack)return;if(current==='home')tg.BackButton?.hide();else tg.BackButton?.show();};window.addEventListener('qf:navigate',backSync);sync();backSync();}catch(e){/* Telegram enhancements must never block the browser demo. */}
 }

 function syncClock(value){const t=Date.parse(value);if(Number.isFinite(t))clockOffset=t-Date.now();}
 async function request(path,{method='GET',body,key,anonymous=false}={}){
  const headers={};if(body!==undefined)headers['Content-Type']='application/json';if(!anonymous&&remote.token)headers.Authorization='Bearer '+remote.token;if(key)headers['Idempotency-Key']=key;
  let response;try{response=await fetch(API+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000),cache:'no-store',credentials:'omit'});}catch{throw Error('Нет связи с сервером. Проверьте интернет. Повторная отправка с теми же данными не создаст дубликат.');}
  let data;try{data=await response.json();}catch{throw Error('Сервер вернул неверный ответ. Повторите позже.');}if(!response.ok){if(response.status===401)remote.ready=false;throw Error(data.error||'Не удалось выполнить запрос.');}return data;
 }
 function modeUI(){
  const text=modeNote();document.querySelector('.demo-badge').textContent=modeLabel()+' · V3';
  $('serverNotice').hidden=!API;$('serverNotice').innerHTML=API?`<strong>${modeLabel()}</strong><br>${escape(remote.error||text)}${!remote.ready?'<button id="retryServer">Повторить подключение</button>':''}`:'';
  for(const id of ['home','orders']){const note=$(id).querySelector('.demo-note p');if(note)note.innerHTML=`<strong>${modeLabel()}</strong>${escape(text)}`;}
  document.querySelectorAll('.form-disclaimer').forEach(el=>el.textContent=text);
  const expiry=$('about').querySelector('.accordion div p');if(expiry)expiry.textContent='24 часа с первоначального создания заявки. Подтверждение не сдвигает срок. В серверном режиме срок и статус проверяются по часам сервера.';
 }
 async function bootstrap(){
  if(!API){modeUI();loadPrices();return;}
  remote.ready=false;remote.error='Подключаем тестовый сервер…';modeUI();
  try{
   const config=await request('/api/config',{anonymous:true});remote.config=config;remote.mode=config.mode;syncClock(config.serverNow);
   if(!config.database)throw Error('Тестовый сервер доступен, но база ещё не подключена. Отправка заявок отключена.');
   remote.token=localStorage.getItem(SESSION_KEY)||'';
   if(remote.token){try{await request('/api/profile');}catch(e){if(remote.ready===false&&(e.message.includes('Сеанс')||e.message.includes('сеанс')))remote.token='';else throw e;}}
   if(!remote.token){const initData=config.telegramConfigured?(window.Telegram?.WebApp?.initData||''):'';const session=await request('/api/session',{method:'POST',body:initData?{initData}:{},anonymous:true});remote.token=session.token;localStorage.setItem(SESSION_KEY,session.token);}
   const {profile}=await request('/api/profile');if(!sessionStorage.getItem(DRAFT_KEY)){if(profile.truck){$('truckBrand').value=profile.truck.brand;$('truckPlate').value=profile.truck.plate;}if(profile.phone)$('deliveryPhone').value=profile.phone;if(profile.address)$('deliveryAddress').value=profile.address;}
   remote.ready=true;remote.error='';await refreshRemote();modeUI();
  }catch(e){remote.ready=false;remote.error=e.message;modeUI();}
  loadPrices();
 }
 async function refreshRemote(){try{const r=await request('/api/orders');remote.orders=r.orders;remote.mode=r.mode;syncClock(r.serverNow);remote.error='';renderOrders();modeUI();}catch(e){remote.error='Не удалось обновить историю: '+e.message;modeUI();}}
 async function refreshDetails(id){try{const r=await request('/api/orders/'+id);syncClock(r.serverNow);remote.orders=remote.orders.map(o=>o.id===id?r.order:o);if($('orderDialog').dataset.orderId!==id)return;const old=$('serverEvents');if(old)old.remove();$('dialogBody').insertAdjacentHTML('beforeend',`<div id="serverEvents"><p class="input-note">Полный номер: ${escape(id)}</p><h3>История статусов</h3>${(r.order.events||[]).map(e=>`<p class="input-note">${when(e.createdAt)} · ${escape(statuses[e.status]||e.status)} · ${e.actor==='test-client'?'тест':e.actor.startsWith('manager:')?'менеджер':'сервер / клиент'}</p>`).join('')}</div>`);}catch(e){if($('orderDialog').dataset.orderId===id)$('dialogError').textContent=e.message;}}
 async function loadPrices(){
  const seq=++priceRequest;const region=$('priceRegionSelect').value;$('priceFeedStatus').textContent='Проверяем источники…';$('refreshPrices').disabled=true;
  try{if(!API)throw Error('Серверный прокси цен ещё не подключён.');const data=await request('/api/prices?region='+region,{anonymous:true});if(seq!==priceRequest)return;
   $('priceCards').innerHTML=data.items.map(item=>{let q=null;if(item.available)try{q=C.priceFromMarket(item,Date.now()+clockOffset);}catch{}return `<article class="price-card"><h3>${escape(item.fuel==='ДТ'?'Дизель':item.fuel)}</h3><strong>${q?q.price.toFixed(2)+' ₽/л':'Цена уточняется'}</strong>${q?`<div class="price-market">Рынок ${q.marketPrice.toFixed(2)} ₽/л − 3 ₽/л</div><small>${escape(data.region)} · ${escape(q.source)}<br>Данные: ${when(q.observedAt)}</small>`:`<small>${escape(data.region)} · ${item.fuel==='АИ-98'?'Нет надёжной котировки АИ-98':'Нет свежей региональной котировки'}</small>`}</article>`;}).join('');
   $('priceFeedStatus').innerHTML=`Проверка: ${when(data.checkedAt)} · кеш до 1 часа. Данные старше 24 часов не используются.<br>`+data.sources.map(source=>`<span class="price-source">${escape(source.name)}: ${source.reachable?'источник ответил':'недоступен'}${source.sourceUpdatedAt?' · дата данных '+when(source.sourceUpdatedAt):' · дата котировки отсутствует'}</span>`).join('<br>');
   document.querySelector('.price-empty').hidden=true;$('priceState').innerHTML='<span class="state-icon">i</span><div><strong>Проверенные данные</strong><p>'+escape(data.notice)+'</p></div>';
  }catch(e){if(seq!==priceRequest)return;$('priceCards').innerHTML=['АИ-95','АИ-98','Дизель'].map(f=>`<article class="price-card"><h3>${f}</h3><strong>Цена уточняется</strong></article>`).join('');$('priceFeedStatus').textContent=e.message;}
  finally{if(seq===priceRequest)$('refreshPrices').disabled=false;}
 }
 $('priceRegionSelect').addEventListener('change',loadPrices);$('refreshPrices').addEventListener('click',loadPrices);
 document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.go)go(b.dataset.go);
  if(b.dataset.action==='open-booking')go('booking');
  if(b.dataset.action==='booking-map'){choosePoint($('pointSelect').value);go('points');}
  if(b.dataset.action==='clear-data')clearDataDialog();
  if(b.dataset.bookPoint)choosePoint(b.dataset.bookPoint,{openBooking:true});
  if(b.dataset.truckLiters){$('truckLiters').value=b.dataset.truckLiters;updateTruck();saveDraft();}
  if(b.dataset.deliveryLiters){$('deliveryLiters').value=b.dataset.deliveryLiters;fullTank=false;updateDelivery();saveDraft();}
  if(b.dataset.fuel){fuel=b.dataset.fuel;updateDelivery();saveDraft();}
  if(b.dataset.filter){filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderOrders();}
  if(b.dataset.details)details(b.dataset.details);
  if(b.dataset.repeat)repeat(b.dataset.repeat);
  if(b.dataset.simulate)changeOrder(b.dataset.simulate,'confirmed');if(b.dataset.reject)changeOrder(b.dataset.reject,'rejected');
  if(b.dataset.cancelOrder)changeOrder(b.dataset.cancelOrder,'cancelled');
  if(b.id==='confirmOrder')saveOrder();if(b.id==='retryServer')bootstrap();
  if(b.id==='confirmClear')clearData();
  if(['closeDialog','editOrder'].includes(b.id))closeDialog();
 });
 $('bookingForm').addEventListener('submit',e=>{e.preventDefault();review('truck');});$('deliveryForm').addEventListener('submit',e=>{e.preventDefault();review('delivery');});
 $('pointSelect').addEventListener('change',()=>{choosePoint($('pointSelect').value);saveDraft();});$('truckLiters').addEventListener('input',()=>{updateTruck();saveDraft();});$('deliveryLiters').addEventListener('input',()=>{fullTank=false;updateDelivery();saveDraft();});$('fullTank').addEventListener('click',()=>{fullTank=!fullTank;updateDelivery();saveDraft();});$('locateMe').addEventListener('click',locate);$('fitMap').addEventListener('click',fitMap);
 document.querySelectorAll('input,textarea').forEach(input=>input.addEventListener('input',saveDraft));
 $('orderDialog').addEventListener('cancel',e=>{e.preventDefault();closeDialog();});$('orderDialog').addEventListener('close',()=>{document.body.classList.remove('dialog-open');delete $('orderDialog').dataset.orderId;});
 window.addEventListener('popstate',()=>{if($('orderDialog').open)closeDialog();go(location.hash.slice(1),{history:false});});
 window.addEventListener('storage',event=>{if(event.key===KEY){storageBroken=false;readState();if(!storageBroken)$('storageBanner').hidden=true;renderOrders();}});
 window.addEventListener('resize',updateViewport);window.visualViewport?.addEventListener('resize',updateViewport);
 if(window.ResizeObserver)new ResizeObserver(()=>{if(current==='delivery')document.documentElement.style.setProperty('--delivery-volume-height',$('deliveryVolumePanel').getBoundingClientRect().height+'px');}).observe($('deliveryVolumePanel'));
 $('telegramSdk')?.addEventListener('load',telegram);
 readState();renderPoints();restoreDraft();choosePoint(selected);updateTruck();updateDelivery();updateGeoStatus();renderOrders();telegram();go(location.hash.slice(1)||'home',{history:false,focus:false});setInterval(tick,1000);bootstrap();setInterval(()=>{if(remote.ready&&!document.hidden)refreshRemote();},20000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&remote.ready)refreshRemote();});
})();
