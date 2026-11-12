// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ServoPanel } from '../src/components/servo/ServoPanel';
import { httpClient } from '../src/api/httpClient';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
it('E/Q release holds; R centers; WASD remains independent; blur stops', async () => {
  const calls: string[] = [];
  vi.spyOn(httpClient, 'request').mockImplementation(async (_url, options) => {
    const command = (options?.body as {command?: string})?.command;
    if (command) calls.push(command);
    return { angle: 100, state: command === 'INCREASE' ? 'increasing' : 'holding', epoch: 1, deviceTimeMs: 1000 } as never;
  });
  render(<ServoPanel />);
  await act(async () => { fireEvent.keyDown(window, {key:'e'}); });
  expect(calls).toContain('INCREASE');
  await act(async () => { fireEvent.keyUp(window, {key:'e'}); });
  expect(calls.at(-1)).toBe('HOLD');
  await act(async () => { fireEvent.keyDown(window, {key:'q'}); });
  expect(calls).toContain('DECREASE');
  await act(async () => { fireEvent.blur(window); });
  expect(calls.at(-1)).toBe('HOLD');
  const count=calls.length;
  await act(async () => { fireEvent.keyDown(window, {key:'w'}); });
  expect(calls).toHaveLength(count);
  await act(async () => { fireEvent.keyDown(window, {key:'r'}); });
  expect(calls).toContain('CENTER');
  expect(screen.getByText(/Ángulo comandado/).textContent).toContain('100°');
});
it('release during session acquisition never starts rotation', async () => {
  let resolve!: (value: unknown) => void;
  const commands: string[]=[];
  vi.spyOn(httpClient,'request').mockImplementation(async (url, options) => {
    if(url.endsWith('/session')) return await new Promise<unknown>(r => { resolve=r; }) as never;
    const command=(options?.body as {command?:string})?.command;
    if(command) commands.push(command);
    return { angle:100,state:'holding',epoch:3,deviceTimeMs:0 } as never;
  });
  render(<ServoPanel />);
  await act(async () => { fireEvent.keyDown(window,{key:'e'}); });
  await act(async () => { fireEvent.keyUp(window,{key:'e'}); resolve({angle:100,state:'holding',epoch:3,deviceTimeMs:0}); });
  expect(commands).toEqual(['HOLD']);
});

