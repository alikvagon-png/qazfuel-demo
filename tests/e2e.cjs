/* QAZFUEL V3 user-journey regression. Hosts v3 locally unless BASE_URL is set.
 * ENGINE=webkit node tests/e2e.cjs
 * BASE_URL=https://your-preview.example ENGINE=webkit node tests/e2e.cjs
 * Requires Playwright and its selected browser engine. No production writes.
 */
const {webkit, chromium, firefox} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const C = require('../v3/core.js');
const base = process.env.BASE_URL || 'http://127.0.0.1:8765';
const engine = process.env.ENGINE || 'webkit';
const out = process.env.QA_OUTPUT || path.join(require('node:os').tmpdir(),'qazfuel-v3-qa');
const KEY = 'qazfuel_v3_state';
let browser,server, checks=0;
const results=[];
const ok=(condition,message)=>{checks++;assert.ok(condition,message);};
const equal=(a,b,message)=>{checks++;assert.deepEqual(a,b,message);};
async function boot(options={}) {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,...options.context});
 const page=await context.newPage(); const errors=[];
 page.setDefaultTimeout(8000);
 await page.route('https://telegram.org/js/telegram-web-app.js',route=>route.abort());
 page.on('pageerror',e=>errors.push(e.message));
 if(options.init)await page.addInitScript(options.init);
 if(options.route)await options.route(page);
 const response=await page.goto(base,{waitUntil:'domcontentloaded'});
 equal(response.status(),200,'app document returns 200');
 await page.locator('#home:not([hidden])').waitFor();
 return {context,page,errors};
}
async function test(name,fn){
 const start=Date.now();let fixture;
 try{fixture=await boot(fn.options||{});await fn(fixture.page,fixture);equal(fixture.errors,[],'no uncaught application JavaScript errors');results.push({name,status:'passed',durationMs:Date.now()-start});console.log('PASS '+name);}
 catch(e){if(fixture)await fixture.page.screenshot({animations:'disabled',path:path.join(out,name.replace(/[^a-z0-9]+/gi,'-')+'.png'),fullPage:true}).catch(()=>{});results.push({name,status:'failed',error:e.stack,durationMs:Date.now()-start});console.log('FAIL '+name+': '+e.message);}
 finally{await fixture?.context.close();}
}
const state=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'{"orders":[]}'),KEY);
const nav=async(page,id)=>{await page.locator(`.bottom-nav [data-go="${id}"]`).click();await page.locator(`#${id}:not([hidden])`).waitFor();};
async function book(page,point='martuk'){
 await page.locator('[data-action="open-booking"]').click();
 await page.locator('#pointSelect').selectOption(point);
 await page.locator('#truckBrand').fill('Volvo FH');await page.locator('#truckPlate').fill('123 ABC 01');
 await page.locator('#bookingForm button[type="submit"]').click();
 await page.locator('#orderDialog[open]').waitFor();
}
(async()=>{
 await fs.mkdir(out,{recursive:true});
 if(!process.env.BASE_URL){
  const root=path.resolve(__dirname,'../v3');
  server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)&&file!==root)throw Error('Invalid path');const target=file===root?path.join(root,'index.html'):file;const content=await fs.readFile(target);res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'})[path.extname(target)]||'application/octet-stream');res.end(content);}catch{res.statusCode=404;res.end('Not found');}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8765,'127.0.0.1',resolve);});
 }
 browser=await ({webkit,chromium,firefox}[engine]).launch({headless:true});
 await test('navigation and keyboard',async page=>{
  await page.screenshot({animations:'disabled',path:path.join(out,'home-390.png')});
  for(const id of ['points','orders','about','home']){await nav(page,id);equal(await page.locator('.view:not([hidden])').count(),1,'one visible screen');equal(await page.locator('.bottom-nav [aria-current="page"]').getAttribute('data-go'),id,'navigation current state');}
  await page.locator('[data-go="prices"]').first().focus();await page.keyboard.press('Enter');await page.locator('#prices:not([hidden])').waitFor();
  await page.locator('#prices [data-go="home"]').click();
  await page.locator('[data-action="open-booking"]').focus();await page.keyboard.press('Enter');
  equal(await page.locator('#bookingTitle').evaluate(el=>document.activeElement===el),true,'heading receives screen focus');
 });
 await test('nine points map coordinates and Yandex routes',async page=>{
  await nav(page,'points');await page.locator('.map-pin').first().waitFor();
  equal(await page.locator('.map-pin').count(),9,'nine map markers');equal(await page.locator('.point-card').count(),9,'nine cards');
  await page.screenshot({animations:'disabled',path:path.join(out,'map-390.png')});
  for(const p of C.points){
   const card=page.locator(`[data-point="${p.id}"]`);
   ok((await card.innerText()).includes(`${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`),p.name+' exact coordinates');
   const href=await card.locator('a.route-link').getAttribute('href');equal(href,C.routeUrl(p),p.name+' route URL');
   const url=new URL(href);equal(url.searchParams.get('rtext'),`~${p.lat},${p.lng}`,'route destination latitude longitude');equal(url.searchParams.get('rtt'),'auto','driving route');
   await card.locator('[data-book-point]').click();equal(await page.locator('#pointSelect').inputValue(),p.id,'point selection transfers to form');await page.locator('#booking [data-go="points"]').click();
  }
  await page.locator('.map-pin[title="Бузулук"]').focus();await page.keyboard.press('Enter');ok((await page.locator('#selectedPoint').innerText()).includes('Бузулук'),'marker selects point card with keyboard');
  await page.locator('#fitMap').click();
 });
 await test('truck validation confirmation deduplication persistence and repeat',async page=>{
  await page.locator('[data-action="open-booking"]').click();await page.locator('#bookingForm button[type="submit"]').click();
  equal(await page.locator('#truckBrand').getAttribute('aria-invalid'),'true','brand required');equal(await page.locator('#truckPlate').getAttribute('aria-invalid'),'true','plate required');equal(await page.locator('#orderDialog[open]').count(),0,'invalid form does not open review');
  await page.locator('#truckBrand').fill('Volvo FH');await page.locator('#truckPlate').fill('123 ABC 01');
  await page.locator('[data-truck-liters="400"]').click();equal(await page.locator('#truckVolume').textContent(),'400','truck quick liters');
  await page.locator('#truckLiters').focus();await page.keyboard.press('ArrowRight');equal(await page.locator('#truckLiters').inputValue(),'410','truck slider keyboard');
  await page.locator('#bookingForm button[type="submit"]').click();equal((await state(page)).orders.length,0,'review is not a saved order');
  await page.locator('#confirmOrder').evaluate(el=>{el.click();el.click();});
  const saved=await state(page);equal(saved.orders.length,1,'double press creates one order');const order=saved.orders[0];equal(order.status,'pending','initial status pending');equal(order.fuel,'ДТ','truck diesel only');equal(order.liters,410,'liters stored');equal(Date.parse(order.expiresAt)-Date.parse(order.createdAt),C.TTL,'24h from creation');
  equal(saved.truck,{brand:'Volvo FH',plate:'123 ABC 01'},'truck remembered');
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#orders:not([hidden])').waitFor();equal(await page.locator('.order-card').count(),1,'history survives reload');
  await page.locator('[data-details]').click();ok((await page.locator('#dialogBody').innerText()).includes('Это не реальная бронь'),'honest demo details');
  await page.locator('[data-simulate]').click();equal((await state(page)).orders[0].status,'confirmed','confirmation simulation');equal((await state(page)).orders[0].createdAt,order.createdAt,'confirmation keeps original creation');equal((await state(page)).orders[0].expiresAt,order.expiresAt,'confirmation never extends expiry');
  await page.locator('#closeDialog').click();await page.locator('#orderList [data-repeat]').click();equal(await page.locator('#truckBrand').inputValue(),'Volvo FH','repeat fills truck');equal(await page.locator('#truckLiters').inputValue(),'410','repeat fills volume');equal((await state(page)).orders.length,1,'repeat requires a new review');
 });
 await test('delivery fuel full tank sticky volume validation and history',async page=>{
  await page.locator('.service-card[data-go="delivery"]').click();
  for(const value of ['АИ-95','АИ-98','ДТ']){await page.locator(`[data-fuel="${value}"]`).click();equal(await page.locator(`[data-fuel="${value}"]`).getAttribute('aria-pressed'),'true','fuel selected');}
  await page.locator('#fullTank').click();equal(await page.locator('#fullTank').getAttribute('aria-pressed'),'true','full tank mode selected');ok((await page.locator('#deliverySummary').innerText()).includes('По фактическим литрам'),'full tank does not invent price');
  await page.locator('#deliveryLiters').focus();await page.keyboard.press('ArrowRight');equal(await page.locator('#fullTank').getAttribute('aria-pressed'),'false','moving slider exits full tank');
  await page.locator('#deliveryForm button[type="submit"]').click();equal(await page.locator('#deliveryAddress').getAttribute('aria-invalid'),'true','address required');equal(await page.locator('#deliveryPhone').getAttribute('aria-invalid'),'true','phone required');
  await page.locator('#deliveryAddress').fill('Москва, улица Тестовая, дом 10');await page.locator('#deliveryPhone').fill('abc12345678901');await page.locator('#deliveryForm button[type="submit"]').click();equal(await page.locator('#deliveryPhone').getAttribute('aria-invalid'),'true','arbitrary phone rejected');
  await page.locator('#deliveryPhone').fill('8 (999) 123-45-67');await page.locator('#deliveryComment').fill('Тестовая заявка QA — локально');
  const bounds=await page.locator('#deliveryVolumePanel').boundingBox();ok(bounds.y>=0&&bounds.y+bounds.height<=844,'volume controls remain visible after scrolling to form end');
  await page.locator('#fullTank').click();await page.locator('#fullTank').click();equal(await page.locator('#fullTank').getAttribute('aria-pressed'),'false','full tank toggles back to liters');await page.locator('#fullTank').click();
  await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('qazfuel_v3_drafts')||'{}').delivery?.fullTank===true);await page.reload({waitUntil:'domcontentloaded'});await page.locator('#delivery:not([hidden])').waitFor();equal(await page.locator('#fullTank').getAttribute('aria-pressed'),'true','full tank draft survives reload');equal(await page.locator('#deliveryAddress').inputValue(),'Москва, улица Тестовая, дом 10','address draft survives reload');equal(await page.locator('#deliveryPhone').inputValue(),'8 (999) 123-45-67','phone draft survives reload');ok(await page.locator('#deliveryLiters').isVisible(),'slider remains visible in full tank mode');
  await page.locator('#deliveryForm button[type="submit"]').click();await page.locator('#confirmOrder').click();
  const order=(await state(page)).orders[0];equal(order.kind,'delivery','delivery stored');equal(order.phone,'+79991234567','phone normalized');equal(order.fullTank,true,'full tank persisted');equal(order.liters,null,'unknown full tank liters stay null');ok(!('plate' in order),'delivery does not require plate');
  await page.locator('[data-details]').click();ok((await page.locator('#dialogBody').innerText()).includes('Тестовая заявка QA'),'comment in details');await page.keyboard.press('Escape');equal(await page.locator('#orderDialog[open]').count(),0,'Escape closes dialog');
  await page.reload({waitUntil:'domcontentloaded'});equal((await state(page)).orders.length,1,'delivery survives reload');
 });
 await test('expired reservations cannot be confirmed',async page=>{
  const createdAt=new Date(Date.now()-C.TTL-2000).toISOString();
  await page.evaluate(({key,createdAt})=>localStorage.setItem(key,JSON.stringify({version:3,orders:[{id:'expired-test',kind:'truck',status:'pending',createdAt,pointId:'martuk',fuel:'ДТ',liters:300,brand:'Volvo',plate:'123 ABC 01'}],truck:null})),{key:KEY,createdAt});
  await page.reload({waitUntil:'domcontentloaded'});await nav(page,'orders');ok((await page.locator('.order-card').innerText()).includes('Срок истёк'),'expired status visible');equal(await page.locator('[data-countdown]').textContent(),'00:00:00','expired countdown zero');await page.locator('[data-details]').click();equal(await page.locator('[data-simulate]').count(),0,'cannot confirm expired order');
 });
 await test('countdown expires confirmed order while details remain open',async page=>{
  const createdAt=new Date(Date.now()-C.TTL+4500).toISOString();
  await page.evaluate(({key,createdAt})=>localStorage.setItem(key,JSON.stringify({version:3,orders:[{id:'near-expiry-test',kind:'truck',status:'confirmed',createdAt,pointId:'martuk',fuel:'ДТ',liters:300,brand:'Volvo',plate:'123 ABC 01'}],truck:null})),{key:KEY,createdAt});
  await page.reload({waitUntil:'domcontentloaded'});await nav(page,'orders');await page.locator('#orderList [data-details]').click();
  await page.waitForFunction(()=>document.querySelector('#orderDialog .status-expired')!==null,null,{timeout:8000});
  ok((await page.locator('#orderDialog .status-badge').innerText()).includes('Срок истёк'),'open confirmed details updates on expiry');equal(await page.locator('#orderDialog [data-countdown]').innerText(),'00:00:00','open dialog countdown reaches zero');
 });
 await test('responsive layouts and persistent delivery slider',async page=>{
  for(const width of [320,390,430,768]){
   await page.setViewportSize({width,height:844});
   for(const screen of ['home','points','orders','about']){await nav(page,screen);ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),screen+' no overflow at '+width);}
   await nav(page,'home');await page.locator('.service-card[data-go="delivery"]').click();await page.locator('#deliveryComment').scrollIntoViewIfNeeded();
   const b=await page.locator('#deliveryVolumePanel').boundingBox();ok(b.y>=0&&b.y+b.height<=844,'sticky volume at '+width);ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'delivery no overflow at '+width);
   await page.screenshot({animations:'disabled',path:path.join(out,`delivery-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:320,height:568});await nav(page,'home');await page.locator('.service-card[data-go="delivery"]').click();
  let b=await page.locator('#deliveryVolumePanel').boundingBox();ok(b.y>=0&&b.y+b.height<568,'volume visible initially on small iPhone');
  await page.locator('#deliveryPhone').scrollIntoViewIfNeeded();b=await page.locator('#deliveryVolumePanel').boundingBox();ok(b.y>=0&&b.y+b.height<568,'volume visible after scrolling small iPhone');
  await page.screenshot({animations:'disabled',path:path.join(out,'delivery-320x568.png')});
 });
 await test('manual price transparent source validation',async page=>{
  await page.locator('[data-go="prices"]').first().click();ok((await page.locator('.price-state').innerText()).includes('недоступны'),'API unavailable state explicit');
  await page.locator('#manualPriceDetails summary').click();await page.locator('#manualPriceForm button').click();ok((await page.locator('#manualPriceError').innerText()).length>0,'source and region required');
  await page.locator('#priceRegion').fill('Москва');await page.locator('#priceSource').fill('Тестовый ручной источник');await page.locator('#priceDate').fill(new Date(Date.now()-60000).toISOString().slice(0,16));await page.locator('#marketPrice').fill('70.50');await page.locator('#manualPriceForm button').click();
  const text=await page.locator('#manualPriceResult').innerText();ok(text.includes('68,5'),'default two ruble discount');ok(text.includes('не применяется к заказам'),'manual calculator cannot set order prices');
 });
 const corrupt=async(page)=>{ok(await page.locator('#storageBanner').isVisible(),'corrupt storage warning');await book(page);};
 corrupt.options={init:()=>localStorage.setItem('qazfuel_v3_state','{broken')};
 await test('corrupted storage preserved and save blocked',async page=>{
  await page.evaluate(key=>localStorage.setItem(key,'{broken'),KEY);await page.reload({waitUntil:'domcontentloaded'});ok(await page.locator('#storageBanner').isVisible(),'corrupt data warning');
  await page.locator('[data-action="open-booking"]').click();await page.locator('#truckBrand').fill('Volvo');await page.locator('#truckPlate').fill('123 ABC 01');await page.locator('#bookingForm button[type="submit"]').click();equal(await page.locator('#orderDialog[open]').count(),0,'save blocked on corrupt state');equal(await page.evaluate(key=>localStorage.getItem(key),KEY),'{broken','corrupt data not overwritten');
 });
 const storageFailure=async page=>{await book(page);await page.locator('#confirmOrder').click();ok((await page.locator('#dialogError').innerText()).includes('Не удалось сохранить'),'storage quota error shown');equal(await page.locator('#orderDialog[open]').count(),1,'form retained after failure');equal(await page.locator('#confirmOrder').isEnabled(),true,'retry enabled');};
 storageFailure.options={init:()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='qazfuel_v3_state')throw new DOMException('Quota exceeded','QuotaExceededError');return original.call(this,key,value);};}};
 await test('storage write failure keeps form and reports error',storageFailure);
 const mapFailure=async page=>{await nav(page,'points');ok(await page.locator('#mapFallback').isVisible(),'map library failure fallback');equal(await page.locator('.point-card').count(),9,'all points accessible without map');await page.locator('[data-book-point="isatay"]').last().click();equal(await page.locator('#pointSelect').inputValue(),'isatay','fallback still books point');};
 mapFailure.options={route:async page=>page.route('**/assets/leaflet.js',r=>r.abort())};
 await test('map dependency failure degrades safely',mapFailure);
 const geolocation=async page=>{
  await page.locator('.service-card[data-go="delivery"]').click();await page.locator('#locateMe').click();ok((await page.locator('#geoStatus').innerText()).includes('не разрешён'),'geolocation denial is recoverable');
  await page.evaluate(()=>{navigator.geolocation.getCurrentPosition=success=>success({coords:{latitude:55.75,longitude:37.61}});});
  await page.locator('#locateMe').click();ok((await page.locator('#geoStatus').innerText()).includes('55.75000'),'synthetic geolocation added');
  await page.locator('#deliveryForm button[type="submit"]').click();equal(await page.locator('#deliveryAddress').getAttribute('aria-invalid'),'true','geolocation does not bypass address requirement');
  await page.locator('#locateMe').click();ok((await page.locator('#geoStatus').innerText()).includes('Необязательно'),'geolocation can be removed');
 };
 geolocation.options={init:()=>{navigator.geolocation.getCurrentPosition=(_success,error)=>error({code:1});}};
 await test('optional geolocation denial success and removal',geolocation);
 const telegram=async page=>{
  let tg=await page.evaluate(()=>({calls:window.__tgCalls,events:Object.keys(window.__tgEvents)}));equal(tg.calls.ready,1,'Telegram ready once');equal(tg.calls.expand,1,'Telegram expanded');ok(tg.events.includes('themeChanged')&&tg.events.includes('viewportChanged'),'Telegram theme and viewport handlers');
  await page.locator('[data-action="open-booking"]').click();equal(await page.evaluate(()=>window.__tgCalls.backVisible),true,'Telegram BackButton on booking');
  await page.evaluate(()=>window.__tgBack());await page.locator('#home:not([hidden])').waitFor();equal(await page.evaluate(()=>window.__tgCalls.backVisible),false,'Telegram BackButton hidden on home');
  await page.evaluate(()=>{Telegram.WebApp.colorScheme='light';window.__tgEvents.themeChanged();});equal(await page.locator('html').getAttribute('data-telegram-theme'),'light','theme event reflected');
  await page.evaluate(()=>{Telegram.WebApp.safeAreaInset={top:24,bottom:34};window.__tgEvents.safeAreaChanged();});equal(await page.locator('html').evaluate(el=>el.style.getPropertyValue('--tg-safe-top')),'24px','safe-area propagated');
 };
 telegram.options={init:()=>{window.__tgCalls={ready:0,expand:0,backVisible:false};window.__tgEvents={};window.Telegram={WebApp:{colorScheme:'dark',safeAreaInset:{top:0,bottom:0},contentSafeAreaInset:{top:0},ready(){window.__tgCalls.ready++},expand(){window.__tgCalls.expand++},isVersionAtLeast(){return true},setHeaderColor(){},setBackgroundColor(){},onEvent(name,cb){window.__tgEvents[name]=cb},BackButton:{onClick(cb){window.__tgBack=cb},show(){window.__tgCalls.backVisible=true},hide(){window.__tgCalls.backVisible=false}}}};}};
 await test('Telegram initialization theme viewport and BackButton',telegram);
 await test('cancel demo and clear local data controls',async page=>{
  await book(page);await page.locator('#confirmOrder').click();await page.locator('#orderList [data-details]').click();await page.locator('[data-cancel-order]').click();equal((await state(page)).orders[0].status,'cancelled','demo cancellation saved');await page.locator('#closeDialog').click();
  await nav(page,'about');await page.getByText('Что сохраняется на устройстве?').click();await page.locator('[data-action="clear-data"]').click();await page.locator('#editOrder').click();equal((await state(page)).orders.length,1,'clear data can be cancelled');
  await page.locator('[data-action="clear-data"]').click();await page.locator('#confirmClear').click();equal(await page.evaluate(key=>localStorage.getItem(key),KEY),null,'new demo data cleared');await nav(page,'orders');equal(await page.locator('.order-card').count(),0,'history empty after clearing');
 });
 await test('history filters isolate truck and delivery',async page=>{
  const createdAt=new Date().toISOString();
  await page.evaluate(({key,createdAt})=>localStorage.setItem(key,JSON.stringify({version:3,truck:null,orders:[{id:'filter-truck',kind:'truck',status:'pending',createdAt,pointId:'martuk',fuel:'ДТ',liters:300,brand:'Volvo',plate:'123 ABC 01'},{id:'filter-delivery',kind:'delivery',status:'pending',createdAt,fuel:'АИ-98',liters:50,fullTank:false,address:'Москва, Тестовая улица, дом 10',phone:'+79991234567',comment:'',geo:null}]})),{key:KEY,createdAt});
  await page.reload({waitUntil:'domcontentloaded'});await nav(page,'orders');equal(await page.locator('.order-card').count(),2,'all filter contains both kinds');
  for(const kind of ['truck','delivery']){await page.locator(`[data-filter="${kind}"]`).click();equal(await page.locator('.order-card').count(),1,'one item in '+kind);equal(await page.locator('.order-card').getAttribute('data-order'),'filter-'+kind,'correct kind shown');equal(await page.locator(`[data-filter="${kind}"]`).getAttribute('aria-pressed'),'true','filter selected');}
  await page.locator('[data-filter="all"]').click();equal(await page.locator('.order-card').count(),2,'all filter restored');
 });
 const reducedMotion=async page=>{
  equal(await page.locator('.bottom-nav button').count(),4,'four navigation entries');for(const label of ['Главная','Точки','Заявки','О нас'])equal(await page.locator('.bottom-nav').getByRole('button',{name:label,exact:true}).count(),1,'navigation label '+label);equal(await page.locator('#home').evaluate(el=>getComputedStyle(el).animationName),'none','reduced motion disables entrance animation');
  await nav(page,'points');equal(await page.locator('#points').evaluate(el=>getComputedStyle(el).animationName),'none','reduced motion follows navigation');
 };
 reducedMotion.options={context:{reducedMotion:'reduce'}};
 await test('reduced motion and navigation labels',reducedMotion);
 await browser.close();
 await new Promise(resolve=>server?server.close(resolve):resolve());
 const report={engine,base,ranAt:new Date().toISOString(),checks,passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,results};await fs.writeFile(path.join(out,'e2e-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.failed)process.exitCode=1;
})().catch(async e=>{await browser?.close();server?.close();console.error(e);process.exitCode=1;});
