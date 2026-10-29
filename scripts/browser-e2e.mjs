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
async function key(key, expected){await page.keyboard.down(key);await contains('#movementStatus',`${expected} accepted`);}
try {
    const response=await page.goto(base+'/'); assert.equal(response.status(),200);
    await contains('#movementStatus','Ready for keyboard control');
    assert.equal(await page.locator('#SignIn, #SignOut, #authStatus').count(),0);
    assert.equal(await page.locator('#CaptureData').isEnabled(),true);
    // First capture and movement share a single CSRF bootstrap and anonymous session.
    let csrfRequests=0;
    page.on('request',request=>{
        if(new URL(request.url()).pathname==='/csrf') csrfRequests++;
        assert.equal(request.headers()['x-device-token'],undefined);
    });
    await Promise.all([page.locator('#CaptureData').click(), key('w','FORWARD')]);
    await page.keyboard.up('w'); await contains('#movementStatus','STOP accepted');
    await page.waitForFunction(()=>!document.querySelector('#CaptureData').disabled);
    await contains('#sensorStatus','Software simulated measurements');
    assert.equal(csrfRequests,1);
    const cookie=(await context.cookies()).find(c=>c.name==='JSESSIONID');
    assert.equal(cookie.httpOnly,true); assert.equal(cookie.sameSite,'Strict');
    const noCsrf=await context.request.post(base+'/movement/session'); assert.equal(noCsrf.status(),403);
    await key('w','FORWARD'); await key('a','LEFT');
    await page.keyboard.up('a'); await contains('#movementStatus','FORWARD accepted');
    await page.keyboard.up('w'); await contains('#movementStatus','STOP accepted');
    for (const [letter,command] of [['s','BACKWARD'],['d','RIGHT']]) {
        await key(letter,command); await page.keyboard.up(letter); await contains('#movementStatus','STOP accepted');
    }
    // Exercise STOP while a key is held, then ensure release cannot restart movement.
    await key('w','FORWARD'); await page.locator('#StopMovement').click();
    await contains('#movementStatus','STOP accepted'); await page.keyboard.up('w');
    // Repeated keydown while physically held must not restart after emergency STOP.
    const stoppedCount=movement.length;
    await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'w',repeat:true,bubbles:true})));
    await page.waitForTimeout(350); assert.equal(movement.length,stoppedCount);
    // Heartbeats keep a held direction alive past the firmware watchdog window.
    await key('w','FORWARD'); await page.waitForTimeout(3200);
    assert.ok(movement.filter(r=>r.command==='FORWARD').length>=10);
    await page.keyboard.up('w'); await contains('#movementStatus','STOP accepted');
    // Browser blur clears held keys; restoring focus does not restart.
    await key('a','LEFT'); await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    await contains('#movementStatus','STOP accepted');
    const blurCount=movement.length; await page.waitForTimeout(350); assert.equal(movement.length,blurCount);
    await page.keyboard.up('a');
    await key('w','FORWARD');
    // An editable dashboard field must stop control and ignore WASD typing.
    await page.evaluate(()=>{const input=document.createElement('input');input.id='test-text-field';document.body.append(input);input.focus();});
    await contains('#movementStatus','STOP accepted');
    const count=movement.length; await page.locator('#test-text-field').pressSequentially('wasd');
    assert.equal(movement.length,count); await page.locator('#test-text-field').evaluate(el=>el.remove());
    // Delay a real acquisition response until after release; only STOP may follow it.
    let releaseAcquisition, acquisitionArrived;
    const arrival=new Promise(resolve=>{acquisitionArrived=resolve;});
    const gate=new Promise(resolve=>{releaseAcquisition=resolve;});
    await page.route('**/movement/session',async route=>{
        const response=await route.fetch(); acquisitionArrived(); await gate; await route.fulfill({response});
    });
    const acquireCount=movement.length;
    await page.keyboard.down('w'); await arrival; await page.keyboard.up('w');
    releaseAcquisition(); await contains('#movementStatus','STOP accepted');
    assert.deepEqual(movement.slice(acquireCount).map(r=>r.command),['STOP']);
    await page.unroute('**/movement/session');
    // Hold FORWARD before forwarding to Spring so STOP wins the race and FORWARD gets 409.
    let releaseMove, moveArrived;
    const moveArrival=new Promise(resolve=>{moveArrived=resolve;});
    const moveGate=new Promise(resolve=>{releaseMove=resolve;});
    await page.route('**/movement',async route=>{
        if(route.request().postDataJSON().command==='FORWARD'){moveArrived();await moveGate;}
        await route.continue();
    });
    await page.keyboard.down('w'); await moveArrival; await page.keyboard.up('w');
    await contains('#movementStatus','STOP accepted');
    const rejected=page.waitForResponse(r=>new URL(r.url()).pathname==='/movement' && r.status()===409);
    releaseMove();await rejected;await page.waitForTimeout(100);
    assert.match(await text('#movementStatus'),/STOP accepted/);
    await page.unroute('**/movement');
    // Genuine short presses through the complete stack, followed by fresh actions.
    for(const letter of ['w','a','s','d']){
        await page.keyboard.down(letter);await page.waitForTimeout(50);await page.keyboard.up(letter);
        await contains('#movementStatus','STOP accepted');
    }
    // All editable targets ignore robot keys; entering them also cancels movement.
    for(const tag of ['textarea','div']){
        await page.evaluate(tag=>{const el=document.createElement(tag);el.id='editable-test';if(tag==='div')el.contentEditable='true';document.body.append(el);el.focus();},tag);
        const before=movement.length;await page.locator('#editable-test').pressSequentially('wasd');
        assert.equal(movement.length,before);await page.locator('#editable-test').evaluate(el=>el.remove());
    }
    await key('w','FORWARD');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    await contains('#movementStatus','STOP accepted');
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    await page.keyboard.up('w');
    const captureResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/sensors/capture');
    await page.locator('#CaptureData').click();
    assert.equal(await text('#buttonText'),'Capturing…');
    const capture=await (await captureResponse).json();
    assert.equal(capture.predictionStatus,'SUCCEEDED'); assert.equal(capture.simulated,true); assert.ok(capture.id);
    await contains('#sensorStatus','Software simulated measurements');
    await contains('#prediction',capture.prediction);
    const latest=await (await context.request.get(base+'/sensors')).json();
    assert.equal(latest.id,capture.id); assert.equal(latest.prediction,capture.prediction);
    await page.reload(); await contains('#prediction',capture.prediction);
    // Explicit UI fixture for mixed physical/demo provenance; no claim of hardware measurement.
    await page.route('**/sensors/capture', route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...capture,temperatureSource:'dht11',humiditySource:'dht11',phSource:'potentiometer'})}));
    await page.locator('#CaptureData').click();
    await contains('#sensorStatus','pH (potentiometer simulation)');
    await contains('#sensorStatus','Temperature: dht11; humidity: dht11');
    await page.waitForFunction(()=>!document.querySelector('#CaptureData').disabled);
    await page.unroute('**/sensors/capture');
    // Failure rendering uses a deliberately failed transport; successful paths above are unmocked.
    await page.route('**/sensors/capture',route=>route.fulfill({status:504,contentType:'application/problem+json',body:'{"status":504}'}));
    await page.locator('#CaptureData').click(); await contains('#sensorStatus','Device timed out');
    await page.waitForFunction(()=>!document.querySelector('#CaptureData').disabled);
    await page.unroute('**/sensors/capture');
    await page.route('**/movement/session',route=>route.fulfill({status:502,contentType:'application/problem+json',body:'{"status":502}'}));
    await page.keyboard.down('w'); await contains('#movementStatus','Device unreachable');
    const failureCount=movement.length; await page.waitForTimeout(400); assert.equal(movement.length,failureCount);
    await page.keyboard.up('w'); await page.unroute('**/movement/session');
    // A movement transport failure clears held keys and must survive the cleanup STOP ack.
    await page.route('**/movement',route=>route.request().postDataJSON().command==='FORWARD'
        ? route.abort('failed') : route.continue());
    await page.keyboard.down('w'); await contains('#movementStatus','Connection lost');
    await contains('#movementStatus','STOP accepted');
    const failedMovementCount=movement.length;
    await page.keyboard.down('w');await page.waitForTimeout(350);
    assert.equal(movement.length,failedMovementCount);
    await page.keyboard.up('w');await page.unroute('**/movement');
    await key('a','LEFT');await page.keyboard.up('a');await contains('#movementStatus','STOP accepted');
    assert.equal(await page.locator('#CaptureData').isEnabled(),true);
    assert.deepEqual(errors,[]);
    // Dashboard screenshots contain no secret fields.
    if(process.env.PLANT_SCREENSHOT_DIR){mkdirSync(process.env.PLANT_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:process.env.PLANT_SCREENSHOT_DIR+'/dashboard.png',fullPage:true});}
    console.log('PASS browser E2E: anonymous dashboard, CSRF, cookies, WASD, priority/release, STOP, heartbeats, blur, typing guard, capture, real ML, persisted reload, errors');
} finally { await context.close(); await browser.close(); }
