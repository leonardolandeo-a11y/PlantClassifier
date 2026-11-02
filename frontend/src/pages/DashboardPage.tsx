import { DashboardLayout } from '../components/layout/DashboardLayout';
import { SensorGrid } from '../components/sensors/SensorGrid';
import { SensorStatus } from '../components/sensors/SensorStatus';
import { RecommendationPanel } from '../components/recommendation/RecommendationPanel';
import { MovementPanel } from '../components/movement/MovementPanel';
import { useSensors } from '../hooks/useSensors';
export function DashboardPage() { const sensors = useSensors(); return <DashboardLayout><div className="page-heading"><div><div className="eyebrow">ESTACIÓN DE MONITOREO</div><h1>Conoce tu entorno.<br /><span>Encuentra qué cultivar.</span></h1><p className="muted">Lecturas ambientales y control de campo en un solo lugar.</p></div><button id="CaptureData" className="capture" disabled={sensors.phase === 'capturing'} onClick={() => void sensors.capture()}><span aria-hidden="true">↻</span> {sensors.phase === 'capturing' ? 'Capturando…' : 'Capture Data'}</button></div><section aria-label="Sensores"><SensorGrid data={sensors.data} /><SensorStatus {...sensors} /></section><div className="workspace"><RecommendationPanel data={sensors.data} phase={sensors.phase} /><MovementPanel /></div></DashboardLayout>; }
