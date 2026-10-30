'use strict';
const fs=require('node:fs/promises');const path=require('node:path');const {hash}=require('./security');const UI=require('./bot-ui');
async function syncProfile(tg){
 if(!tg?.env.BOT_TOKEN)return {configured:false};
 const me=await tg.call('getMe',{});if(me.username?.toLowerCase()!=='qazfuelservicebot')throw Error('unexpected_bot_identity');
 const photo=await fs.readFile(path.join(__dirname,'assets/bot-avatar.jpg'));
 const description='QAZFUEL — топливо для вашего маршрута и города. Дизель в 9 точках Казахстана и России, доставка АИ-95, АИ-98 и дизеля по Москве и области. Выберите услугу в меню, оформите заявку и отслеживайте её статус. Наличие, стоимость и условия подтверждает менеджер.';
 const short='Дизель на трассе · Доставка по Москве и области. Заявки, карта и связь с менеджером — в QAZFUEL.';
 const fingerprint=hash(JSON.stringify({appBase:UI.BASE,commands:UI.commands,description,short,avatar:hash(photo.toString('base64')),version:1}));
 const old=await tg.store.pool.query('SELECT profile_hash FROM qf_bot_profiles WHERE bot_id=$1',[me.id]);if(old.rows[0]?.profile_hash===fingerprint)return {configured:true,cached:true};
 await tg.call('setMyCommands',{commands:UI.commands});await tg.call('setChatMenuButton',{menu_button:{type:'web_app',text:'Открыть QAZFUEL',web_app:{url:UI.BASE}}});
 await tg.call('setMyDescription',{description});await tg.call('setMyShortDescription',{short_description:short});
 const form=new FormData();form.set('photo',JSON.stringify({type:'static',photo:'attach://avatar'}));form.set('avatar',new Blob([photo],{type:'image/jpeg'}),'qazfuel.jpg');
 let response;try{response=await tg.fetcher(`https://api.telegram.org/bot${tg.env.BOT_TOKEN}/setMyProfilePhoto`,{method:'POST',body:form,signal:AbortSignal.timeout(20000)});}catch{throw Error('telegram_profile_network_error');}
 const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw Error('telegram_profile_api_error');
 await tg.store.pool.query('INSERT INTO qf_bot_profiles(bot_id,profile_hash) VALUES($1,$2) ON CONFLICT(bot_id) DO UPDATE SET profile_hash=excluded.profile_hash,applied_at=now()',[me.id,fingerprint]);
 return {configured:true,cached:false};
}
module.exports={syncProfile};
