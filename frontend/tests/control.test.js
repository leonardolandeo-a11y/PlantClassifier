// @vitest-environment node
import {test, vi} from 'vitest';
import assert from 'node:assert/strict';
import {KeyboardState, MovementControl, ControlRejected} from '../src/movement/controller.ts';
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ack=r=>({...r,status:'OK',simulated:true,protocolVersion:2});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function setup(overrides={}) {
    const calls=[],messages=[];let acquisitions=0,failures=0;
    const control=new MovementControl({acquire:async()=>({protocolVersion:2,sessionId:(++acquisitions).toString(16).padStart(32,'0')}),send:async r=>{calls.push(r);return ack(r);},...overrides},m=>messages.push(m),()=>failures++);
    return {control,calls,messages,get acquisitions(){return acquisitions;},get failures(){return failures;}};
}
test('automatic acquisition for every fresh WASD action, normal release and monotonic sequence',async()=>{
    const t=setup(); const keys=new KeyboardState();
    for(const [key,command] of [['w','FORWARD'],['a','LEFT'],['s','BACKWARD'],['d','RIGHT']]){
        keys.press(key);t.control.set(keys.command());await tick();
        assert.equal(t.calls.at(-1).command,command);
        assert.equal(t.calls.at(-1).speed,['w','s'].includes(key)?150:0);
        keys.release(key);t.control.set(keys.command());await tick();
        assert.equal(t.calls.at(-1).command,'STOP');assert.equal(t.calls.at(-1).sequence,2);
    }
    assert.equal(t.acquisitions,4);assert.equal(t.control.state,'IDLE');
});
test('release during acquisition invalidates resulting session; concurrent intent acquires only afterward',async()=>{
    const pending=deferred();let acquisitions=0;const calls=[];
    const t=setup({acquire:()=>{acquisitions++;return acquisitions===1?pending.promise:Promise.resolve({sessionId:'b'.repeat(32)});},send:async r=>{calls.push(r);return ack(r);}});
    t.control.set('FORWARD');t.control.set('LEFT');assert.equal(acquisitions,1);
    t.control.stop();t.control.set('RIGHT');assert.equal(acquisitions,1);
    pending.resolve({sessionId:'a'.repeat(32)});await tick();
    assert.deepEqual(calls.map(r=>r.command),['STOP','RIGHT']);assert.equal(acquisitions,2);
    t.control.stop();await tick();
});
test('cancelled acquisition never starts movement even on late response',async()=>{
    const pending=deferred();const t=setup({acquire:()=>pending.promise});
    t.control.set('FORWARD');t.control.stop();pending.resolve({sessionId:'a'.repeat(32)});await tick();
    assert.deepEqual(t.calls.map(r=>r.command),['STOP']);
});
test('keypress under 100 ms: priority STOP overtakes movement and obsolete 409 is not a failure',async()=>{
    const pending=deferred(),calls=[];const t=setup({send:r=>{calls.push(r);return r.command==='STOP'?Promise.resolve(ack(r)):pending.promise;}});
    t.control.set('FORWARD');await tick();t.control.stop();
    assert.deepEqual(calls.map(r=>r.command),['FORWARD','STOP']);
    assert.ok(calls[1].sequence>calls[0].sequence);
    pending.reject(new ControlRejected('superseded'));await tick();
    assert.equal(t.failures,0);assert.match(t.messages.at(-1),/STOP accepted/);
    await delay(300);assert.equal(calls.length,2);
});
test('late success cannot reactivate movement or corrupt a new epoch',async()=>{
    const pending=deferred(),calls=[];const t=setup({send:r=>{calls.push(r);return calls.length===1?pending.promise:Promise.resolve(ack(r));}});
    t.control.set('FORWARD');await tick();t.control.stop();await tick();t.control.set('LEFT');await tick();
    pending.resolve(ack(calls[0]));await tick();assert.equal(t.control.state,'ACTIVE');assert.match(t.messages.at(-1),/LEFT/);
    t.control.stop();await tick();
});
test('held direction sends watchdog heartbeats for several seconds',async()=>{
    const t=setup();t.control.set('FORWARD');await delay(3100);t.control.stop();await tick();
    assert.equal(t.acquisitions,1);assert.ok(t.calls.length>=12);
    assert.ok(t.calls.every((r,i)=>r.sequence===i+1));
});
test('direction priority, duplicate press, release remaining key and rapid alternating actions',async()=>{
    const t=setup(),keys=new KeyboardState();
    keys.press('w');keys.press('a');keys.press('w');assert.equal(keys.command(),'FORWARD');assert.equal(keys.intent().steering,'LEFT');
    t.control.set(keys.command());await tick();keys.release('a');t.control.set(keys.command());await tick();
    assert.equal(t.calls.at(-1).command,'FORWARD');
    keys.release('w');t.control.stop();await tick();
    for(let i=0;i<10;i++){t.control.set(i%2?'LEFT':'RIGHT');await tick();t.control.stop();await tick();}
    assert.equal(t.acquisitions,11);assert.equal(t.control.state,'IDLE');
});
for(const error of [new ControlRejected('expired or superseded'),new Error('WiFi timeout')]){
    test(`${error.message}: no automatic retry after failure`,async()=>{
        const t=setup({send:async r=>{if(r.command!=='STOP')throw error;return ack(r);}});
        t.control.set('FORWARD');await tick();await delay(300);
        assert.equal(t.acquisitions,1);assert.equal(t.failures,1);assert.equal(t.control.state,'ERROR');assert.match(t.messages.at(-1),/unavailable/);
        t.control.set('LEFT');await tick();assert.equal(t.acquisitions,2);
    });
}
test('failed acquisition cancels all pending intent',async()=>{
    const t=setup({acquire:async()=>{throw new Error('HTTP 502');}});
    t.control.set('FORWARD');await tick();assert.equal(t.control.state,'ERROR');assert.equal(t.failures,1);assert.equal(t.calls.length,0);
});
test('STOP failure is unconfirmed and cancels a queued fresh action',async()=>{
    const pending=deferred();const t=setup({send:r=>r.command==='STOP'?pending.promise:Promise.resolve(ack(r))});
    t.control.set('FORWARD');await tick();t.control.stop();t.control.set('LEFT');
    pending.reject(new Error('timeout'));await tick();assert.equal(t.acquisitions,1);assert.equal(t.control.state,'ERROR');assert.match(t.messages.at(-1),/STOP unconfirmed/);
});
test('obsolete network failures are still reported after successful STOP',async()=>{
    const pending=deferred();const t=setup({send:r=>r.command==='STOP'?Promise.resolve(ack(r)):pending.promise});
    t.control.set('FORWARD');await tick();t.control.stop();await tick();pending.reject(new Error('network failure'));await tick();
    assert.equal(t.failures,1);assert.match(t.messages.at(-1),/network failure/);
});
test('duplicate or mismatched acknowledgements fail safely',async()=>{
    const t=setup({send:async r=>r.command==='STOP'?ack(r):({...ack(r),sequence:0})});
    t.control.set('FORWARD');await tick();assert.equal(t.failures,1);assert.equal(t.control.state,'ERROR');assert.match(t.messages.at(-1),/Invalid device acknowledgement/);
});
test('emergency stop / focus cancellation clears latest queued direction',async()=>{
    const pending=deferred();const t=setup({acquire:()=>pending.promise});
    t.control.set('FORWARD');t.control.set('LEFT');t.control.stop();t.control.stop();
    pending.resolve({sessionId:'a'.repeat(32)});await tick();await delay(300);
    assert.deepEqual(t.calls.map(r=>r.command),['STOP']);
});
test('one normal request at a time; queued directions collapse to latest intent',async()=>{
    const pending=deferred(),calls=[];const t=setup({send:r=>{calls.push(r);return calls.length===1?pending.promise:Promise.resolve(ack(r));}});
    t.control.set('FORWARD');await tick();t.control.set('FORWARD','LEFT');t.control.set('FORWARD','RIGHT');
    assert.equal(calls.length,1);pending.resolve(ack(calls[0]));await tick();
    assert.deepEqual(calls.map(r=>r.command),['FORWARD','FORWARD']);assert.equal(calls[1].steering,'RIGHT');t.control.stop();await tick();
});
test('STOP is never reported confirmed before its matching acknowledgement',async()=>{
    const pending=deferred();const t=setup({send:r=>r.command==='STOP'?pending.promise:Promise.resolve(ack(r))});
    t.control.set('FORWARD');await tick();t.control.stop();await tick();
    assert.equal(t.control.state,'STOPPING');assert.ok(!t.messages.some(m=>m.includes('STOP accepted')));
    pending.resolve({status:'OK',command:'STOP',speed:0,sessionId:'0'.repeat(32),sequence:2,simulated:true});await tick();
    assert.equal(t.control.state,'ERROR');assert.match(t.messages.at(-1),/STOP unconfirmed/);
});

