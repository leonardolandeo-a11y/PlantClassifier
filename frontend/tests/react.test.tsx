import { StrictMode } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMovement } from '../src/hooks/useMovement';
import { useKeyboardMovement } from '../src/hooks/useKeyboardMovement';
import { useSensors } from '../src/hooks/useSensors';
import { sensorsApi } from '../src/api/sensorsApi';
import { httpClient } from '../src/api/httpClient';
import { SensorGrid } from '../src/components/sensors/SensorGrid';
import { RecommendationPanel } from '../src/components/recommendation/RecommendationPanel';
import { DirectionButton } from '../src/components/movement/DirectionButton';
import type { MovementRequest, Transport } from '../src/movement/controller';
import type { SensorData } from '../src/types/sensor';
const reading: SensorData = {id:1,temperature:25,humidity:60,ph:6.5,soilMoisture:45,soilStatus:'calibrated',capturedAt:null,simulated:true,prediction:'melón',predictionStatus:'SUCCEEDED',predictionError:null,predictionModel:'synthetic-five-crops-v2'};
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
function deferred<T>() { let resolve!: (v:T)=>void; const promise = new Promise<T>(r=>{resolve=r;}); return {promise,resolve}; }
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('React robot lifecycle with simulated transport', () => {
 beforeEach(() => { vi.useFakeTimers(); vi.spyOn(document,'hasFocus').mockReturnValue(true); });
 function setup(acquire?: Transport['acquire']) {
  const calls: MovementRequest[]=[];let epoch=0;
  const transport: Transport={acquire:vi.fn(acquire ?? (async()=>({protocolVersion:2,sessionId:(++epoch).toString(16).padStart(32,'0')}))),send:vi.fn(async r=>{calls.push(r);return {...r,status:'OK',simulated:true,protocolVersion:2};})};
  const hook=renderHook(()=>{ const m=useMovement(transport);useKeyboardMovement(m.press,m.release,m.stop);return m; },{wrapper:StrictMode});
  return {...hook,calls,transport};
 }
 it('StrictMode does not acquire on mount, duplicates neither listeners nor heartbeats, and stops on unmount',async()=>{
  const t=setup();expect(t.transport.acquire).not.toHaveBeenCalled();
  fireEvent.keyDown(document,{key:'w'});await flush();expect(t.calls.map(r=>r.command)).toEqual(['FORWARD']);
  await act(async()=>{await vi.advanceTimersByTimeAsync(750);});expect(t.calls).toHaveLength(4);
  t.unmount();await flush();expect(t.calls.at(-1)?.command).toBe('STOP');
  await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});expect(t.calls).toHaveLength(5);
  fireEvent.keyDown(document,{key:'a'});await flush();expect(t.calls).toHaveLength(5);
 });
 it.each([['w','FORWARD'],['a','LEFT'],['s','BACKWARD'],['d','RIGHT']])('key %s releases to STOP',async(key,command)=>{
  const t=setup();fireEvent.keyDown(document,{key});await flush();expect(t.calls.at(-1)?.command).toBe(command);
  fireEvent.keyUp(document,{key});await flush();expect(t.calls.at(-1)?.command).toBe('STOP');t.unmount();
 });
 it('independent axes: releasing steering preserves propulsion',async()=>{
  const t=setup();fireEvent.keyDown(document,{key:'w'});await flush();fireEvent.keyDown(document,{key:'a'});await flush();
  fireEvent.keyUp(document,{key:'a'});await flush();fireEvent.keyUp(document,{key:'w'});await flush();
  expect(t.calls.map(r=>r.command)).toEqual(['FORWARD','FORWARD','FORWARD','STOP']);t.unmount();
 });
 it.each([['w','a','FORWARD','LEFT'],['w','d','FORWARD','RIGHT'],['s','a','BACKWARD','LEFT'],['s','d','BACKWARD','RIGHT']])('both input orders %s + %s show both keys; releasing propulsion stops first',async(drive,turn,command,steering)=>{
  for(const order of [[drive,turn],[turn,drive]]) {
   const t=setup();for(const key of order){fireEvent.keyDown(document,{key});await flush();}
   expect(t.result.current.pressed).toEqual(order);
   expect(t.calls.at(-1)).toMatchObject({command,steering,speed:150});
   fireEvent.keyUp(document,{key:drive});await flush();
   expect(t.calls.slice(-2).map(r=>r.command)).toEqual(['STOP',steering]);
   expect(t.calls.at(-1)).toMatchObject({speed:0,steering});
   expect(t.result.current.pressed).toEqual([turn]);
   fireEvent.keyUp(document,{key:turn});await flush();expect(t.calls.at(-1)?.command).toBe('STOP');t.unmount();
  }
 });
 it('keyboard and pointer sources preserve remaining propulsion and ignore duplicate presses',async()=>{
  const t=setup();
  act(()=>{t.result.current.press('w','key:w');t.result.current.press('w','pointer:1');t.result.current.press('a','pointer:2');});await flush();
  expect(t.calls.at(-1)).toMatchObject({command:'FORWARD',steering:'LEFT'});
  act(()=>t.result.current.release('key:w'));await flush();expect(t.calls.at(-1)?.command).toBe('FORWARD');
  act(()=>{t.result.current.release('pointer:2');t.result.current.release('pointer:2');});await flush();
  expect(t.calls.at(-1)).toMatchObject({command:'FORWARD',steering:'CENTER'});
  act(()=>t.result.current.release('pointer:1'));await flush();expect(t.calls.at(-1)?.command).toBe('STOP');t.unmount();
 });
 it.each(['blur','pagehide','visibilitychange','Escape'])('%s stops and cannot restart on a repeated key',async event=>{
  const t=setup();fireEvent.keyDown(document,{key:'w'});await flush();
  if(event==='visibilitychange'){vi.spyOn(document,'hidden','get').mockReturnValue(true);fireEvent(document,new Event(event));}
  else if(event==='Escape')fireEvent.keyDown(document,{key:'Escape'});else fireEvent(window,new Event(event));
  await flush();expect(t.calls.at(-1)?.command).toBe('STOP');fireEvent.keyDown(document,{key:'w',repeat:true});
  await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});expect(t.calls).toHaveLength(2);t.unmount();
 });
 it('typing guard and focusing editable content cancel movement',async()=>{
  const t=setup();const input=document.createElement('input');document.body.append(input);
  fireEvent.keyDown(input,{key:'w'});await flush();expect(t.calls).toHaveLength(0);
  fireEvent.keyDown(document,{key:'w'});await flush();fireEvent.focusIn(input);await flush();expect(t.calls.at(-1)?.command).toBe('STOP');input.remove();t.unmount();
 });
 it('unmount during acquisition only sends STOP when the session arrives',async()=>{
  const pending=deferred<{sessionId:string}>();const t=setup(()=>pending.promise);
  fireEvent.keyDown(document,{key:'w'});t.unmount();pending.resolve({sessionId:'a'.repeat(32)});await flush();
  expect(t.calls.map(r=>r.command)).toEqual(['STOP']);
 });
 it('pointer cancellation and capture loss release the pointer source',()=>{
  const press=vi.fn(),release=vi.fn();render(<DirectionButton letter="w" label="Adelante" arrow="↑" active={false} press={press} release={release}/>);
  const button=screen.getByRole('button');button.setPointerCapture=vi.fn();
  fireEvent.pointerDown(button,{button:0,pointerId:1});fireEvent.pointerCancel(button,{pointerId:1});fireEvent.lostPointerCapture(button,{pointerId:1});
  expect(release).toHaveBeenCalledTimes(2);
 });
});
describe('sensor hook concurrency',()=>{
 beforeEach(()=>{vi.spyOn(httpClient,'initializeCsrf').mockResolvedValue({headerName:'X-CSRF-TOKEN',token:'test'});});
 it('StrictMode aborts obsolete load; capture wins over delayed initial GET and reload restores latest',async()=>{
  const pending=deferred<SensorData>();const signals:AbortSignal[]=[];
  vi.spyOn(sensorsApi,'latest').mockImplementation(signal=>{signals.push(signal);return pending.promise;});
  vi.spyOn(sensorsApi,'capture').mockResolvedValue({...reading,id:2});
  const t=renderHook(useSensors,{wrapper:StrictMode});expect(signals[0].aborted).toBe(true);
  await act(async()=>{await t.result.current.capture();});pending.resolve(reading);await flush();expect(t.result.current.data?.id).toBe(2);t.unmount();expect(signals.at(-1)?.aborted).toBe(true);
  vi.mocked(sensorsApi.latest).mockResolvedValue({...reading,id:2});const reload=renderHook(useSensors);await waitFor(()=>expect(reload.result.current.data?.id).toBe(2));
 });
 it('serializes capture and exposes network failure without a stale recommendation',async()=>{
  vi.spyOn(sensorsApi,'latest').mockResolvedValue(reading);const pending=deferred<SensorData>();const capture=vi.spyOn(sensorsApi,'capture').mockReturnValue(pending.promise);
  const t=renderHook(useSensors);await waitFor(()=>expect(t.result.current.phase).toBe('ready'));
  act(()=>{void t.result.current.capture();void t.result.current.capture();});expect(capture).toHaveBeenCalledTimes(1);expect(t.result.current.phase).toBe('capturing');
  pending.resolve({...reading,prediction:null,predictionStatus:'PENDING'});await flush();expect(t.result.current.data?.prediction).toBeNull();
  capture.mockRejectedValue(new Error('Offline'));await act(async()=>{await t.result.current.capture();});expect(t.result.current.phase).toBe('error');expect(t.result.current.error).toBe('Offline');
 });
});
describe('sensor and recommendation rendering',()=>{
 it.each([
  ['calibrated',100,'100 %'],['calibrated',75,'75 %'],['invalid',null,'Lectura no válida'],['calibration-pending',null,'Calibración pendiente'],[undefined,undefined,'Sin datos disponibles'],['future-state',75,'Sin datos disponibles'],[undefined,45,'45 %'],[null,0,'0 %'],['calibrated',null,'Sin datos disponibles'],['calibrated',101,'Sin datos disponibles'],['calibrated',NaN,'Sin datos disponibles'],['invalid',75,'Lectura no válida'],
 ])('soil status %s value %s', (soilStatus,soilMoisture,expected)=>{
  render(<SensorGrid data={{...reading,soilStatus,soilMoisture}}/>);expect(document.getElementById('soilMoisture')).toHaveTextContent(expected);expect(document.getElementById('humidity')).toHaveTextContent('60.0');expect(document.getElementById('temperature')).toHaveTextContent('25.0');
 });
 it.each(['frijol','tomate','sandía','melón','lechuga'])('current crop %s',prediction=>{render(<RecommendationPanel data={{...reading,prediction}} phase="ready"/>);expect(screen.getByRole('heading',{level:3})).toHaveTextContent(prediction[0].toUpperCase()+prediction.slice(1));});
 it.each(['synthetic-five-crops-v1',null])('historical model %s',predictionModel=>{render(<RecommendationPanel data={{...reading,predictionModel}} phase="ready"/>);expect(screen.getByRole('heading',{level:3})).toHaveTextContent('Resultado histórico');});
 it.each([['PENDING','Recomendación pendiente'],['FAILED','Predicción fallida'],['OUT_OF_DOMAIN','Fuera del rango del modelo']])('prediction status %s', (predictionStatus,title)=>{render(<RecommendationPanel data={{...reading,predictionStatus}} phase="ready"/>);expect(screen.getByRole('heading',{level:3})).toHaveTextContent(title);expect(screen.queryByText('Melón')).not.toBeInTheDocument();});
 it.each(['capturing','error'] as const)('previous crop hidden during %s',phase=>{render(<RecommendationPanel data={reading} phase={phase}/>);expect(screen.queryByText('Melón')).not.toBeInTheDocument();});
});
