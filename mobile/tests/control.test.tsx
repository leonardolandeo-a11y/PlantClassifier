import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {AppState} from 'react-native';
import {MovementScreen} from '../src/screens/MovementScreen';
import {SensorClient} from '../src/api/client';
afterEach(()=>{cleanup(); vi.restoreAllMocks();});
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
it.each(['background','inactive','blur','tab'])('requires opt-in, combines touches and sends STOP/HOLD on %s without resuming',async(reason)=>{
  const calls:any[]=[];
  const api=new SensorClient('http://127.0.0.1:18080');
  vi.spyOn(api,'request').mockImplementation(async(url,options)=>{
    calls.push({url,...options});
    if(url==='/movement/session') return {sessionId:'a'.repeat(32),protocolVersion:2} as never;
    if(url==='/movement') return {...options?.body as object,status:'OK',protocolVersion:2,simulated:true} as never;
    return {epoch:1,angle:100,state:'holding',deviceTimeMs:0} as never;
  });
  const view=render(<MovementScreen client={api}/>);
  expect(calls).toHaveLength(0);
  await act(async()=>{fireEvent.click(screen.getByText('Habilitar para esta sesión de laboratorio'));});
  await act(async()=>{fireEvent.pointerDown(screen.getByText('↑ Adelante'));});
  await act(async()=>{fireEvent.pointerDown(screen.getByText('← Izquierda'));});
  expect(calls.some(c=>c.body?.command==='FORWARD'&&c.body?.steering==='LEFT')).toBe(true);
  await act(async()=>{fireEvent.pointerDown(screen.getByText('↻ Girar +'));});
  await act(async()=>{if(reason==='tab') view.unmount(); else if(reason==='blur') (AppState as any).emit('blur',''); else (AppState as any).emit('change',reason);});
  expect(calls.some(c=>c.body?.command==='STOP')).toBe(true);
  expect(calls.some(c=>c.body?.command==='HOLD')).toBe(true);
  const count=calls.length;
  await act(async()=>{(AppState as any).emit('change','active');});
  expect(calls).toHaveLength(count);
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
  await act(async()=>{fireEvent.click(screen.getByText('Habilitar para esta sesión de laboratorio'));});
  await act(async()=>{fireEvent.pointerDown(screen.getByText('↑ Adelante'));});
  await act(async()=>{fireEvent.pointerUp(screen.getByText('↑ Adelante'));});
  await act(async()=>{resolve({sessionId:'a'.repeat(32),protocolVersion:2});});
  expect(commands).toEqual(['STOP']);
});
it('network loss disables controls and does not reacquire after recovery', async()=>{
  const api=new SensorClient('http://127.0.0.1:18080');
  vi.spyOn(api,'request').mockImplementation(async(url)=>{
    if(url==='/movement/session') throw new Error('Network unavailable');
    return {epoch:1,angle:100,state:'holding',deviceTimeMs:0} as never;
  });
  render(<MovementScreen client={api}/>);
  await act(async()=>{fireEvent.click(screen.getByText('Habilitar para esta sesión de laboratorio'));});
  await act(async()=>{fireEvent.pointerDown(screen.getByText('↑ Adelante'));});
  expect(screen.getByText('Habilitar para esta sesión de laboratorio')).toBeTruthy();
  const count=vi.mocked(api.request).mock.calls.length;
  await act(async()=>{(AppState as any).emit('change','active'); fireEvent.pointerDown(screen.getByText('↑ Adelante'));});
  expect(vi.mocked(api.request).mock.calls).toHaveLength(count);
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
