import { useCallback, useEffect, useRef, useState } from 'react';
import { MovementControl, type Command, type ControlState, type Transport } from '../movement/controller';
import { movementApi } from '../api/movementApi';

type Snapshot = { message: string; state: ControlState; command: Command; pressed: string[] };
const initial: Snapshot = { message: 'Ready for keyboard control — press W/A/S/D', state: 'IDLE', command: 'STOP', pressed: [] };
const commands: Record<string, Command> = { w: 'FORWARD', a: 'LEFT', s: 'BACKWARD', d: 'RIGHT' };
type Runtime = { control: MovementControl; held: Map<string, string>; publish: () => void };

export function useMovement(transport: Transport = movementApi) {
  const runtime = useRef<Runtime | null>(null);
  const [snapshot, setSnapshot] = useState(initial);
  useEffect(() => {
    let alive = true;
    let message = initial.message;
    const held = new Map<string, string>();
    const command = () => commands[Array.from(held.values()).at(-1) ?? ''] ?? 'STOP';
    const publish = () => { if (alive) setSnapshot({ message, state: control.state, command: command(), pressed: [...held.values()] }); };
    const control = new MovementControl(transport, text => {
      message = text;
      // Publish after the controller completes its synchronous state transition.
      queueMicrotask(publish);
    }, () => { held.clear(); queueMicrotask(publish); });
    runtime.current = { control, held, publish };
    return () => {
      alive = false; runtime.current = null; held.clear();
      // Pending acquisition is allowed to finish only to deliver its priority STOP.
      // Never abort that request or its STOP on unmount/StrictMode cleanup.
      control.dispose();
    };
  }, [transport]);

  const press = useCallback((key: string, source = `key:${key}`) => {
    const r = runtime.current;
    if (!r || !commands[key] || r.held.has(source)) return;
    r.held.set(source, key); r.control.set(commands[key]); r.publish();
  }, []);
  const release = useCallback((source: string) => {
    const r = runtime.current;
    if (!r || !r.held.delete(source)) return;
    const next = commands[Array.from(r.held.values()).at(-1) ?? ''] ?? 'STOP';
    r.control.set(next); r.publish();
  }, []);
  const stop = useCallback(() => {
    const r = runtime.current;
    if (r) { r.held.clear(); r.control.stop(); r.publish(); }
  }, []);
  return { ...snapshot, press, release, stop };
}
