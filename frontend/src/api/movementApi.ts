import { httpClient } from './httpClient';
import type { Acknowledgement, Transport } from '../movement/controller';
export const movementApi: Transport = {
  async acquire() {
    const result = await httpClient.request<{ sessionId: string; protocolVersion?: number }>('/movement/session', { mutation: true });
    if (!result) throw new Error('Empty controller response');
    return result;
  },
  async send(body) {
    const result = await httpClient.request<Acknowledgement>('/movement', { mutation: true, body });
    if (!result) throw new Error('Empty device acknowledgement');
    return result;
  },
};
