'use strict';
const crypto=require('node:crypto');
const C=require('../v3/core.js');
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const token=()=>crypto.randomBytes(32).toString('base64url');
function safeEqual(a,b){const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
class HttpError extends Error{constructor(status,message,code='request_error'){super(message);this.status=status;this.code=code;}}
function validateInitData(raw,botToken,now=Date.now()){
 if(!botToken)throw new HttpError(503,'Вход через Telegram пока не подключён','telegram_unconfigured');
 if(typeof raw!=='string'||!raw||raw.length>8192)throw new HttpError(401,'Некорректные данные Telegram');
 const p=new URLSearchParams(raw),keys=[...p.keys()];if(new Set(keys).size!==keys.length)throw new HttpError(401,'Повторяющиеся поля Telegram');
 const signature=p.get('hash');if(!/^[a-f0-9]{64}$/i.test(signature||''))throw new HttpError(401,'Подпись Telegram отсутствует');
 p.delete('hash');const check=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=crypto.createHmac('sha256','WebAppData').update(botToken).digest();const expected=crypto.createHmac('sha256',secret).update(check).digest('hex');
 if(!safeEqual(expected,signature))throw new HttpError(401,'Подпись Telegram не подтверждена');
 const auth=Number(p.get('auth_date'))*1000;if(!Number.isFinite(auth)||auth>now+30000||now-auth>300000)throw new HttpError(401,'Откройте приложение заново из Telegram');
 let user;try{user=JSON.parse(p.get('user'));}catch{throw new HttpError(401,'Пользователь Telegram не определён');}
 if(!user||!Number.isSafeInteger(user.id)||user.id<=0||user.is_bot)throw new HttpError(401,'Некорректный пользователь Telegram');
 return {telegramId:String(user.id),fingerprint:hash(expected)};
}
function normalizeOrder(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new HttpError(422,'Не переданы данные заявки');
 const keys=['kind','fuel','liters','pointId','brand','plate','address','phone','comment','fullTank','geo'];
 if(Object.keys(input).some(k=>!keys.includes(k)))throw new HttpError(422,'Недопустимые поля заявки');
 const trim=(x,max)=>{if(typeof x!=='string'||x.length>max)return '';return x.trim();};
 let o;
 if(input.kind==='truck'){
  o={kind:'truck',fuel:'ДТ',pointId:trim(input.pointId,50),liters:input.liters,brand:trim(input.brand,60),plate:trim(input.plate,20).toUpperCase()};
  if(input.fuel!=='ДТ')throw new HttpError(422,'Для трассы доступен только дизель');
  const errors=C.validateTruck(o);if(Object.keys(errors).length)throw new HttpError(422,Object.values(errors)[0]);
 }else if(input.kind==='delivery'){
  if(typeof input.fullTank!=='boolean')throw new HttpError(422,'Некорректный режим объёма');
  if(input.geo!==null&&input.geo!==undefined&&(typeof input.geo!=='object'||Array.isArray(input.geo)||Object.keys(input.geo).some(k=>!['lat','lng'].includes(k))))throw new HttpError(422,'Некорректная геолокация');
  if(input.comment!==undefined&&typeof input.comment!=='string')throw new HttpError(422,'Некорректный комментарий');
  if(typeof input.comment==='string'&&input.comment.length>500)throw new HttpError(422,'Комментарий — до 500 символов');
  o={kind:'delivery',fuel:input.fuel,liters:input.fullTank?null:input.liters,fullTank:input.fullTank,address:trim(input.address,240),phone:trim(input.phone,24),comment:trim(input.comment||'',500),geo:input.geo?{lat:input.geo.lat,lng:input.geo.lng}:null};
  const errors=C.validateDelivery(o);if(Object.keys(errors).length)throw new HttpError(422,Object.values(errors)[0]);o.phone=C.phone(o.phone);
 }else throw new HttpError(422,'Неизвестный тип заявки');
 return o;
}
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
module.exports={C,hash,token,safeEqual,HttpError,validateInitData,normalizeOrder,canonical};
