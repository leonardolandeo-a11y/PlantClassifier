import type { ControlState } from '../../movement/controller';
export function MovementStatus({state, message}: {state: ControlState; message: string}) { return <div className={`movement-status state-${state}`}><span className="badge">{state}</span><p id="movementStatus" role="status">{message}</p></div>; }
