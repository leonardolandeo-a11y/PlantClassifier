import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {dimensions} from './native';
import appConfig from '../app.json';
import {AppState} from 'react-native';
import {MovementScreen} from '../src/screens/MovementScreen';
import {SensorClient} from '../src/api/client';
const touchDown = (element:HTMLElement, identifier=1) => fireEvent.touchStart(element,{changedTouches:[{identifier}]});
const touchUp = (element:HTMLElement, identifier=1) => fireEvent.touchEnd(element,{changedTouches:[{identifier}]});
afterEach(()=>{cleanup(); AppState.currentState='active'; vi.restoreAllMocks(); vi.unstubAllGlobals();});
it('uses one CSRF bootstrap, includes cookies, serializes mutations and never retries expired control',async()=>{
  const requests: {url:string; options?:RequestInit}[]=[];
  vi.stubGlobal('fetch',vi.fn(async(url,options)=>{
    requests.push({url:String(url),options});
    return {ok:true,status:200,json:async()=>String(url).endsWith('/csrf') ? {headerName:'X-CSRF-TOKEN',token:'fixture'} : {epoch:1}};
  }));
  const api=new SensorClient('http://127.0.0.1:18080');
  await Promise.all([api.request('/movement/session',{mutation:true}),api.request('/sensor-servo/session',{mutation:true})]);
  expect(requests.filter(r=>r.url.endsWith('/csrf'))).toHaveLength(1);
  expect(requests.every(r=>r.options?.credentials==='include')).toBe(true);
  expect(requests[1].options?.headers).toEqual({'X-CSRF-TOKEN':'fixture'});
  vi.mocked(fetch).mockResolvedValueOnce({ok:false,status:409} as Response);
  await expect(api.request('/movement',{mutation:true,body:{command:'FORWARD'}})).rejects.toThrow('caducado');
  vi.unstubAllGlobals();
});
it.each(['background','inactive','blur','tab'])('acquires on fresh touch, combines touches and sends STOP/HOLD on %s without resuming',async(reason)=>{
  const calls:any[]=[];
  const api=new SensorClient('http://127.0.0.1:18080');
  vi.spyOn(api,'request').mockImplementation(async(url,options)=>{
    calls.push({url,...options});
    if(url==='/movement/session') return {sessionId:'a'.repeat(32),protocolVersion:2} as never;
    if(url==='/movement') return {...options?.body as object,status:'OK',protocolVersion:2,simulated:true} as never;
    return {epoch:1,angle:100,state:'holding',deviceTimeMs:0} as never;
  });
  const view=render(<MovementScreen client={api}/>);
  expect(calls.some(c=>c.mutation)).toBe(false);
  await act(async()=>{touchDown(screen.getByRole('button',{name:'↑ Adelante'}));});
  await act(async()=>{touchDown(screen.getByRole('button',{name:'← Izquierda'}));});
  expect(calls.some(c=>c.body?.command==='FORWARD'&&c.body?.steering==='LEFT')).toBe(true);
  await act(async()=>{touchDown(screen.getByRole('button',{name:'↻ Girar +'}));});
  await act(async()=>{if(reason==='tab') view.unmount(); else if(reason==='blur') (AppState as any).emit('blur',''); else (AppState as any).emit('change',reason);});
  expect(calls.some(c=>c.body?.command==='STOP')).toBe(true);
  expect(calls.some(c=>c.body?.command==='HOLD')).toBe(true);
  const count=calls.filter(c=>c.mutation).length;
  await act(async()=>{(AppState as any).emit('change','active');});
  expect(calls.filter(c=>c.mutation)).toHaveLength(count);
});
it('release before late acquisition closes its session without sending motion', async()=>{
  const api=new SensorClient('http://127.0.0.1:18080');
  const commands:string[]=[];
  let resolve!: (value:unknown)=>void;
  vi.spyOn(api,'request').mockImplementation(async(url,options)=>{
    if(url==='/movement/session') return await new Promise<unknown>(r=>{resolve=r;}) as never;
    const body=options?.body as any;
    if(body?.command) commands.push(body.command);
    if(url==='/movement') return {...body,status:'OK',simulated:true} as never;
    return {epoch:1,angle:100,state:'holding',deviceTimeMs:0} as never;
  });
  render(<MovementScreen client={api}/>);
  await act(async()=>{touchDown(screen.getByRole('button',{name:'↑ Adelante'}));});
  await act(async()=>{touchUp(screen.getByRole('button',{name:'↑ Adelante'}));});
  await act(async()=>{resolve({sessionId:'a'.repeat(32),protocolVersion:2});});
  expect(commands).toEqual(['STOP']);
});
it('acquisition failure cancels old intent and permits a new press', async()=>{
  const api=new SensorClient('http://127.0.0.1:18080');
  vi.spyOn(api,'request').mockImplementation(async(url)=>{
    if(url==='/movement/session') throw new Error('Network unavailable');
    return {epoch:1,angle:100,state:'holding',deviceTimeMs:0} as never;
  });
  render(<MovementScreen client={api}/>);
  await act(async()=>{touchDown(screen.getByRole('button',{name:'↑ Adelante'}));});
  expect(screen.queryByText('Habilitar para esta sesión de laboratorio')).toBeNull();
  const count=vi.mocked(api.request).mock.calls.length;
  await act(async()=>{(AppState as any).emit('change','active'); touchDown(screen.getByRole('button',{name:'↑ Adelante'}));});
  expect(vi.mocked(api.request).mock.calls.length).toBeGreaterThan(count);
});

