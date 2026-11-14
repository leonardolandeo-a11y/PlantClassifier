import React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {AppState} from 'react-native';
import App from '../App';
import {connectStation} from '../src/api/discovery';
import {SensorClient} from '../src/api/client';
const reading = {id:1,temperature:24,humidity:60,ph:6.5,predictionStatus:'PENDING',capturedAt:null};
afterEach(()=>{cleanup(); AppState.currentState='active'; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();});
it('requires the injected URL without consulting Metro or fallback servers',async()=>{
  const fetcher=vi.fn(); vi.stubGlobal('fetch',fetcher);
  render(<App/>);
  await screen.findByText(/Falta EXPO_PUBLIC_API_URL/);
  fireEvent.click(screen.getByText('Reintentar'));
  await act(async()=>{});
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).toBeNull();
});
it('loads automatically, captures with CSRF and cookies, never acquires physical sessions',async()=>{
  vi.stubEnv('EXPO_PUBLIC_API_URL','http://station.local:18080');
  const calls:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async(url,options)=>{
    calls.push(String(url));
    expect(options.credentials).toBe('include');
    if(String(url).endsWith('/sensors/capture')) expect(options.headers).toEqual({'X-CSRF':'test'});
    return {ok:true,status:200,json:async()=>String(url).endsWith('/csrf') ? {headerName:'X-CSRF',token:'test'} : reading};
  }));
  render(<App/>);
  await screen.findByText('● Conectado · http://station.local:18080');
  expect(screen.getByText('24.0 °C')).toBeTruthy();
  fireEvent.click(screen.getByText('＋ Capturar datos'));
  await waitFor(()=>expect(calls).toContain('http://station.local:18080/sensors/capture'));
  expect(calls.some(url=>url.includes('session'))).toBe(false);
});
it('shows errors, retries, uses the same injected URL and reconnects without movement',async()=>{
  vi.stubEnv('EXPO_PUBLIC_API_URL','http://station.local:18080');
  const latest=vi.spyOn(SensorClient.prototype,'latest').mockRejectedValue(new Error('Sin red'));
  render(<App/>);
  await screen.findByText(/http:\/\/station.local:18080: Sin red/);
  expect((screen.getByText('＋ Capturar datos').closest('button') as HTMLButtonElement).disabled).toBe(true);
  latest.mockResolvedValue(null);
  fireEvent.click(screen.getByText('Reintentar'));
  await screen.findByText('● Conectado · http://station.local:18080');
  expect(screen.queryByText('Configuración de conexión')).toBeNull();
  fireEvent.click(screen.getByRole('tab',{name:'Movimiento'}));
  await act(async()=>{(AppState as any).emit('change','background');});
  await act(async()=>{(AppState as any).emit('change','active');});
  await screen.findByText('● Conectado · http://station.local:18080');
  expect(screen.getByText('Control de laboratorio · Listo')).toBeTruthy();
});
it('aborts obsolete discovery so late data cannot overwrite a new connection',async()=>{
  let finish!: (data:never)=>void;
  vi.spyOn(SensorClient.prototype,'latest').mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue(null);
  const abort=new AbortController();
  const pending=connectStation('http://old.local',abort.signal);
  abort.abort();
  const next=await connectStation('http://new.local',new AbortController().signal);
  finish(reading as never);
  await expect(pending).rejects.toThrow();
  expect(next.origin).toBe('http://new.local');
});
it('bounds attempts without falling back to another server',async()=>{
  vi.useFakeTimers();
  const latest=vi.spyOn(SensorClient.prototype,'latest').mockImplementation(signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))));
  const pending=connectStation('http://station.local:18080',new AbortController().signal);
  const assertion=expect(pending).rejects.toThrow('sin respuesta');
  await vi.advanceTimersByTimeAsync(4500); await assertion;
  expect(latest).toHaveBeenCalledTimes(1);
});
it('cancels pending reads on background and unmount',async()=>{
  vi.stubEnv('EXPO_PUBLIC_API_URL','http://station.local:18080');
  const signals:AbortSignal[]=[];
  vi.spyOn(SensorClient.prototype,'latest').mockImplementation(signal=>{signals.push(signal);return new Promise(()=>{});});
  const view=render(<App/>);
  await act(async()=>{(AppState as any).emit('change','background');});
  expect(signals[0].aborted).toBe(true);
  await act(async()=>{(AppState as any).emit('change','active');});
  view.unmount();
  expect(signals.at(-1)?.aborted).toBe(true);
});
it('automatically retries failures, detects lost Wi-Fi and recovers with motors disabled',async()=>{
  vi.useFakeTimers();
  vi.stubEnv('EXPO_PUBLIC_API_URL','http://station.local:18080');
  const latest=vi.spyOn(SensorClient.prototype,'latest').mockRejectedValue(new Error('Sin red'));
  vi.spyOn(SensorClient.prototype,'request').mockResolvedValue({epoch:1,angle:100,state:'holding',deviceTimeMs:0});
  render(<App/>);
  await act(async()=>{});
  expect(screen.getByText('○ Sin conexión')).toBeTruthy();
  latest.mockResolvedValue(null);
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(screen.getByText('● Conectado · http://station.local:18080')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab',{name:'Movimiento'}));
  expect(screen.getByText('Control de laboratorio · Listo')).toBeTruthy();
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(screen.getByText('Control de laboratorio · Listo')).toBeTruthy();
  latest.mockRejectedValue(new Error('Wi-Fi perdido'));
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(screen.getByText('○ Sin conexión')).toBeTruthy();
  expect(screen.getByRole('button',{name:'↑ Adelante'}).getAttribute('aria-disabled')).toBe('true');
  latest.mockResolvedValue(null);
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(screen.getByText('● Conectado · http://station.local:18080')).toBeTruthy();
  expect(screen.getByText('Control de laboratorio · Listo')).toBeTruthy();
  await act(async()=>{(AppState as any).emit('blur');});
  const calls=latest.mock.calls.length;
  await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});
  expect(latest).toHaveBeenCalledTimes(calls);
});

