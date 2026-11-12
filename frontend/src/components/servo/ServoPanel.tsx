import { useEffect, useRef, useState } from 'react';
import { httpClient } from '../../api/httpClient';
import { createServoControl, type Status, type Command } from '../../servo/controller';
const stateLabels: Record<string, string> = { holding: 'Detenido', increasing: 'Girando +', decreasing: 'Girando −', centering: 'Centrando', fault: 'Error del servo' };
export function ServoPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const actions = useRef<{ start: (command: Command) => void; press: (source: string, command: Command) => void; release: (source: string) => void; stop: () => void }>({ start: () => {}, press: () => {}, release: () => {}, stop: () => {} });
  useEffect(() => {
    const controller = createServoControl(httpClient.request.bind(httpClient), value => {setStatus(value); setError('');}, setError);
    const {press, release, stop} = controller;
    actions.current = controller;
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName));
    const down = (event: KeyboardEvent) => {
      if (document.hidden || editable(event.target) || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (event.key === 'Escape') { event.preventDefault(); stop(); return; }
      const key = event.key.toLowerCase();
      if (!['e', 'q', 'r'].includes(key)) return;
      event.preventDefault(); press(`key:${key}`, key === 'e' ? 'INCREASE' : key === 'q' ? 'DECREASE' : 'CENTER');
    };
    const up = (event: KeyboardEvent) => { release(`key:${event.key.toLowerCase()}`); };
    const focus = (event: FocusEvent) => { if (editable(event.target)) stop(); };
    const hidden = () => { if (document.hidden) stop(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    window.addEventListener('blur', stop); window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', hidden);
    document.addEventListener('focusin', focus);
    return () => {
      controller.dispose();
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      window.removeEventListener('blur', stop); window.removeEventListener('pagehide', stop);
      document.removeEventListener('visibilitychange', hidden);
      document.removeEventListener('focusin', focus);
    };
  }, []);
  return <section className="panel servo-panel" aria-label="Servo de sensores">
    <div className="eyebrow">ORIENTACIÓN DE SENSORES</div><h2>Orienta los sensores</h2>
    <p className="servo-reading">Ángulo comandado: {status ? `${status.angle}°` : '—'} · Estado: {error ? 'sin confirmar' : (status ? stateLabels[status.state] ?? status.state : 'Conectando…')}</p>
    <p className="muted">Mantén E / Q o los botones para girar. R centra. Límites: 70–130°.</p>
    <div className="servo-actions">{(['INCREASE', 'DECREASE'] as const).map((command, i) => <button key={command}
      aria-pressed={!error && status?.state === (i === 0 ? 'increasing' : 'decreasing')}
      style={{ touchAction: 'none' }}
      onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); actions.current.press(`pointer:${event.pointerId}`, command); }}
      onPointerUp={event => actions.current.release(`pointer:${event.pointerId}`)} onPointerCancel={event => actions.current.release(`pointer:${event.pointerId}`)}
      onLostPointerCapture={event => actions.current.release(`pointer:${event.pointerId}`)}
      onKeyDown={event => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); actions.current.press(`button:${command}`, command); } }}
      onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') actions.current.release(`button:${command}`); }}
      onBlur={() => actions.current.stop()}><span className="servo-arrow" aria-hidden="true">{i === 0 ? '↻' : '↺'}</span><strong>{i === 0 ? 'Girar +' : 'Girar −'}</strong><kbd>{i === 0 ? 'E' : 'Q'}</kbd></button>)}
    <button onClick={() => actions.current.stop()}>Detener giro</button>
    <button onClick={() => actions.current.start('CENTER')}>Centrar</button></div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
