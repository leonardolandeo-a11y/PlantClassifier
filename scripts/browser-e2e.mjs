// Real browser -> Spring session/CSRF -> authenticated simulated ESP32 -> PostgreSQL -> Python.
// No credentials or device tokens enter test output, screenshots, or traces.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const base = process.env.PLANT_BASE_URL ?? 'http://127.0.0.1:18080';
const device = process.env.PLANT_DEVICE_URL;
assert.ok(device, 'Set PLANT_DEVICE_URL to the verified simulation device URL');
const status = await fetch(device+'/status', {headers:{'X-Device-Token':process.env.DEVICE_TOKEN}});
assert.equal(status.status,200);
const safety = await status.json();
assert.equal(safety.mode,'simulation'); assert.equal(safety.hardwareOutputEnabled,false);
const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
const context = await browser.newContext();
const page = await context.newPage();
const errors=[]; page.on('pageerror',error=>errors.push(error.message));
const movement=[];
page.on('request',request=>{if(new URL(request.url()).pathname==='/movement' && request.method()==='POST') movement.push(request.postDataJSON());});
const text = selector => page.locator(selector).innerText();
async function contains(selector, expected) {
    await page.waitForFunction(([s,t])=>document.querySelector(s)?.textContent?.includes(t), [selector,expected], {timeout:10000});
}
async function acquire(){await page.locator('#AcquireControl').click();await contains('#movementStatus','Control ready');}
async function key(key, expected){await page.keyboard.down(key);await contains('#movementStatus',`${expected} accepted`);}
try {
    let response=await page.goto(base+'/login'); assert.equal(response.status(),200);
    await page.locator('#username').fill('invalid-operator');
    await page.locator('#password').fill('incorrect-test-password');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await contains('[role="alert"]','Invalid username or password');
    assert.equal(movement.length,0);
    await page.locator('#username').fill(process.env.CONTROL_USERNAME);
    await page.locator('#password').fill(process.env.CONTROL_PASSWORD);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.waitForURL(base+'/'); await contains('#authStatus','Signed in as');
    const cookie=(await context.cookies()).find(c=>c.name==='JSESSIONID');
    assert.equal(cookie.httpOnly,true); assert.equal(cookie.sameSite,'Strict');
    const noCsrf=await context.request.post(base+'/movement/session'); assert.equal(noCsrf.status(),403);
    await acquire();
    await key('w','FORWARD'); await key('a','LEFT');
    await page.keyboard.up('a'); await contains('#movementStatus','FORWARD accepted');
    await page.keyboard.up('w'); await contains('#movementStatus','STOP accepted');
    for (const [letter,command] of [['s','BACKWARD'],['d','RIGHT']]) {
        await acquire(); await key(letter,command); await page.keyboard.up(letter); await contains('#movementStatus','STOP accepted');
    }
    // Exercise STOP while a key is held, then ensure release cannot restart movement.
    await acquire(); await key('w','FORWARD'); await page.locator('#StopMovement').click();
    await contains('#movementStatus','STOP accepted'); await page.keyboard.up('w');
    await acquire(); await contains('#movementStatus','Control expired');
    await page.keyboard.press('w'); await contains('#movementStatus','Acquire control before moving');
    // An editable dashboard field must stop control and ignore WASD typing.
    await acquire();
    await page.evaluate(()=>{const input=document.createElement('input');input.id='test-text-field';document.body.append(input);input.focus();});
    await contains('#movementStatus','STOP accepted');
    const count=movement.length; await page.locator('#test-text-field').pressSequentially('wasd');
    assert.equal(movement.length,count); await page.locator('#test-text-field').evaluate(el=>el.remove());
    const captureResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/sensors/capture');
    await page.locator('#CaptureData').click();
    assert.equal(await text('#buttonText'),'Capturing…');
    const capture=await (await captureResponse).json();
    assert.equal(capture.predictionStatus,'SUCCEEDED'); assert.equal(capture.simulated,true); assert.ok(capture.id);
    await contains('#sensorStatus','Simulated measurements');
    await contains('#prediction',capture.prediction);
    const latest=await (await context.request.get(base+'/sensors')).json();
    assert.equal(latest.id,capture.id); assert.equal(latest.prediction,capture.prediction);
    await page.reload(); await contains('#prediction',capture.prediction);
    // Failure rendering uses a deliberately failed transport; successful paths above are unmocked.
    await page.route('**/sensors/capture',route=>route.fulfill({status:504,contentType:'application/problem+json',body:'{"status":504}'}));
    await page.locator('#CaptureData').click(); await contains('#sensorStatus','Device timed out');
    await page.waitForFunction(()=>!document.querySelector('#CaptureData').disabled);
    await page.unroute('**/sensors/capture');
    await page.route('**/movement/session',route=>route.fulfill({status:502,contentType:'application/problem+json',body:'{"status":502}'}));
    await acquireFailed(); await page.unroute('**/movement/session');
    await page.locator('#SignOut').click(); await contains('#authStatus','Sign in to use the controls');
    const protectedRead=await context.request.get(base+'/sensors'); assert.equal(protectedRead.status(),401);
    assert.equal(await page.locator('#CaptureData').isDisabled(),true);
    assert.deepEqual(errors,[]);
    // Logged-out screenshots contain no operator name or secret fields.
    if(process.env.PLANT_SCREENSHOT_DIR){mkdirSync(process.env.PLANT_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:process.env.PLANT_SCREENSHOT_DIR+'/dashboard.png',fullPage:true});await page.goto(base+'/login');await page.screenshot({path:process.env.PLANT_SCREENSHOT_DIR+'/login.png',fullPage:true});}
    console.log('PASS browser E2E: login failure/success, CSRF, cookies, WASD, priority/release, STOP, expiry, typing guard, capture, real ML, persisted reload, errors, logout');
} finally { await context.close(); await browser.close(); }
async function acquireFailed(){await page.locator('#AcquireControl').click();await contains('#movementStatus','Device unreachable');}
