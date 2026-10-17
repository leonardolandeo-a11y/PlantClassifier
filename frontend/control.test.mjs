import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KeyboardState, MovementControl} from '../src/main/resources/static/js/control.js';
const id='a'.repeat(32);
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
const ack=request=>({...request,status:'OK',simulated:true});
test('last pressed key wins and releasing one key preserves the other',()=>{
    const keys=new KeyboardState();
    keys.press('w'); keys.press('a'); assert.equal(keys.command(),'LEFT');
    keys.release('a'); assert.equal(keys.command(),'FORWARD');
    keys.press('d'); keys.release('w'); assert.equal(keys.command(),'RIGHT');
    keys.clear(); assert.equal(keys.command(),'STOP');
});
test('STOP overtakes in-flight movement and late acknowledgement cannot restart pumping',async()=>{
    const calls=[]; let complete;
    const control=new MovementControl({acquire:async()=>({sessionId:id}),send:request=>{
        calls.push(request);
        return request.command==='STOP'?Promise.resolve(ack(request)):new Promise(resolve=>{complete=()=>resolve(ack(request));});
    }},()=>{},()=>{});
    await control.acquire(); control.set('FORWARD'); control.set('RIGHT');
    assert.equal(calls.length,1);
    control.stop(); assert.equal(calls.length,2); assert.equal(calls[1].command,'STOP');
    assert.ok(calls[1].sequence>calls[0].sequence);
    complete(); await tick();
    control.set('FORWARD'); assert.equal(calls.length,2);
});
test('failed command releases keyboard and controller instead of building a backlog',async()=>{
    let failures=0; const calls=[];
    const control=new MovementControl({acquire:async()=>({sessionId:id}),send:async request=>{
        calls.push(request); if(request.command!=='STOP') throw new Error('timeout'); return ack(request);
    }},()=>{},()=>{failures++;});
    await control.acquire(); control.set('FORWARD'); await tick();
    assert.equal(failures,1); assert.deepEqual(calls.map(c=>c.command),['FORWARD','STOP']);
    control.set('FORWARD'); assert.equal(calls.length,2);
});
test('losing focus during acquisition prevents activation',async()=>{
    let complete; const calls=[];
    const control=new MovementControl({acquire:()=>new Promise(resolve=>{complete=resolve;}),send:async request=>{calls.push(request);return ack(request);}},()=>{},()=>{});
    const acquiring=control.acquire(); control.stop(); complete({sessionId:id}); await acquiring;
    control.set('FORWARD'); assert.equal(calls.length,0);
});