it('successful polls and duplicate focus preserve active session; reconnect never replays old touches',async()=>{
  vi.useFakeTimers(); vi.stubEnv('EXPO_PUBLIC_API_URL','http://station.local:18080');
  const latest=vi.spyOn(SensorClient.prototype,'latest').mockResolvedValue(null);
  const mutations:any[]=[];
  vi.spyOn(SensorClient.prototype,'request').mockImplementation(async(url,options)=>{
    if(options?.mutation) mutations.push({url,...options});
    if(url==='/movement/session') return {sessionId:'b'.repeat(32),protocolVersion:2} as never;
    if(url==='/movement') return {...options?.body as object,status:'OK',simulated:true,protocolVersion:2} as never;
    return {epoch:1,angle:100,state:'holding',deviceTimeMs:0} as never;
  });
  render(<App/>); await act(async()=>{});
  fireEvent.click(screen.getByRole('tab',{name:'Movimiento'}));
  const down=()=>fireEvent.touchStart(screen.getByRole('button',{name:'↑ Adelante'}),{changedTouches:[{identifier:1}]});
  await act(async()=>{down();});
  await act(async()=>{(AppState as any).emit('focus'); await vi.advanceTimersByTimeAsync(15000);});
  expect(mutations.filter(c=>c.url==='/movement/session')).toHaveLength(1);
  expect(mutations.some(c=>c.body?.command==='STOP')).toBe(false);
  latest.mockRejectedValue(new Error('Disconnected'));
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(mutations.some(c=>c.body?.command==='STOP')).toBe(true);
  const count=mutations.length;
  latest.mockResolvedValue(null);
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
  expect(mutations).toHaveLength(count);
  await act(async()=>{fireEvent.touchEnd(screen.getByRole('button',{name:'↑ Adelante'}),{changedTouches:[{identifier:1}]});});
  expect(mutations).toHaveLength(count);
  await act(async()=>{down();});
  expect(mutations.filter(c=>c.url==='/movement/session')).toHaveLength(2);
});

