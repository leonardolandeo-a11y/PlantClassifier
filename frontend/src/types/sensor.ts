export interface SensorData {
  id: number;
  ph: number; temperature: number; humidity: number;
  capturedAt: string | null; simulated: boolean | null;
  temperatureSource?: string | null; humiditySource?: string | null; phSource?: string | null;
  soilStatus?: string | null; soilMoisture?: number | null; soilMoistureSource?: string | null;
  prediction: string | null; predictionStatus: string; predictionError: string | null;
  predictionModel?: string | null;
}
export type CapturePhase = 'idle' | 'loading' | 'capturing' | 'ready' | 'error';
