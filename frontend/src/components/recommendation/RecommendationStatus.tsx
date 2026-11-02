import type { CapturePhase, SensorData } from '../../types/sensor';
export function recommendation(data: SensorData | null, phase: CapturePhase) {
 if (phase === 'capturing') return ['Captura en curso', 'Recomendación pendiente para la nueva lectura.'];
 if (phase === 'error') return ['Sin nueva recomendación', 'No se pudo completar la captura. Inténtalo de nuevo.'];
 if (!data || phase === 'loading') return ['Tu próximo cultivo', 'Captura los cuatro sensores para obtener una recomendación.'];
 if (data.predictionStatus === 'OUT_OF_DOMAIN') return ['Fuera del rango del modelo', 'La lectura está fuera del rango de entrenamiento. No hay una recomendación fiable para estos valores.'];
 if (data.predictionStatus === 'PENDING') return ['Recomendación pendiente', 'Se requieren cuatro lecturas válidas. Revisa el estado de los sensores.'];
 if (data.predictionStatus === 'SUCCEEDED') {
  if (data.predictionModel === 'synthetic-five-crops-v2' && data.prediction && ['frijol','tomate','sandía','melón','lechuga'].includes(data.prediction)) return [data.prediction[0].toUpperCase() + data.prediction.slice(1), 'Cultivo sugerido según esta captura ambiental.'];
  return ['Resultado histórico', 'Realiza una nueva captura con el modelo actual.'];
 }
 return ['Predicción fallida', 'La medición se guardó, pero no se pudo generar una recomendación.'];
}
export function RecommendationStatus({data, phase}: {data: SensorData | null; phase: CapturePhase}) { const [title, description] = recommendation(data, phase); return <div id="prediction" role="status"><h3>{title}</h3><p>{description}</p></div>; }
