import { useMovement } from '../../hooks/useMovement';
import { useKeyboardMovement } from '../../hooks/useKeyboardMovement';
import { DirectionButton } from './DirectionButton';
import { MovementStatus } from './MovementStatus';
export function MovementPanel() { const movement = useMovement(); useKeyboardMovement(movement.press, movement.release, movement.stop);
 return <section className="panel movement"><div className="eyebrow">CONTROL DEL ROBOT</div><h2>Explora el terreno</h2><p className="muted">Mantén una tecla o botón para mover. Suelta para detener.</p><div className="direction-pad">{[['w','Adelante','↑'],['a','Izquierda','←'],['s','Atrás','↓'],['d','Derecha','→']].map(([letter,label,arrow]) => <DirectionButton key={letter} {...{letter,label,arrow}} active={movement.pressed.includes(letter)} press={movement.press} release={movement.release} />)}<button id="StopMovement" className="stop" onClick={movement.stop}>■ STOP</button></div><MovementStatus state={movement.state} message={movement.message} /><p className="safety-note">ESC para detener · Parada automática al perder el foco</p></section>;
}