it('cancellation during CSRF acquisition never sends a late mutation', async()=>{
  let complete!: (value:Response)=>void;
  vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{complete=resolve;})));
  const api=new SensorClient('http://127.0.0.1:18080');
  const abort=new AbortController();
  const request=api.request('/movement',{mutation:true,body:{command:'FORWARD'},signal:abort.signal});
  abort.abort();
  complete({ok:true,status:200,json:async()=>({headerName:'X-CSRF-TOKEN',token:'fixture'})} as Response);
  await expect(request).rejects.toThrow('cancelada');
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});

function fakeStation() {
  const api=new SensorClient('http://127.0.0.1:18080');
  const calls:any[]=[];
  vi.spyOn(api,'request').mockImplementation(async(url,options)=>{
    calls.push({url,...options});
    if(url==='/movement/session') return {sessionId:'a'.repeat(32),protocolVersion:2} as never;
    if(url==='/movement') return {...options?.body as object,status:'OK',protocolVersion:2,simulated:true} as never;
    return {epoch:1,angle:100,state:'holding',deviceTimeMs:0} as never;
  });
  return {api,calls};
}
const button = (name:string) => screen.getByRole('button',{name});
it('tracks multiple fingers per key, combines axes and preserves advance when steering is released',async()=>{
  const {api,calls}=fakeStation(); render(<MovementScreen client={api}/>);
  await act(async()=>{touchDown(button('↑ Adelante'),1);});
  await act(async()=>{touchDown(button('↑ Adelante'),2);});
  await act(async()=>{touchDown(button('← Izquierda'),3);});
  await act(async()=>{touchUp(button('↑ Adelante'),1);});
  expect(calls.filter(c=>c.url==='/movement').at(-1).body).toMatchObject({command:'FORWARD',steering:'LEFT'});
  await act(async()=>{touchUp(button('← Izquierda'),3);});
  expect(calls.filter(c=>c.url==='/movement').at(-1).body).toMatchObject({command:'FORWARD',steering:'CENTER'});
  await act(async()=>{touchUp(button('↑ Adelante'),2);});
  expect(calls.filter(c=>c.url==='/movement').at(-1).body.command).toBe('STOP');
});
it('STOP overtakes held controls and late touch releases cannot restart motors',async()=>{
  const {api,calls}=fakeStation(); render(<MovementScreen client={api}/>);
  await act(async()=>{touchDown(button('↑ Adelante'),1); touchDown(button('↻ Girar +'),2);});
  await act(async()=>{fireEvent.click(screen.getByText('STOP'));});
  expect(calls.some(c=>c.body?.command==='STOP')).toBe(true);
  expect(calls.some(c=>c.body?.command==='HOLD')).toBe(true);
  const count=calls.filter(c=>c.mutation).length;
  await act(async()=>{touchUp(button('↑ Adelante'),1);});
  expect(calls.filter(c=>c.mutation)).toHaveLength(count);
  expect(screen.queryByText('Habilitar para esta sesión de laboratorio')).toBeNull();
});
it('HOLD cancels servo without dropping held propulsion',async()=>{
  const {api,calls}=fakeStation(); render(<MovementScreen client={api}/>);
  await act(async()=>{touchDown(button('↑ Adelante'),1); touchDown(button('↻ Girar +'),2);});
  await act(async()=>{fireEvent.click(screen.getByText('HOLD'));});
  expect(calls.some(c=>c.body?.command==='HOLD')).toBe(true);
  expect(calls.some(c=>c.body?.command==='STOP')).toBe(false);
  await act(async()=>{touchUp(button('↑ Adelante'),1);});
  expect(calls.some(c=>c.body?.command==='STOP')).toBe(true);
});
it.each([[667,375],[932,430],[390,844]])('stops and requires fresh touch after resize/orientation to %s × %s',async(width,height)=>{
  expect(appConfig.expo.orientation).toBe('landscape');
  const {api,calls}=fakeStation(); const view=render(<MovementScreen client={api}/>);
  await act(async()=>{touchDown(button('↑ Adelante'));});
  dimensions.width=width; dimensions.height=height;
  view.rerender(<MovementScreen client={api}/>);
  await act(async()=>{});
  expect(calls.some(c=>c.body?.command==='STOP')).toBe(true);
  expect(screen.queryByText('Habilitar para esta sesión de laboratorio')).toBeNull();
  dimensions.width=844; dimensions.height=390;
});
it('touch cancellation sends STOP/HOLD and invalidates touches',async()=>{
  const {api,calls}=fakeStation(); render(<MovementScreen client={api}/>);
  await act(async()=>{touchDown(button('↑ Adelante')); touchDown(button('↻ Girar +'),2);});
  await act(async()=>{fireEvent.touchCancel(button('↑ Adelante'));});
  expect(calls.some(c=>c.body?.command==='STOP')).toBe(true);
  expect(calls.some(c=>c.body?.command==='HOLD')).toBe(true);
  expect(screen.queryByText('Habilitar para esta sesión de laboratorio')).toBeNull();
});
it.each(['scroll','connection'])('stops physical control after %s without reacquiring',async(reason)=>{
  const {api,calls}=fakeStation(); const view=render(<MovementScreen client={api}/>);
  await act(async()=>{touchDown(button('↑ Adelante'));});
  const replacement=fakeStation();
  view.rerender(<MovementScreen client={reason==='connection' ? replacement.api : api} scrollEpoch={reason==='scroll' ? 1 : 0}/>);
  await act(async()=>{});
  expect(calls.some(c=>c.body?.command==='STOP')).toBe(true);
  expect(replacement.calls.some(c=>c.url.endsWith('/session'))).toBe(false);
  expect(screen.queryByText('Habilitar para esta sesión de laboratorio')).toBeNull();
});