test('W -> A -> D -> S during delayed FORWARD sends only latest BACKWARD immediately after ACK',async()=>{
    const pending=deferred(),calls=[];
    const t=setup({send:r=>{calls.push(r);return calls.length===1?pending.promise:Promise.resolve(ack(r));}});
    t.control.set('FORWARD');await tick();
    t.control.set('FORWARD','LEFT');t.control.set('FORWARD','RIGHT');t.control.set('BACKWARD','RIGHT');
    assert.equal(calls.length,1);
    pending.resolve(ack(calls[0]));await tick();
    assert.deepEqual(calls.map(r=>r.command),['FORWARD','BACKWARD']);
    t.control.stop();await tick();
});

test('new direction bypasses scheduled heartbeat, STOP cancels it',async()=>{
    const t=setup();t.control.set('FORWARD');await tick();
    t.control.set('FORWARD','LEFT');await tick();assert.deepEqual(t.calls.map(r=>r.command),['FORWARD','FORWARD']);
    t.control.stop();await tick();await delay(300);
    assert.deepEqual(t.calls.map(r=>r.command),['FORWARD','FORWARD','STOP']);
});

for (const command of ['FORWARD', 'BACKWARD']) {
    test(`${command}: 200 ms RTT keeps 250 ms cadence without overlapping requests`, async () => {
        vi.useFakeTimers();
        const times=[]; let pending=0, maximum=0;
        const t=setup({send:async r=>{
            times.push(performance.now()); maximum=Math.max(maximum,++pending);
            await new Promise(resolve=>setTimeout(resolve,200)); --pending; return ack(r);
        }});
        try {
            t.control.set(command);
            await vi.advanceTimersByTimeAsync(1200);
            assert.deepEqual(times,[0,250,500,750,1000]);
            assert.equal(maximum,1);
            assert.equal(t.control.diagnostics.movementMs,200);
            assert.equal(t.control.diagnostics.heartbeatGapMs,250);
            t.control.stop(); await vi.advanceTimersByTimeAsync(200);
            assert.equal(t.control.diagnostics.stopMs,200);
        } finally { t.control.dispose(); vi.useRealTimers(); }
    });
}
test('late heartbeat response never creates a catch-up burst or resumes after STOP', async()=>{
    vi.useFakeTimers(); const pending=deferred(),calls=[];
    const t=setup({send:r=>{calls.push(r);return r.command==='STOP'?Promise.resolve(ack(r)):pending.promise;}});
    try {
        t.control.set('BACKWARD'); await vi.advanceTimersByTimeAsync(1100);
        assert.equal(calls.length,1); t.control.stop();
        pending.resolve(ack(calls[0])); await vi.advanceTimersByTimeAsync(2000);
        assert.deepEqual(calls.map(r=>r.command),['BACKWARD','STOP']);
    } finally { t.control.dispose(); vi.useRealTimers(); }
});

