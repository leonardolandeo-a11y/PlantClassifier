import { useEffect, useRef, useState } from 'react';
import { httpClient } from '../../api/httpClient';
type Status = { angle: number; state: string; epoch: number; deviceTimeMs: number };
type Command = 'INCREASE' | 'DECREASE' | 'CENTER';
const stateLabels: Record<string, string> = { holding: 'Detenido', increasing: 'Girando +', decreasing: 'Girando −', centering: 'Centrando', fault: 'Error del servo' };
export function ServoPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const actions = useRef<{ start: (command: Command) => void; stop: () => void }>({ start: () => {}, stop: () => {} });
  useEffect(() => {
    let alive = true, generation = 0, epoch = 0, sequence = 0, busy = false;
    let desired: Command | null = null;
    let holding: Promise<void> | undefined;
    let control: AbortController | undefined;
    let polling: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = (value: Status | null) => { if (alive && value) { setStatus(value); setError(''); } };
    const fail = (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'Estado sin confirmar'); };
    const hold = (id: number, seq: number) => {
      const current = generation;
      const pending = httpClient.request<Status>('/sensor-servo', { mutation: true, body: { command: 'HOLD', epoch: id, sequence: seq } })
        .then(value => { if (current === generation) update(value); })
        .catch(e => { if (current === generation) fail(e); })
        .finally(() => { if (holding === pending) holding = undefined; if (alive) void pump(); });
      holding = pending;
    };
    const stop = () => {
      ++generation; desired = null; clearTimeout(timer);
      polling?.abort(); control?.abort();
      // HOLD bypasses the in-flight movement ACK. Aborting fetch alone cannot stop a device.
      if (epoch) { const id = epoch; epoch = 0; hold(id, ++sequence); }
    };
    const pump = async () => {
      if (!alive || busy || holding || !desired) return;
      busy = true;
      const current = generation;
      const command = desired;
      const started = performance.now();
      try {
        if (!epoch) {
          // Do not cancel acquisition: its late epoch must be explicitly closed with HOLD.
          const acquired = await httpClient.request<Status>('/sensor-servo/session', { mutation: true });
          if (!acquired) throw new Error('Sin sesión de servo');
          if (!alive || current !== generation) { hold(acquired.epoch, 1); return; }
          epoch = acquired.epoch; sequence = 0;
        }
        control = new AbortController();
        const result = await httpClient.request<Status>('/sensor-servo', {
          mutation: true, signal: control.signal, body: { command, epoch, sequence: ++sequence },
        });
        if (alive && current === generation) {
          update(result);
          if (command === 'CENTER' && result?.state === 'holding') stop();
        }
      } catch (e) {
        if (alive && current === generation) { stop(); fail(e); }
      } finally {
        busy = false; control = undefined;
        if (alive && desired && !holding) {
          // One renewal at a time; no backlog after a slow ACK, and direction changes are immediate.
          if (current !== generation) void pump();
          else timer = setTimeout(() => void pump(), Math.max(0, 250 - (performance.now() - started)));
        }
      }
    };
    const start = (command: Command) => {
      if (!alive || desired === command) return;
      ++generation; desired = command; clearTimeout(timer); polling?.abort();
      void pump();
    };
    actions.current = { start, stop };
    const poll = async () => {
      if (!alive || desired || busy || holding || polling) return;
      const current = generation;
      const abort = new AbortController(); polling = abort;
      try {
        const result = await httpClient.request<Status>('/sensor-servo', { signal: abort.signal });
        if (current === generation && !abort.signal.aborted) update(result);
      } catch (e) { if (current === generation && !abort.signal.aborted) fail(e); }
      finally { if (polling === abort) polling = undefined; }
    };
    void poll(); const pollTimer = setInterval(() => void poll(), 1000);
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName));
    const down = (event: KeyboardEvent) => {
      if (editable(event.target) || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (event.key === 'Escape') { event.preventDefault(); stop(); return; }
      const key = event.key.toLowerCase();
      if (!['e', 'q', 'r'].includes(key)) return;
      event.preventDefault(); void start(key === 'e' ? 'INCREASE' : key === 'q' ? 'DECREASE' : 'CENTER');
    };
    const up = (event: KeyboardEvent) => { if (['e', 'q'].includes(event.key.toLowerCase())) stop(); };
    const hidden = () => { if (document.hidden) stop(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    window.addEventListener('blur', stop); window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      alive = false; stop(); clearInterval(pollTimer);
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      window.removeEventListener('blur', stop); window.removeEventListener('pagehide', stop);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  return <section className="panel servo-panel" aria-label="Servo de sensores">
    <div className="eyebrow">ORIENTACIÓN DE SENSORES</div><h2>Orienta los sensores</h2>
    <p className="servo-reading">Ángulo comandado: {status ? `${status.angle}°` : '—'} · Estado: {error ? 'sin confirmar' : (status ? stateLabels[status.state] ?? status.state : 'Conectando…')}</p>
    <p className="muted">Mantén E / Q o los botones para girar. R centra. Límites: 70–130°.</p>
    <div className="servo-actions">{(['INCREASE', 'DECREASE'] as const).map((command, i) => <button key={command}
      aria-pressed={!error && status?.state === (i === 0 ? 'increasing' : 'decreasing')}
      style={{ touchAction: 'none' }}
      onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); actions.current.start(command); }}
      onPointerUp={() => actions.current.stop()} onPointerCancel={() => actions.current.stop()}
      onLostPointerCapture={() => actions.current.stop()}
      onKeyDown={event => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); actions.current.start(command); } }}
      onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') actions.current.stop(); }}
      onBlur={() => actions.current.stop()}><span className="servo-arrow" aria-hidden="true">{i === 0 ? '↻' : '↺'}</span><strong>{i === 0 ? 'Girar +' : 'Girar −'}</strong><kbd>{i === 0 ? 'E' : 'Q'}</kbd></button>)}
    <button onClick={() => actions.current.stop()}>Detener giro</button>
    <button onClick={() => actions.current.start('CENTER')}>Centrar</button></div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