it('does not latch control off after a servo status failure (former enable regression)', async()=>{
  const {api}=fakeStation();
  vi.mocked(api.request).mockRejectedValueOnce(new Error('Servo status unavailable'));
  render(<MovementScreen client={api}/>);
  expect(screen.getByText('Control de laboratorio · Listo')).toBeTruthy();
  await act(async()=>{touchDown(button('↑ Adelante'));});
  expect(vi.mocked(api.request).mock.calls.some(([url])=>url==='/movement/session')).toBe(true);
});

it.each(['movement','servo'])('STOP during %s acquisition closes late session and only a fresh press can move',async(kind)=>{
  const {api,calls}=fakeStation();
  const original=vi.mocked(api.request).getMockImplementation()!;
  let complete!:(value:any)=>void;
  let first=true;
  vi.mocked(api.request).mockImplementation((url,options)=>{
    if(first && url===(kind==='movement'?'/movement/session':'/sensor-servo/session')) {
      first=false; return new Promise(resolve=>{complete=resolve;});
    }
    return original(url,options);
  });
  render(<MovementScreen client={api}/>);
  const label=kind==='movement'?'↑ Adelante':'↻ Girar +';
  await act(async()=>{touchDown(button(label));});
  await act(async()=>{fireEvent.pointerDown(button('STOP'));});
  await act(async()=>{complete(kind==='movement'?{sessionId:'a'.repeat(32),protocolVersion:2}:{epoch:7,angle:100,state:'holding',deviceTimeMs:0});});
  expect(calls.filter(c=>c.body).map(c=>c.body.command)).toEqual([kind==='movement'?'STOP':'HOLD']);
  await act(async()=>{touchUp(button(label));});
  expect(calls.filter(c=>c.body)).toHaveLength(1);
  await act(async()=>{touchDown(button(label),2);});
  expect(calls.some(c=>c.body?.command===(kind==='movement'?'FORWARD':'INCREASE'))).toBe(true);
});

it('ordinary rerenders preserve a held session and do not STOP or acquire again',async()=>{
  const {api,calls}=fakeStation(); const view=render(<MovementScreen client={api}/>);
  await act(async()=>{touchDown(button('↑ Adelante'));});
  view.rerender(<MovementScreen client={api}/>);
  await act(async()=>{});
  expect(calls.filter(c=>c.url==='/movement/session')).toHaveLength(1);
  expect(calls.some(c=>c.body?.command==='STOP')).toBe(false);
  await act(async()=>{touchUp(button('↑ Adelante'));});
  expect(calls.some(c=>c.body?.command==='STOP')).toBe(true);
});
