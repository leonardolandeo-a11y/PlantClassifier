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
