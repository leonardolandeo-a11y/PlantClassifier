import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),headless:true,args:['--no-sandbox']});
try {
const page = await browser.newPage(); const errors=[]; page.on('pageerror', e=>errors.push(e.message));
const data={id:1,temperature:25,humidity:60,ph:6.5,soilMoisture:45,soilStatus:'calibrated',capturedAt:'2026-11-11T16:00:00Z',simulated:true,prediction:'melón',predictionStatus:'SUCCEEDED',predictionModel:'synthetic-five-crops-v2'};
let calls=[]; let captures=0;
await page.route('**/*', async route=>{
 const path=new URL(route.request().url()).pathname;
 let body;
 if(path==='/csrf') body={headerName:'X-CSRF-TOKEN',token:'fixture'};
 else if(path==='/sensors'||path==='/sensors/capture') { if(path==='/sensors/capture') captures++; body=data; }
 else if(path.startsWith('/sensor-servo')) {calls.push(route.request().postDataJSON()); body={angle:100,state:'holding',epoch:1,deviceTimeMs:0};}
 else if(path==='/movement/session') body={sessionId:'a'.repeat(32),protocolVersion:2};
 else if(path==='/movement') {const r=route.request().postDataJSON();calls.push(r);body={...r,status:'OK',simulated:true,protocolVersion:2};}
 else return route.continue();
 return route.fulfill({json:body});
});
await page.goto(process.env.PLANT_UI_URL ?? 'http://127.0.0.1:5173');
await page.getByRole('heading',{name:'Melón',exact:true}).waitFor();
assert.equal(await page.locator('nav button').count(),2);
await page.getByRole('button',{name:'Capturar datos',exact:true}).click();
await page.getByRole('heading',{name:'Melón',exact:true}).waitFor();
assert.equal(captures,1);
for(const width of [1440,390,320]){
 await page.setViewportSize({width,height:950});
 await page.getByRole('button',{name:'Datos',exact:true}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:`/tmp/plant-datos-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Movimiento',exact:true}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:`/tmp/plant-movimiento-${width}.png`,fullPage:true});
}
const navigationStart=calls.length;
await page.keyboard.down('w');
await page.waitForFunction(()=>document.querySelector('#movementStatus').textContent.includes('FORWARD accepted'));
await page.keyboard.down('e');
await page.waitForFunction(()=>document.querySelector('.servo-reading').textContent.includes('100°'));
await page.getByRole('button',{name:'Datos',exact:true}).click();
await page.keyboard.up('w'); await page.keyboard.up('e');
await page.waitForTimeout(100);
assert.ok(calls.slice(navigationStart).some(c=>c?.command==='STOP'));
assert.ok(calls.slice(navigationStart).some(c=>c?.command==='HOLD'));
assert.deepEqual(errors,[]);
console.log('PASS: 2 tabs, data/result, desktop + 390/320px no overflow, WASD, STOP/HOLD on navigation; mocked API only.');
}finally{await browser.close();}
