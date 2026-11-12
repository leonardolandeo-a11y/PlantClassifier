export type Status = { angle: number; state: string; epoch: number; deviceTimeMs: number };
export type Command = 'INCREASE' | 'DECREASE' | 'CENTER';
type Request = <T>(url: string, options?: {mutation?: boolean; body?: unknown; signal?: AbortSignal}) => Promise<T | null>;
// Shared by browser and Expo. Only confirmed responses update the visible state.
export function createServoControl(request: Request, onStatus: (status: Status) => void, onError: (error: string) => void) {
    let alive = true, generation = 0, epoch = 0, sequence = 0, busy = false;
    let desired: Command | null = null;
    const held = new Map<string, Command>();
    let holding: Promise<void> | undefined;
    let control: AbortController | undefined;
    let polling: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = (value: Status | null) => { if (alive && value) { onStatus(value); } };
    const fail = (e: unknown) => { if (alive) onError(e instanceof Error ? e.message : 'Estado sin confirmar'); };
    const hold = (id: number, seq: number) => {
      const current = generation;
      const pending = request<Status>('/sensor-servo', { mutation: true, body: { command: 'HOLD', epoch: id, sequence: seq } })
        .then(value => { if (current === generation) update(value); })
        .catch(e => { if (current === generation) { stop(); fail(e); } })
        .finally(() => { if (holding === pending) holding = undefined; if (alive) void pump(); });
      holding = pending;
    };
    const stop = () => {
      ++generation; desired = null; held.clear(); clearTimeout(timer);
      polling?.abort(); control?.abort();
      // HOLD bypasses the in-flight movement ACK. Aborting fetch alone cannot stop a device.
      if (epoch) { const id = epoch; epoch = 0; hold(id, ++sequence); }
    };
    const pump = async () => {
      if (!alive || busy || holding || !desired) return;
      busy = true;
      const current = generation;
      let command = desired;
      const started = performance.now();
      try {
        if (!epoch) {
          // Do not cancel acquisition: its late epoch must be explicitly closed with HOLD.
          const acquired = await request<Status>('/sensor-servo/session', { mutation: true });
          if (!acquired) throw new Error('Sin sesión de servo');
          if (!alive || current !== generation) { hold(acquired.epoch, 1); return; }
          epoch = acquired.epoch; sequence = 0;
        }
        command = desired; // Coalesce changes made while acquiring this same session.
        control = new AbortController();
        const result = await request<Status>('/sensor-servo', {
          mutation: true, signal: control.signal, body: { command, epoch, sequence: ++sequence },
        });
        if (alive && current === generation && command === desired) {
          update(result);
          if (command === 'CENTER' && result?.state === 'holding') stop();
        }
      } catch (e) {
        if (alive && current === generation) { stop(); fail(e); }
      } finally {
        busy = false; control = undefined;
        if (alive && desired && !holding) {
          // One renewal at a time; no backlog after a slow ACK, and direction changes are immediate.
          if (current !== generation || command !== desired) void pump();
          else timer = setTimeout(() => void pump(), Math.max(0, 250 - (performance.now() - started)));
        }
      }
    };
    const start = (command: Command) => {
      if (!alive || desired === command) return;
      desired = command; clearTimeout(timer); polling?.abort();
      void pump();
    };
    const press = (source: string, command: Command) => {
      if (held.has(source)) return;
      held.set(source, command); start(command);
    };
    const release = (source: string) => {
      const released = held.get(source);
      if (!held.delete(source)) return;
      // CENTER is a latched action: a short R press must finish centering.
      // Explicit HOLD, blur, visibility loss and unmount still cancel it.
      if (released === 'CENTER' && desired === 'CENTER') return;
      const next = [...held.values()].at(-1);
      if (next) start(next); else stop();
    };
    const poll = async () => {
      if (!alive || desired || busy || holding || polling) return;
      const current = generation;
      const abort = new AbortController(); polling = abort;
      try {
        const result = await request<Status>('/sensor-servo', { signal: abort.signal });
        if (current === generation && !abort.signal.aborted) update(result);
      } catch (e) { if (current === generation && !abort.signal.aborted) fail(e); }
      finally { if (polling === abort) polling = undefined; }
    };
    void poll(); const pollTimer = setInterval(() => void poll(), 1000);
    return {start, press, release, stop, dispose: () => {
      alive = false; stop(); clearInterval(pollTimer);
    }};
}
