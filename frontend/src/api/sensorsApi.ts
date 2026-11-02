import { httpClient } from './httpClient';
import type { SensorData } from '../types/sensor';
export const sensorsApi = {
  latest: (signal: AbortSignal) => httpClient.request<SensorData>('/sensors', { signal }),
  capture: (signal: AbortSignal) => httpClient.request<SensorData>('/sensors/capture', { mutation: true, signal }),
};
