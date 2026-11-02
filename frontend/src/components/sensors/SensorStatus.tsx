import type { CapturePhase, SensorData } from '../../types/sensor';
export function SensorStatus({data, phase, error}: {data: SensorData | null; phase: CapturePhase; error: string | null}) {
 const origin = data?.phSource === 'potentiometer' ? `Temperature: ${data.temperatureSource ?? 'unknown'}; humidity: ${data.humiditySource ?? 'unknown'}; pH (potentiometer simulation)` : data?.phSource === 'software' ? 'Software simulated measurements' : data?.simulated ? 'Simulated measurements (sources unknown)' : 'Sensor measurements';
 return <p id="sensorStatus" className="sensor-status" role="status">{error ?? (phase === 'capturing' ? 'Capturando nuevas lecturas…' : phase === 'loading' ? 'Cargando última captura…' : data ? `${origin} · ${data.capturedAt ? new Date(data.capturedAt).toLocaleString() : 'Fecha no disponible'}` : 'Sin capturas todavía')}</p>;
}