it.each([30, 300, 900, 4000])('HOLD bypasses a delayed ACK (%i ms), without polling or obsolete renewals', async delay => {
  vi.useFakeTimers();
  const calls: {url: string; command?: string}[] = [];
  const value = {angle: 100, state: 'holding', epoch: 7, deviceTimeMs: 0};
  vi.spyOn(httpClient, 'request').mockImplementation(async (_url, options) => {
    const command = (options?.body as {command?: string})?.command;
    calls.push({url: _url, command});
    if (command === 'INCREASE') {
      // Deliberately ignore cancellation to model a response already in transit.
      await new Promise(resolve => setTimeout(resolve, delay));
      return {...value, angle: 130, state: 'increasing'} as never;
    }
    return value as never;
  });
  render(<ServoPanel />);
  await act(async () => { fireEvent.keyDown(window, {key: 'e'}); });
  await act(async () => { fireEvent.keyUp(window, {key: 'e'}); });
  expect(calls.at(-1)?.command).toBe('HOLD');
  await act(async () => { await vi.advanceTimersByTimeAsync(delay); });
  expect(calls.filter(c => c.command === 'INCREASE')).toHaveLength(1);
  expect(screen.getByText(/Ángulo comandado/).textContent).toContain('100°');
});
it('coalesces direction changes, reuses the session and suppresses polling during control', async () => {
  vi.useFakeTimers();
  let release!: (value: unknown) => void;
  const commands: string[] = [];
  let sessions = 0, polls = 0;
  const value = {angle:100,state:'increasing',epoch:4,deviceTimeMs:0};
  vi.spyOn(httpClient, 'request').mockImplementation(async (url, options) => {
    if (url.endsWith('/session')) sessions++;
    if (!options?.mutation) polls++;
    const command = (options?.body as {command?:string})?.command;
    if (command) commands.push(command);
    if (command === 'INCREASE') return await new Promise<unknown>(r => {release = r;}) as never;
    return value as never;
  });
  render(<ServoPanel />);
  await act(async () => {fireEvent.keyDown(window,{key:'e'});});
  await act(async () => {fireEvent.keyDown(window,{key:'q'}); await vi.advanceTimersByTimeAsync(500);});
  expect(commands).toEqual(['INCREASE']);
  expect(polls).toBe(1);
  await act(async () => {release(value);});
  expect(commands).toEqual(['INCREASE','DECREASE']);
  expect(sessions).toBe(1);
  await act(async () => {fireEvent.blur(window);});
  expect(commands.at(-1)).toBe('HOLD');
});
it('timeout fails closed, and unmount while acquiring closes the late session', async () => {
  let reject!: (error: Error) => void;
  const commands: string[] = [];
  vi.spyOn(httpClient, 'request').mockImplementation(async (_url, options) => {
    const command = (options?.body as {command?:string})?.command;
    if (command) commands.push(command);
    if (command === 'INCREASE') return await new Promise((_r,j) => {reject=j;}) as never;
    return {angle:100,state:'holding',epoch:9,deviceTimeMs:0} as never;
  });
  const view = render(<ServoPanel />);
  await act(async () => {fireEvent.keyDown(window,{key:'e'});});
  await act(async () => {reject(new Error('timeout'));});
  expect(commands).toEqual(['INCREASE','HOLD']);
  view.unmount();
  let resolve!: (value: unknown) => void;
  vi.mocked(httpClient.request).mockImplementation(async (url, options) => {
    if (url.endsWith('/session')) return await new Promise<unknown>(r => {resolve=r;}) as never;
    const command = (options?.body as {command?:string})?.command;
    if(command) commands.push(command);
    return {angle:100,state:'holding',epoch:10,deviceTimeMs:0} as never;
  });
  const next = render(<ServoPanel />);
  await act(async () => {fireEvent.keyDown(window,{key:'q'});});
  next.unmount();
  await act(async () => {resolve({angle:100,state:'holding',epoch:10,deviceTimeMs:0});});
  expect(commands).toEqual(['INCREASE','HOLD','HOLD']);
});
it('coalesces E/Q during acquisition and releasing Q returns to held E without a new session', async () => {
  vi.useFakeTimers();
  let acquired!: (value: unknown) => void;
  let sessions = 0;
  const commands: string[] = [];
  const value = {angle:100,state:'decreasing',epoch:15,deviceTimeMs:0};
  vi.spyOn(httpClient, 'request').mockImplementation(async (url, options) => {
    if (url.endsWith('/session')) { sessions++; return await new Promise<unknown>(resolve => {acquired=resolve;}) as never; }
    const command=(options?.body as {command?:string})?.command;
    if(command) commands.push(command);
    return value as never;
  });
  render(<ServoPanel />);
  await act(async () => {fireEvent.keyDown(window,{key:'e'}); fireEvent.keyDown(window,{key:'q'});});
  await act(async () => {acquired(value);});
  expect(commands).toEqual(['DECREASE']); expect(sessions).toBe(1);
  await act(async () => {fireEvent.keyUp(window,{key:'q'});});
  expect(commands.at(-1)).toBe('INCREASE'); expect(sessions).toBe(1);
  await act(async () => {fireEvent.keyUp(window,{key:'e'});});
  expect(commands.at(-1)).toBe('HOLD');
});
it.each(['completed', 'explicit HOLD', 'blur'])('short R release continues CENTER until %s', async end => {
  vi.useFakeTimers();
  const commands: string[] = [];
  let complete = false;
  vi.spyOn(httpClient, 'request').mockImplementation(async (_url, options) => {
    const command = (options?.body as {command?: string})?.command;
    if (command) commands.push(command);
    return {angle: complete ? 100 : 90, state: command === 'CENTER' && !complete ? 'centering' : 'holding', epoch: 22, deviceTimeMs: 0} as never;
  });
  render(<ServoPanel />);
  await act(async () => {fireEvent.keyDown(window, {key:'r'});});
  await act(async () => {fireEvent.keyUp(window, {key:'r'});});
  expect(commands).toEqual(['CENTER']);
  await act(async () => {await vi.advanceTimersByTimeAsync(250);});
  expect(commands).toEqual(['CENTER','CENTER']);
  await act(async () => {
    if (end === 'completed') {complete = true; await vi.advanceTimersByTimeAsync(250);}
    else if (end === 'blur') fireEvent.blur(window);
    else fireEvent.click(screen.getByRole('button', {name:'Detener giro'}));
  });
  expect(commands.at(-1)).toBe('HOLD');
  const count = commands.length;
  await act(async () => {await vi.advanceTimersByTimeAsync(1000);});
  expect(commands).toHaveLength(count);
});

it('failed HOLD discards a direction pressed while stopping and requires a fresh press', async () => {
  let reject!: (error:Error)=>void;
  const commands:string[]=[];
  vi.spyOn(httpClient,'request').mockImplementation(async (_url, options) => {
    const command=(options?.body as {command?:string})?.command;
    if(command) commands.push(command);
    if(command==='HOLD') return await new Promise<unknown>((_r,j)=>{reject=j;}) as never;
    return {angle:100,state:'increasing',epoch:1,deviceTimeMs:0} as never;
  });
  render(<ServoPanel/>);
  await act(async()=>{fireEvent.keyDown(window,{key:'e'});});
  await act(async()=>{fireEvent.keyUp(window,{key:'e'});fireEvent.keyDown(window,{key:'q'});});
  await act(async()=>{reject(new Error('HOLD timeout'));});
  expect(commands).toEqual(['INCREASE','HOLD']);
  expect(screen.getByRole('alert').textContent).toContain('HOLD timeout');
});
