import type { ControlState } from '../../movement/controller';
const labels: Record<ControlState, string> = { IDLE: 'En espera', ACQUIRING: 'Abriendo sesión', ACTIVE: 'Control activo', STOPPING: 'Deteniendo', ERROR: 'Error de control' };
export function MovementStatus({state, message}: {state: ControlState; message: string}) {
  return <div className={`movement-status state-${state}`}><span className="badge"><span className="status-dot" aria-hidden="true" />{labels[state]}</span><p id="movementStatus" role={state === 'ERROR' ? 'alert' : 'status'}>{message}</p></div>;
}
