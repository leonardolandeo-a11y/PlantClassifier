import { ControlRejected } from '../movement/controller';

type Csrf = { headerName: string; token: string };
export class HttpClient {
  private csrf: Promise<Csrf> | undefined;
  initializeCsrf(): Promise<Csrf> {
    return this.csrf ??= fetch('/csrf', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(35000) })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to initialize session protection');
        const csrf = await response.json() as Csrf;
        if (!csrf.headerName || !csrf.token) throw new Error('Invalid session protection response');
        return csrf;
      }).catch(error => { this.csrf = undefined; throw error; });
  }
  async request<T>(url: string, options: { mutation?: boolean; body?: unknown; signal?: AbortSignal } = {}): Promise<T | null> {
    if (!url.startsWith('/sensor-servo')) return this.perform<T>(url, options);
    const operation = url.endsWith('/session') ? 'acquire' : (options.body as { command?: string })?.command ?? 'status';
    const name = `servo:${operation}:ack`;
    const start = performance.now();
    try { return await this.perform<T>(url, options); }
    finally {
      // Keep only the latest sample per operation; inspect via browser Performance API.
      performance.clearMeasures(name);
      performance.measure(name, { start, end: performance.now() });
    }
  }
  private async perform<T>(url: string, options: { mutation?: boolean; body?: unknown; signal?: AbortSignal }): Promise<T | null> {
    const { mutation = false, body, signal } = options;
    const headers: Record<string, string> = {};
    if (mutation) {
      const csrf = await this.initializeCsrf();
      headers[csrf.headerName] = csrf.token;
    }
    // A cancelled sensor read must not start after a deferred CSRF bootstrap.
    signal?.throwIfAborted();
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const timeout = AbortSignal.timeout((url.startsWith('/movement') || url.startsWith('/sensor-servo')) ? 1200 : 35000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: mutation ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        keepalive: (url === '/movement' && (body as { command?: string })?.command === 'STOP') || (url === '/sensor-servo' && (body as { command?: string })?.command === 'HOLD'),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error('Network failure or request timeout — device state unconfirmed', { cause: error });
    }
    if (!response.ok) {
      if (response.status === 403) { this.csrf = undefined; throw new Error('Session protection expired; reload the page'); }
      const problem = await response.json().catch(() => null) as { type?: string } | null;
      const category = problem?.type?.replace('urn:plantclassifier:', '');
      const messages: Record<string, string> = {
        'capture-deferred': 'Suelta el servo y vuelve a capturar. La lectura se aplazó para mantener el control seguro.',
        'stale-sample': 'La muestra ha caducado. Suelta el servo y captura otra vez.',
        'broker-disconnected': 'Broker MQTT desconectado. Suelta los controles y vuelve a pulsar después de reconectar.',
        'device-disconnected': 'ESP32 desconectada o reiniciada. El estado no está confirmado.',
        'device-ack-timeout': 'Sin confirmación del ESP32. Suelta los controles; el watchdog sigue activo.',
      };
      if (category && messages[category]) throw new Error(messages[category]);
      if (response.status === 409) throw new ControlRejected('Command rejected: control expired or superseded');
      if (response.status === 504) throw new Error('Device timed out');
      if (response.status === 502) throw new Error('Device unreachable or invalid response');
      throw new Error(`Request failed (${response.status})`);
    }
    return response.status === 204 ? null : await response.json() as T;
  }
}
// Shared CSRF bootstrap and cookie session across sensors and robot; never a device token.
export const httpClient = new HttpClient();
