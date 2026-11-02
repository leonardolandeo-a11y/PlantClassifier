import { useCallback, useEffect, useRef, useState } from 'react';
import { sensorsApi } from '../api/sensorsApi';
import { httpClient } from '../api/httpClient';
import type { CapturePhase, SensorData } from '../types/sensor';

export function useSensors() {
  const [data, setData] = useState<SensorData | null>(null);
  const [phase, setPhase] = useState<CapturePhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const capturing = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const current = ++generation.current;
    const controller = new AbortController();
    pending.current = controller;
    void httpClient.initializeCsrf().catch(() => { /* A deliberate action can retry bootstrap. */ });
    void sensorsApi.latest(controller.signal).then(reading => {
      if (mounted.current && generation.current === current) { setData(reading); setPhase('ready'); }
    }).catch((cause: unknown) => {
      if (mounted.current && generation.current === current && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Unable to load sensors'); setPhase('error');
      }
    });
    return () => { mounted.current = false; pending.current?.abort(); capturing.current = false; };
  }, []);

  const capture = useCallback(async () => {
    if (!mounted.current || capturing.current) return;
    capturing.current = true;
    const current = ++generation.current;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setPhase('capturing'); setError(null);
    try {
      const reading = await sensorsApi.capture(controller.signal);
      if (!reading) throw new Error('Empty capture response');
      if (mounted.current && generation.current === current) { setData(reading); setPhase('ready'); }
    } catch (cause) {
      if (mounted.current && generation.current === current && !controller.signal.aborted) {
        setPhase('error'); setError(cause instanceof Error ? cause.message : 'Capture failed');
      }
    } finally { if (generation.current === current) capturing.current = false; }
  }, []);
  return { data, phase, error, capture };
}
