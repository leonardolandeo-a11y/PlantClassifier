import type { CapturePhase, SensorData } from '../../types/sensor';
import { numeric, soilValue } from '../../utils/sensors';
import { Icon } from '../layout/Icon';
import { RecommendationStatus } from './RecommendationStatus';
export function RecommendationPanel({data, phase}: {data: SensorData | null; phase: CapturePhase}) {
  return <section className="results-layout" aria-label="Recomendación de cultivo"><div className="panel recommendation"><div className="eyebrow">ANÁLISIS DEL CULTIVO</div><h2>Recomendación inteligente</h2><div className="plant-symbol"><Icon name="leaf" /></div><RecommendationStatus data={data} phase={phase} /><div className="model-note"><span className="badge">Modelo experimental · Random Forest</span><p>Entrenado con datos sintéticos. Orientación de laboratorio, no asesoría agronómica.</p><small>synthetic-five-crops-v2 · 4 variables · 5 cultivos</small></div></div>
    <aside className="panel variables"><div className="eyebrow">CONTEXTO DEL RESULTADO</div><h2>Variables de la captura</h2><p className="muted">{phase === 'capturing' || phase === 'error' ? 'Última captura disponible; no corresponde a una nueva recomendación.' : 'Lecturas asociadas al resultado mostrado.'}</p><dl>{[['Temperatura', `${numeric(data?.temperature)} °C`], ['Humedad del aire', `${numeric(data?.humidity)} %`], ['Humedad del suelo', soilValue(data)], ['pH del suelo', numeric(data?.ph, 2)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="capture-date"><span>Última captura</span><strong>{data?.capturedAt ? new Date(data.capturedAt).toLocaleString() : 'Sin fecha disponible'}</strong></div></aside>
  </section>;
}
