import { useState } from 'react';
import { ServoPanel } from '../components/servo/ServoPanel';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import type { Section } from '../components/navigation/Sidebar';
import { SensorGrid } from '../components/sensors/SensorGrid';
import { SensorStatus } from '../components/sensors/SensorStatus';
import { RecommendationPanel } from '../components/recommendation/RecommendationPanel';
import { MovementPanel } from '../components/movement/MovementPanel';
import { CapturePanel } from '../components/sensors/CapturePanel';
import { useSensors } from '../hooks/useSensors';
export function DashboardPage() {
  const sensors = useSensors();
  const [active, setActive] = useState<Section>('sensors');
  return <DashboardLayout active={active} onNavigate={setActive}>
    <div className="page-heading"><div><div className="eyebrow">FIELD LAB / {active === 'sensors' ? '01' : '02'}</div><h1>{active === 'sensors' ? 'Datos' : 'Movimiento'}</h1><p className="muted">{active === 'sensors' ? 'Conoce el entorno. Encuentra tu próximo cultivo.' : 'El control del terreno, en tus manos.'}</p></div><span className="workspace-label">{active === 'sensors' ? 'LECTURA Y ANÁLISIS' : 'CARRO + SERVO'}</span></div>
    {active === 'sensors' ? <div className="view-stack">
      <CapturePanel phase={sensors.phase} capture={sensors.capture} />
      <section aria-label="Sensores"><div className="section-heading"><h2>Lecturas del entorno</h2><span className="subtle">Última captura · 4 variables</span></div><SensorGrid data={sensors.data} /><SensorStatus {...sensors} /></section>
      <RecommendationPanel data={sensors.data} phase={sensors.phase} />
    </div> : <div className="control-layout"><MovementPanel /><ServoPanel /></div>}
  </DashboardLayout>;
}
