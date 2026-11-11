import type { CapturePhase, SensorData } from '../../types/sensor';
export function SensorStatus({data, phase, error}: {data: SensorData | null; phase: CapturePhase; error: string | null}) {
  const origin = data?.phSource === 'potentiometer' ? 'Lectura de sensores · pH simulado con potenciómetro' : data?.phSource === 'software' ? 'Lecturas simuladas por software' : data?.simulated ? 'Lecturas simuladas' : 'Lectura de sensores';
  return <div className={`sensor-status ${error ? 'status-error' : ''}`} role="status"><span className="status-dot" aria-hidden="true" /><p id="sensorStatus">{error ?? (phase === 'capturing' ? 'Capturando nuevas lecturas…' : phase === 'loading' ? 'Cargando última captura…' : data ? `${origin} · Última captura: ${data.capturedAt ? new Date(data.capturedAt).toLocaleString() : 'fecha no disponible'}` : 'Sin capturas todavía. Captura datos para comenzar.')}</p></div>;
}
