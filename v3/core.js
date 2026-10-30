/* Shared, dependency-free business rules; no network or credentials. */
(function (root) {
  'use strict';
  const TTL = 24 * 60 * 60 * 1000;
  const points = Object.freeze([
    {id:'martuk',name:'Мартук',lat:50.747135,lng:56.477453,country:'Казахстан'},
    {id:'pervomayskiy',name:'Первомайский',lat:51.540006,lng:55.032285,country:'Россия'},
    {id:'sorochinsk',name:'Сорочинск',lat:52.410846,lng:53.166892,country:'Россия'},
    {id:'buzuluk',name:'Бузулук',lat:52.790972,lng:52.179012,country:'Россия'},
    {id:'khlevnoye',name:'Хлевное',lat:52.207447,lng:39.079102,country:'Россия'},
    {id:'yamnoye',name:'Ямное',lat:51.846359,lng:39.213484,country:'Россия'},
    {id:'yashkul',name:'Яшкуль',lat:46.178601,lng:45.366100,country:'Россия'},
    {id:'buruny',name:'Буруны',lat:46.273859,lng:47.261970,country:'Россия'},
    {id:'isatay',name:'Исатай',lat:46.744295,lng:50.104982,country:'Казахстан'}
  ]);
  const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  function routeUrl(point){return `https://yandex.ru/maps/?rtext=~${point.lat},${point.lng}&rtt=auto&z=14`;}
  function status(order,now=Date.now()){
    if(order.server){if(['pending','confirmed'].includes(order.status)&&order.kind==='truck'&&now>=Date.parse(order.expiresAt))return 'expired';return order.status;}
    if(order.kind==='legacy')return 'archived';
    if(['cancelled','rejected'].includes(order.status))return order.status;
    if(order.kind==='truck' && now>=Date.parse(order.createdAt)+TTL)return 'expired';
    return order.status==='confirmed'?'confirmed':'pending';
  }
  function expiration(order){if(order.server)return order.expiresAt||null;return order.kind==='truck'?new Date(Date.parse(order.createdAt)+TTL).toISOString():null;}
  function remaining(order,now=Date.now()){
    const end=expiration(order);if(!end)return '';
    const ms=Math.max(0,Date.parse(end)-now),s=Math.floor(ms/1000);
    return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  }
  function phone(value){
    const trimmed=String(value).trim();
    if(!/^\+?[\d\s()−-]+$/.test(trimmed))return null;
    let digits=trimmed.replace(/\D/g,'');
    if(digits.length===11 && digits[0]==='8')digits='7'+digits.slice(1);
    if(digits.length!==11||digits[0]!=='7')return null;
    return '+'+digits;
  }
  function validateTruck(value){
    const errors={};
    if(!points.some(p=>p.id===value.pointId))errors.pointId='Выберите точку заправки';
    if(!Number.isInteger(value.liters)||value.liters<50||value.liters>600||value.liters%10)errors.liters='Выберите объём от 50 до 600 л с шагом 10 л';
    if(typeof value.brand!=='string'||value.brand.trim().length<2||value.brand.trim().length>60)errors.brand='Укажите марку грузовика, минимум 2 символа';
    if(typeof value.plate!=='string'||!/[\p{L}\d]/u.test(value.plate)||value.plate.trim().length<4||value.plate.length>20||!/^[\p{L}\d\s-]+$/u.test(value.plate))errors.plate='Укажите корректный госномер: буквы и цифры, 4–20 символов';
    return errors;
  }
  function validateDelivery(value){
    const errors={};
    if(!['АИ-95','АИ-98','ДТ'].includes(value.fuel))errors.fuel='Выберите тип топлива';
    if(typeof value.address!=='string'||value.address.trim().length<8||value.address.length>240||!/[\p{L}]/u.test(value.address))errors.address='Укажите город, улицу и дом, минимум 8 символов';
    if(!phone(value.phone))errors.phone='Введите телефон РФ/КЗ: +7 и 10 цифр';
    if(!value.fullTank&&(!Number.isInteger(value.liters)||value.liters<10||value.liters>200||value.liters%5))errors.liters='Объём — от 10 до 200 л с шагом 5 л';
    if(value.geo && (!Number.isFinite(value.geo.lat)||!Number.isFinite(value.geo.lng)||Math.abs(value.geo.lat)>90||Math.abs(value.geo.lng)>180))errors.geo='Некорректная геолокация';
    if(value.comment&&value.comment.length>500)errors.comment='Комментарий — до 500 символов';
    return errors;
  }
  function validateOrder(o){
    if(!o||typeof o!=='object'||typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(o.id)||!validDate(o.createdAt)||!['pending','confirmed','cancelled','rejected'].includes(o.status))return false;
    return o.kind==='legacy' ? typeof o.note==='string' : o.kind==='truck' ? !Object.keys(validateTruck(o)).length : o.kind==='delivery' ? !Object.keys(validateDelivery(o)).length : false;
  }
  const LAUNCH_DISCOUNT_RUB = 3;
  function priceFromMarket(quote,now=Date.now()){
    if(!quote||!['АИ-95','АИ-98','ДТ'].includes(quote.fuel)||quote.currency!=='RUB'||quote.unit!=='liter'||typeof quote.region!=='string'||!quote.region.trim()||typeof quote.source!=='string'||!quote.source.trim())throw Error('Нет подтверждённой региональной котировки API');
    const m=quote.marketPrice,t=Date.parse(quote.observedAt);
    if(!Number.isFinite(m)||m<=LAUNCH_DISCOUNT_RUB||m>999||!Number.isFinite(t)||t>now+60000||(quote.source!=='Росстат'&&now-t>TTL))throw Error('Рыночная цена API недоступна или устарела');
    return {...quote,marketPrice:Math.round(m*100)/100,discount:LAUNCH_DISCOUNT_RUB,price:(Math.round(m*100)-LAUNCH_DISCOUNT_RUB*100)/100,unitPriceKopecks:Math.round(m*100)-LAUNCH_DISCOUNT_RUB*100};
  }
  function initialScreen(hash,query){const allowed=['home','points','orders','about','prices','booking','delivery'];const fragment=String(hash||'').replace(/^#/,'').split(/[?&]/)[0];if(allowed.includes(fragment))return fragment;const screen=new URLSearchParams(query||'').get('screen');return allowed.includes(screen)?screen:'home';}
  const api={initialScreen,TTL,points,routeUrl,status,expiration,remaining,phone,validateTruck,validateDelivery,validateOrder,LAUNCH_DISCOUNT_RUB,priceFromMarket};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.QFCore=api;
})(typeof window!=='undefined'?window:globalThis);
