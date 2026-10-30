'use strict';
function rub(n){return Number.isSafeInteger(n)?(n/100).toFixed(2)+' ₽':null;}
function text(p){if(!p?.available)return 'Цена: уточняется (официальная котировка отсутствует на момент создания)\n';return `Ориентир: ${rub(p.unitPriceKopecks)}/л\nПредварительная сумма: ${p.totalKopecks===null?'по фактическим литрам':rub(p.totalKopecks)}\nРосстат · Москва · ${p.reportDate}${p.stale?' · УСТАРЕВШИЕ ДАННЫЕ':''}\nРынок ${rub(p.marketPriceKopecks)}/л − 3 ₽/л\nИсточник: ${p.sourceUrl}\nРасчёт: ${p.version}\nОкончательная цена подтверждается менеджером.\n`;}
module.exports={text,rub};
