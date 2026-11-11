import type { CapturePhase } from '../../types/sensor';
export function CapturePanel({phase, capture}: {phase: CapturePhase; capture: () => Promise<void>}) {
  return <section className="capture-panel" aria-label="Captura de datos" aria-busy={phase === 'capturing'}><div><div className="eyebrow">UNA CAPTURA, CUATRO VARIABLES</div><h2>¿Qué nos dice el entorno?</h2><p>Lee los sensores y actualiza la recomendación de cultivo.</p></div><button id="CaptureData" className="capture" disabled={phase === 'capturing'} onClick={() => void capture()}><span aria-hidden="true">＋</span>{phase === 'capturing' ? 'Capturando…' : 'Capturar datos'}<span aria-hidden="true">↗</span></button></section>;
}
