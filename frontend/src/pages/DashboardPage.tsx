import { useState } from 'react';
import { ServoPanel } from '../components/servo/ServoPanel';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import type { Section } from '../components/navigation/Sidebar';
import { SensorGrid } from '../components/sensors/SensorGrid';
import { SensorStatus } from '../components/sensors/SensorStatus';
import { RecommendationPanel } from '../components/recommendation/RecommendationPanel';
import { MovementPanel } from '../components/movement/MovementPanel';
import { useSensors } from '../hooks/useSensors';
const headings = {
  sensors: ['01 / OBSERVAR', 'Toma de datos', 'Cada buena decisión comienza con una lectura del entorno.'],
  movement: ['02 / EXPLORAR', 'Movimiento', 'Controla el robot y encuentra el siguiente punto de captura.'],
  results: ['03 / DESCUBRIR', 'Respuesta de datos', 'Transforma las variables de tu entorno en una recomendación.'],
};
export function DashboardPage() {
  const sensors = useSensors();
  const [active, setActive] = useState<Section>('sensors');
  const [eyebrow, title, description] = headings[active];
  return <DashboardLayout active={active} onNavigate={setActive}>
    <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="muted">{description}</p></div>{active === 'sensors' && <button id="CaptureData" className="capture" disabled={sensors.phase === 'capturing'} onClick={() => void sensors.capture()}><span aria-hidden="true">＋</span>{sensors.phase === 'capturing' ? 'Capturando…' : 'Capturar datos'}</button>}</div>
    {active === 'sensors' && <div className="view-stack"><section aria-label="Sensores"><div className="section-heading"><h2>Lecturas del entorno</h2><span className="subtle">4 variables ambientales</span></div><SensorGrid data={sensors.data} /><SensorStatus {...sensors} /></section><ServoPanel /><div className="next-step"><div><strong>¿Todo listo para descubrir tu cultivo?</strong><p>Consulta el resultado y las variables de la última captura.</p></div><button className="text-button" onClick={() => setActive('results')}>Ver respuesta <span aria-hidden="true">↗</span></button></div></div>}
    {active === 'movement' && <MovementPanel />}
    {active === 'results' && <><RecommendationPanel data={sensors.data} phase={sensors.phase} /><div className="next-step"><p>Una nueva captura actualiza la recomendación.</p><button className="text-button" onClick={() => setActive('sensors')}>Volver a toma de datos <span aria-hidden="true">↗</span></button></div></>}
  </DashboardLayout>;
}