it('explicit capture preempts a pending poll, deduplicates taps and ignores its late failure',async()=>{
  vi.useFakeTimers(); vi.stubEnv('EXPO_PUBLIC_API_URL','http://station.local:18080');
  let failPoll!:(error:Error)=>void;
  vi.spyOn(SensorClient.prototype,'latest').mockResolvedValueOnce(reading as never)
    .mockImplementationOnce(()=>new Promise((_,reject)=>{failPoll=reject;}));
  let finish!:(data:any)=>void;
  const capture=vi.spyOn(SensorClient.prototype,'capture').mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  render(<App/>); await act(async()=>{});
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  await act(async()=>{fireEvent.click(screen.getByText('＋ Capturar datos')); fireEvent.click(screen.getByText(/Capturar datos|Leyendo…/));});
  expect(capture).toHaveBeenCalledTimes(1);
  await act(async()=>{finish({...reading,temperature:28}); failPoll(new Error('obsolete poll'));});
  expect(screen.getByText('28.0 °C')).toBeTruthy();
  expect(screen.getByText('● Conectado · http://station.local:18080')).toBeTruthy();
});

it.each([[409,'stale-sample','La muestra ha caducado'],[503,'capture-busy','Hay otra captura'],[503,'persistence','PostgreSQL'],[403,'http-request','Sesión vencida']])('capture HTTP %s %s keeps connectivity and reports the specific error without retry',async(status,category,message)=>{
  vi.stubEnv('EXPO_PUBLIC_API_URL','http://station.local:18080');
  const fetcher=vi.fn(async(url)=>({ok:!String(url).endsWith('/capture'),status:String(url).endsWith('/capture')?status:200,json:async()=>String(url).endsWith('/csrf')?{headerName:'X-CSRF',token:'test'}:String(url).endsWith('/capture')?{type:`urn:plantclassifier:${category}`}:reading}));
  vi.stubGlobal('fetch',fetcher);
  render(<App/>); await screen.findByText('● Conectado · http://station.local:18080');
  fireEvent.click(screen.getByText('＋ Capturar datos'));
  await screen.findByRole('alert');
  expect(screen.getByRole('alert').textContent).toContain(message);
  expect(screen.getByText('● Conectado · http://station.local:18080')).toBeTruthy();
  expect(fetcher.mock.calls.filter(([url])=>String(url).endsWith('/capture'))).toHaveLength(1);
});

it('a late successful health read cannot replace the explicitly captured data',async()=>{
  vi.useFakeTimers(); vi.stubEnv('EXPO_PUBLIC_API_URL','http://station.local:18080');
  let finish!:(data:any)=>void;
  vi.spyOn(SensorClient.prototype,'latest').mockResolvedValueOnce(reading as never).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  vi.spyOn(SensorClient.prototype,'capture').mockResolvedValue({...reading,temperature:29} as never);
  render(<App/>); await act(async()=>{});
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  await act(async()=>{fireEvent.click(screen.getByText('＋ Capturar datos'));});
  await act(async()=>{finish({...reading,temperature:12});});
  expect(screen.getByText('29.0 °C')).toBeTruthy();
});

it('a capture network failure disconnects without retrying the mutation',async()=>{
  vi.stubEnv('EXPO_PUBLIC_API_URL','http://station.local:18080');
  const fetcher=vi.fn(async(url)=>{
    if(String(url).endsWith('/capture')) throw new TypeError('Wi-Fi perdido');
    return {ok:true,status:200,json:async()=>String(url).endsWith('/csrf')?{headerName:'X-CSRF',token:'test'}:reading};
  });
  vi.stubGlobal('fetch',fetcher);
  render(<App/>); await screen.findByText('● Conectado · http://station.local:18080');
  fireEvent.click(screen.getByText('＋ Capturar datos'));
  await screen.findByText('○ Sin conexión');
  expect(screen.getByRole('alert').textContent).toContain('Wi-Fi perdido');
  expect(fetcher.mock.calls.filter(([url])=>String(url).endsWith('/capture'))).toHaveLength(1);
});
