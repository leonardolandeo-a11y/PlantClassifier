// Real Chromium -> Spring -> software device. No production instrumentation or clock mixing.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const base=process.env.PLANT_BASE_URL, device=process.env.PLANT_DEVICE_URL;
assert.ok(base && device && process.env.PLANT_BENCHMARK_OUTPUT);
const safety=await (await fetch(device+'/status',{headers:{'X-Device-Token':process.env.DEVICE_TOKEN}})).json();
assert.equal(safety.mode,'simulation');assert.equal(safety.hardwareOutputEnabled,false);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const samples={};
const record=(name,value)=>(samples[name]??=[]).push(value);
try {
  const context=await browser.newContext();
  await context.addInitScript(()=>{
    window.timings=[];
    const original=window.fetch;
    window.fetch=async (...args)=>{
      const start=performance.now(),url=String(args[0]);
      const response=await original(...args);
      if(response.status===204) window.timings.push({url,start,end:performance.now()});
      const json=response.json.bind(response);
      response.json=async()=>{
        const result=await json();
        window.timings.push({url,start,end:performance.now()});
        return result;
      };
      return response;
    };
    window.act=async (key,type,expected)=>{
      const start=performance.now();
      const before=window.timings.length;
      const accepted=new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{observer.disconnect();reject(new Error('No acknowledgement: '+expected));},3000);
        const observer=new MutationObserver(()=>{
          if(document.querySelector('#movementStatus').textContent.includes(expected+' accepted')){
            clearTimeout(timer);observer.disconnect();resolve(performance.now());
          }
        });
        observer.observe(document.querySelector('#movementStatus'),{childList:true});
      });
      document.dispatchEvent(new KeyboardEvent(type,{key,bubbles:true,cancelable:true}));
      const end=await accepted;
      return {start,end,requests:window.timings.slice(before).filter(r=>r.start>=start)};
    };
  });
  const page=await context.newPage();
  async function act(key,type,expected,label){
    const result=await page.evaluate(async x=>window.act(...x),[key,type,expected]);
    record(label,result.end-result.start);
    const movement=result.requests.find(r=>r.url==='/movement');
    if(movement) record(label+' -> HTTP',movement.start-result.start);
    for(const r of result.requests) record(r.url,r.end-r.start);
  }
  for(let i=0;i<100;i++){
    for(const [key,command] of [['w','FORWARD'],['a','LEFT'],['s','BACKWARD'],['d','RIGHT']]){
      await page.goto(base);
      await page.waitForFunction(()=>window.timings.some(r=>r.url==='/sensors'));
      // Same readiness window in both versions; allows page bootstrap to finish.
      await page.waitForTimeout(50);
      await act(key,'keydown',command,'initial '+key);
      await act(key,'keyup','STOP','release STOP');
    }
    for(const [key,command] of [['a','LEFT'],['d','RIGHT'],['s','BACKWARD']]){
      await act('w','keydown','FORWARD','restart W');
      await act(key,'keydown',command,'W -> '+key.toUpperCase());
      await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keyup',{key:'w',bubbles:true})));
      await act(key,'keyup','STOP','release STOP');
    }
  }
  const summary=Object.fromEntries(Object.entries(samples).map(([name,values])=>{
    const sorted=values.toSorted((a,b)=>a-b),n=values.length;
    return [name,{n,mean:values.reduce((a,b)=>a+b,0)/n,median:(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2,p95:sorted[Math.ceil(n*.95)-1],max:sorted[n-1]}];
  }));
  writeFileSync(process.env.PLANT_BENCHMARK_OUTPUT,JSON.stringify({unit:'ms',summary,samples},null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
} finally {await browser.close();}
