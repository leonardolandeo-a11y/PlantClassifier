import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFileSync, mkdirSync} from 'node:fs';
const base = process.env.PLANT_BASE_URL;
assert.ok(base);
const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
async function contains(selector, text) {
  await page.waitForFunction(([s,t]) => document.querySelector(s)?.textContent?.includes(t), [selector,text]);
}
try {
  assert.equal((await page.goto(base)).status(),200);
  const captured = page.waitForResponse(r => r.url() === base + '/sensors/capture' && r.request().method() === 'POST');
  await page.locator('#CaptureData').click();
  const response = await captured;
  assert.equal(response.status(),200);
  const data = await response.json();
  assert.equal(data.simulated,true);
  assert.equal(data.predictionStatus,'SUCCEEDED');
  assert.equal(data.predictionModel,'synthetic-five-crops-v2');
  assert.ok(data.prediction);
  await contains('#prediction',data.prediction[0].toUpperCase()+data.prediction.slice(1));
  mkdirSync(process.env.DEMO_REPORT, {recursive:true});
  writeFileSync(process.env.DEMO_REPORT+'/capture.json',JSON.stringify(data,null,2));
  await page.screenshot({path:process.env.DEMO_REPORT+'/dashboard.png',fullPage:true});
  await page.getByRole('button',{name:'Movimiento',exact:true}).click();
  await page.keyboard.down('w'); await contains('#movementStatus','FORWARD accepted');
  await page.locator('#StopMovement').click(); await contains('#movementStatus','STOP accepted');
  await page.keyboard.up('w');
  await page.keyboard.down('e'); await contains('.servo-reading','Girando +');
  await page.keyboard.up('e'); await contains('.servo-reading','Detenido');
  await page.screenshot({path:process.env.DEMO_REPORT+'/movement.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS dashboard, capture, Python prediction, simulated movement, STOP and HOLD');
} finally { await browser.close(); }
