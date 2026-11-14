import { SensorClient, type SensorData } from './client';

// A single injected origin: no saved addresses, Metro hints or fallback servers.
export async function connectStation(configured: string | undefined, signal: AbortSignal): Promise<{client: SensorClient; origin: string; data: SensorData | null}> {
  const origin = configured?.trim();
  if (!origin) throw new Error('Falta EXPO_PUBLIC_API_URL. Inicia Expo con scripts/start-wifi.py.');
  if (signal.aborted) throw new Error('Conexión cancelada.');
  const attempt = new AbortController();
  const cancel = () => attempt.abort();
  signal.addEventListener('abort', cancel, {once: true});
  const timer = setTimeout(cancel, 4500);
  try {
    const client = new SensorClient(origin);
    const data = await client.latest(attempt.signal);
    if (attempt.signal.aborted) throw new Error('Sin respuesta.');
    return {client, origin: new URL(origin).origin, data};
  } catch (error) {
    throw new Error(`${origin}: ${attempt.signal.aborted ? 'sin respuesta' : error instanceof Error ? error.message : 'no disponible'}`);
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