for (const [keys,command,steering] of [
    ['w','FORWARD','CENTER'],['s','BACKWARD','CENTER'],['a','LEFT','LEFT'],['d','RIGHT','RIGHT'],
    ['wa','FORWARD','LEFT'],['wd','FORWARD','RIGHT'],['sa','BACKWARD','LEFT'],['sd','BACKWARD','RIGHT'],
    ['aw','FORWARD','LEFT'],['ds','BACKWARD','RIGHT'],['ws','BACKWARD','CENTER'],['sw','FORWARD','CENTER'],
    ['ad','RIGHT','RIGHT'],['da','LEFT','LEFT'],
]) test(`combined intent ${keys}`,async()=>{
    const t=setup(),state=new KeyboardState();
    for(const key of keys) state.press(key);
    assert.deepEqual(state.intent(),{command,steering});
    t.control.set(command,steering);await tick();
    assert.equal(t.calls.at(-1).command,command);assert.equal(t.calls.at(-1).steering,steering);
    t.control.stop();await tick();
});
test('opposite keys: last within each axis wins; repeats do not reorder; release restores held key',()=>{
    const keys=new KeyboardState();for(const key of 'wsad')keys.press(key);
    keys.press('w');keys.press('a');assert.deepEqual(keys.intent(),{command:'BACKWARD',steering:'RIGHT'});
    keys.release('s');keys.release('d');assert.deepEqual(keys.intent(),{command:'FORWARD',steering:'LEFT'});
    keys.release('w');assert.deepEqual(keys.intent(),{command:'LEFT',steering:'LEFT'});
    keys.release('a');assert.deepEqual(keys.intent(),{command:'STOP',steering:'CENTER'});
});
for(const [command,turn] of [['FORWARD','LEFT'],['BACKWARD','RIGHT']]) {
    test(`${command}: steering release preserves drive and combined heartbeats`,async()=>{
        vi.useFakeTimers();const t=setup();
        try {
            t.control.set(command,turn);await vi.advanceTimersByTimeAsync(1000);
            assert.equal(t.calls.length,5);assert.ok(t.calls.every(r=>r.command===command && r.steering===turn));
            t.control.set(command,'CENTER');await vi.advanceTimersByTimeAsync(0);
            assert.equal(t.calls.at(-1).steering,'CENTER');assert.equal(t.acquisitions,1);
            t.control.stop();await vi.advanceTimersByTimeAsync(0);
        } finally {t.control.dispose();vi.useRealTimers();}
    });
    test(`${command}: release propulsion overtakes pending HTTP; retained turn waits for STOP`,async()=>{
        const movement=deferred(),stop=deferred(),calls=[];
        const t=setup({send:r=>{calls.push(r);return calls.length===1?movement.promise:r.command==='STOP'?stop.promise:Promise.resolve(ack(r));}});
        t.control.set(command,turn);await tick();t.control.set(turn,turn);
        assert.deepEqual(calls.map(r=>r.command),[command,'STOP']);assert.equal(t.acquisitions,1);
        stop.resolve(ack(calls[1]));await tick();
        assert.deepEqual(calls.map(r=>r.command),[command,'STOP',turn]);assert.equal(calls[2].speed,0);
        assert.notEqual(calls[0].sessionId,calls[2].sessionId);
        movement.resolve(ack(calls[0]));await tick();assert.match(t.messages.at(-1),new RegExp(turn));
        t.control.stop();await tick();
    });
}
test('legacy backend/firmware capability is rejected before a combined command is sent',async()=>{
    const t=setup({acquire:async()=>({sessionId:'a'.repeat(32)})});
    t.control.set('FORWARD','LEFT');await tick();assert.deepEqual(t.calls.map(r=>r.command),['STOP']);
    assert.equal(t.failures,1);assert.match(t.messages.at(-1),/protocol v2/);
});
for(const wrong of [{steering:'CENTER'},{protocolVersion:1},{steering:undefined}])
 test(`combined ACK mismatch ${JSON.stringify(wrong)} cancels`,async()=>{
    const t=setup({send:async r=>r.command==='STOP'?ack(r):({...ack(r),...wrong})});
    t.control.set('BACKWARD','RIGHT');await tick();assert.equal(t.failures,1);assert.equal(t.control.state,'ERROR');
 });
