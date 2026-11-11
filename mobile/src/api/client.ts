import type { SensorData } from '../../../frontend/src/types/sensor';
export type { SensorData };
type Csrf = { headerName: string; token: string };
export class SensorClient {
  private csrf?: Csrf;
  private readonly origin: string;
  constructor(address: string) {
    const url = new URL(address.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Introduce el origen HTTP(S) del backend, sin rutas ni credenciales.');
    this.origin = url.origin;
  }
  private async request<T>(path: string, signal: AbortSignal, mutation = false): Promise<T | null> {
    const headers: Record<string, string> = {};
    if (mutation) {
      if (!this.csrf) this.csrf = await this.request<Csrf>('/csrf', signal) ?? undefined;
      if (!this.csrf?.headerName || !this.csrf.token) throw new Error('No se pudo iniciar la protección de sesión.');
      headers[this.csrf.headerName] = this.csrf.token;
    }
    const response = await fetch(this.origin + path, { method: mutation ? 'POST' : 'GET', credentials: 'include', headers, signal });
    if (!response.ok) {
      if (response.status === 403) this.csrf = undefined;
      throw new Error(response.status === 403 ? 'Sesión vencida. Vuelve a intentar la captura.' : `No se pudo completar la lectura (HTTP ${response.status}).`);
    }
    return response.status === 204 ? null : response.json() as Promise<T>;
  }
  latest(signal: AbortSignal) { return this.request<SensorData>('/sensors', signal); }
  capture(signal: AbortSignal) { return this.request<SensorData>('/sensors/capture', signal, true); }
}
