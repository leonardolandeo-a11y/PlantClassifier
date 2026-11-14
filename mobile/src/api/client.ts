import type { SensorData } from '../../../frontend/src/types/sensor';
import { ControlRejected } from '../../../frontend/src/movement/controller';
export type { SensorData };
type Csrf = { headerName: string; token: string };
export class ServerResponseError extends Error {}
export class SensorClient {
  private csrf?: Promise<Csrf>;
  private readonly origin: string;
  constructor(address: string) {
    const url = new URL(address.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Introduce el origen HTTP(S) del backend, sin rutas ni credenciales.');
    this.origin = url.origin;
  }
  private initialize(): Promise<Csrf> {
    return this.csrf ??= this.request<Csrf>('/csrf').then(value => {
      if (!value?.headerName || !value.token) throw new Error('Protección de sesión inválida.');
      return value;
    }).catch(error => {this.csrf = undefined; throw error;});
  }
  async request<T>(path: string, options: {signal?: AbortSignal; mutation?: boolean; body?: unknown} = {}): Promise<T | null> {
    const {signal, mutation, body} = options;
    const abort = new AbortController();
    const cancel = () => abort.abort();
    signal?.addEventListener('abort', cancel, {once:true});
    const timer = setTimeout(cancel, path.startsWith('/sensors') ? 35000 : 1200);
    try {
      const headers: Record<string, string> = {};
      if (mutation) {const csrf = await this.initialize(); headers[csrf.headerName] = csrf.token;}
      if (signal?.aborted || abort.signal.aborted) throw new Error('Petición cancelada.');
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(this.origin + path, {method:mutation ? 'POST' : 'GET', credentials:'include', headers,
        signal:abort.signal, body:body === undefined ? undefined : JSON.stringify(body)});
      if (!response.ok) {
        if (response.status === 403) {this.csrf = undefined; throw new ServerResponseError('Sesión vencida. Suelta los controles y vuelve a intentarlo.');}
        const problem = await response.json().catch(() => null) as {type?: string} | null;
        const category = problem?.type?.replace('urn:plantclassifier:', '');
        const messages: Record<string,string> = {
          'stale-sample': 'La muestra ha caducado. Suelta el servo y captura otra vez.',
          'capture-busy': 'Hay otra captura en curso. Vuelve a intentarlo al finalizar.',
          'capture-deferred': 'Suelta el servo y vuelve a capturar. La lectura se aplazó para mantener el control seguro.',
          'sensor-invalid': 'El sensor devolvió una lectura inválida. No se guardó una medición nueva.',
          'sensor-data': 'Lectura fuera de rango o incompleta. No se guardó una medición nueva.',
          'persistence': 'No se pudo guardar la medición en PostgreSQL.',
          'broker-disconnected': 'Broker MQTT desconectado. Estado del dispositivo sin confirmar.',
          'device-disconnected': 'ESP32 desconectada o reiniciada. Estado sin confirmar.',
          'device-ack-timeout': 'Sin confirmación del ESP32. El watchdog sigue activo.',
          'device-timeout': 'El dispositivo no respondió a tiempo.',
          'device-communication': 'No se pudo obtener una respuesta válida del dispositivo.',
          'mqtt-busy': 'Transporte MQTT saturado. Vuelve a intentarlo al finalizar.',
        };
        if (category && messages[category]) throw new ServerResponseError(messages[category]);
        if (response.status === 409 && (path === '/movement' || path.startsWith('/movement/') || path.startsWith('/sensor-servo'))) throw new ControlRejected('Control caducado o reemplazado.');
        throw new ServerResponseError(`Petición rechazada (HTTP ${response.status}).`);
      }
      return response.status === 204 ? null : await response.json() as T;
    } finally {clearTimeout(timer); signal?.removeEventListener('abort', cancel);}
  }
  latest(signal: AbortSignal) { return this.request<SensorData>('/sensors', {signal}); }
  capture(signal: AbortSignal) { return this.request<SensorData>('/sensors/capture', {signal,mutation:true}); }
}
