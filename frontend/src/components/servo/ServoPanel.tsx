import { useEffect, useRef, useState } from 'react';
import { httpClient } from '../../api/httpClient';
type Status = { angle: number; state: string; epoch: number; deviceTimeMs: number };
type Command = 'INCREASE' | 'DECREASE' | 'CENTER';
export function ServoPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const actions = useRef<{ start: (command: Command) => void; stop: () => void }>({ start: () => {}, stop: () => {} });
  useEffect(() => {
    let alive = true, generation = 0, epoch = 0, sequence = 0, busy = false;
    let desired: Command | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = (value: Status | null) => { if (alive && value) { setStatus(value); setError(''); } };
    const fail = (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'Estado sin confirmar'); };
    const hold = (id: number, seq: number) => httpClient.request<Status>('/sensor-servo', { mutation: true, body: { command: 'HOLD', epoch: id, sequence: seq } });
    const stop = () => {
      ++generation; desired = null; clearInterval(timer);
      const id = epoch; epoch = 0;
      if (id) void hold(id, ++sequence).then(update).catch(fail);
    };
    const start = async (command: Command) => {
      if (desired === command) return;
      stop(); desired = command;
      const current = generation;
      try {
        const acquired = await httpClient.request<Status>('/sensor-servo/session', { mutation: true });
        if (!acquired) throw new Error('Sin sesión de servo');
        if (!alive || generation !== current) { await hold(acquired.epoch, 1); return; }
        epoch = acquired.epoch; sequence = 0;
        const send = async () => {
          if (busy || generation !== current || !desired) return;
          busy = true;
          try {
            const result = await httpClient.request<Status>('/sensor-servo', { mutation: true, body: { command, epoch, sequence: ++sequence } });
            if (generation === current) {
              update(result);
              if (result?.state === 'holding' && command === 'CENTER') stop();
            }
          } catch (e) { if (generation === current) { stop(); fail(e); } }
          finally { busy = false; }
        };
        void send(); timer = setInterval(() => void send(), 250);
      } catch (e) { if (generation === current) { stop(); fail(e); } }
    };
    actions.current = { start: command => { void start(command); }, stop };
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try { update(await httpClient.request<Status>('/sensor-servo')); } catch (e) { fail(e); } finally { polling = false; }
    };
    void poll(); const pollTimer = setInterval(() => void poll(), 500);
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName));
    const down = (event: KeyboardEvent) => {
      if (editable(event.target) || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
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
    <div className="eyebrow">ORIENTACIÓN DE SENSORES</div><h2>Servo MG996R · Sensores</h2>
    <p>Ángulo comandado: {status ? `${status.angle}°` : '—'} · Estado: {error ? 'sin confirmar' : status?.state ?? 'conectando'}</p>
    <p>Mantén E / Q o los botones para girar. R centra. Límites: 70–130°.</p>
    <div className="servo-actions">{(['INCREASE', 'DECREASE'] as const).map((command, i) => <button key={command}
      style={{ touchAction: 'none' }}
      onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); actions.current.start(command); }}
      onPointerUp={() => actions.current.stop()} onPointerCancel={() => actions.current.stop()}
      onLostPointerCapture={() => actions.current.stop()}
      onKeyDown={event => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); actions.current.start(command); } }}
      onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') actions.current.stop(); }}
      onBlur={() => actions.current.stop()}>{i === 0 ? 'Girar +' : 'Girar −'}</button>)}
    <button onClick={() => actions.current.stop()}>Detener giro</button>
    <button onClick={() => actions.current.start('CENTER')}>Centrar</button></div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
