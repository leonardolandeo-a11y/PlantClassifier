import type { SensorData } from '../types/sensor';
export function soilValue(data: SensorData | null) {
 if (data?.soilStatus === 'invalid') return 'Lectura no válida';
 if (data?.soilStatus === 'calibration-pending') return 'Calibración pendiente';
 const value = data?.soilMoisture;
 return (!data?.soilStatus || data.soilStatus === 'calibrated') && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? `${Math.round(value)} %` : 'Sin datos disponibles';
}
export function numeric(value: number | undefined, digits = 1) { return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—'; }
