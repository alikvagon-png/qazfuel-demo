'use strict';
// One explicitly marked service test, authorized by the stage-3 acceptance checks.
// Never a live reservation. Immutable idempotency key prevents repeat notifications on deploy.
const KEY='telegram_verification_confirm_price_v1';
async function status(store){const row=(await store.pool.query("SELECT o.payload->'pricing' AS pricing,b.state FROM qf_orders o LEFT JOIN qf_outbox b ON b.order_id=o.id WHERE o.mode='server_test' AND o.idempotency_key=$1 LIMIT 1",[KEY])).rows[0];return {created:!!row,delivered:row?.state==='sent',pricing:row?.pricing||null};}
async function run(store,tg,env=process.env){if(!store||!tg||env.ORDER_INTAKE_ENABLED!=='true'||!await tg.ready())return;const R=require('./rosstat');const quote=await R.latest(store.pool);if(!quote)return;const manager=await store.manager();const user=(await store.pool.query('INSERT INTO qf_users(telegram_id) VALUES($1) ON CONFLICT(telegram_id) DO UPDATE SET telegram_id=excluded.telegram_id RETURNING *',[manager.telegram_id])).rows[0];await store.createOrder(user,{kind:'truck',fuel:'ДТ',pointId:'martuk',liters:100,brand:'ТЕСТ ЦЕН РОССТАТА — НЕ ВЫПОЛНЯТЬ',plate:'TEST 0000'},KEY,'server_test',true);await tg.drain();const result=await status(store);console.log('rosstat_manager_price_check',{delivered:result.delivered,reportDate:result.pricing?.reportDate});}
module.exports={run,status};
