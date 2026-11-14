import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SensorClient, ServerResponseError, type SensorData } from './src/api/client';
import { connectStation } from './src/api/discovery';
import { ActionButton } from './src/components/ActionButton';
import { DataScreen } from './src/screens/DataScreen';
import { MovementScreen } from './src/screens/MovementScreen';
import { colors, styles } from './src/theme';
export default function App() {
  const [scrollEpoch, setScrollEpoch] = useState(0);
  const [tab, setTab] = useState<'Datos' | 'Movimiento'>('Datos');
  const [origin, setOrigin] = useState('');
  const [client, setClient] = useState<SensorClient | null>(null);
  const [data, setData] = useState<SensorData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const capturePending = useRef(false);
  const configured = useRef(process.env.EXPO_PUBLIC_API_URL);
  const mounted = useRef(false);
  const foreground = useRef(AppState.currentState === 'active');
  function cancel() { pending.current?.abort(); pending.current = null; }
  async function connect() {
    cancel(); setClient(null); setData(null); setError(''); setBusy(true);
    const abort = new AbortController(); pending.current = abort;
    try {
      const result = await connectStation(configured.current, abort.signal);
      if (!mounted.current || abort.signal.aborted) return;
      setClient(result.client); setOrigin(result.origin); setData(result.data);
    } catch (cause) {
      if (mounted.current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo conectar.');
    } finally { if (pending.current === abort) {pending.current = null; if (mounted.current) setBusy(false);} }
  }
  useEffect(() => {
    mounted.current = true; void connect();
    const subscription = AppState.addEventListener('change', state => {
      const wasActive = foreground.current;
      foreground.current = state === 'active';
      if (state !== 'active') {cancel(); setClient(null); setBusy(false);}
      else if (!wasActive) void connect(); // Reads only; physical control is never enabled here.
    });
    const blur = AppState.addEventListener('blur', () => {foreground.current = false; cancel(); setClient(null); setBusy(false);});
    const focus = AppState.addEventListener('focus', () => {const wasActive = foreground.current; foreground.current = true; if (!wasActive && !pending.current) void connect();});
    return () => {mounted.current = false; cancel(); subscription.remove(); blur.remove(); focus.remove();};
  }, []);
  // Read-only health checks keep the same client/session while healthy. A failure
  // unmounts physical control; recovery never acquires or replays motor commands.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!foreground.current || pending.current || busy) return;
      if (!client) {void connect(); return;}
      const abort = new AbortController(); pending.current = abort;
      try {
        await connectStation(configured.current, abort.signal);
      } catch (cause) {
        if (mounted.current && !abort.signal.aborted) {
          setClient(null);
          setError(cause instanceof Error ? cause.message : 'Estación sin respuesta.');
        }
      } finally {if (pending.current === abort) pending.current = null;}
    }, 5000);
    return () => clearInterval(timer);
  }, [client, origin, busy]);
  async function capture() {
    if (!client || capturePending.current) return;
    cancel(); // Explicit capture supersedes a read-only health check.
    capturePending.current = true;
    const abort = new AbortController(); pending.current = abort; setBusy(true); setError('');
    try {
      const next = await client.capture(abort.signal);
      if (!mounted.current || abort.signal.aborted) return;
      if (!next) throw new Error('La captura no devolvió datos.');
      setData(next);
    } catch (cause) {
      if (mounted.current && !abort.signal.aborted) {if (!(cause instanceof ServerResponseError)) setClient(null); setError(cause instanceof Error ? cause.message : 'Captura sin confirmar.');}
    } finally {capturePending.current = false; if (pending.current === abort) {pending.current = null; if (mounted.current) setBusy(false);}}
  }
  return <SafeAreaProvider><SafeAreaView style={styles.screen}><StatusBar hidden />
    <View style={styles.header}><View style={{flex:1}}><Text style={styles.eyebrow}>PLANTCLASSIFIER / FIELD LAB</Text><Text accessibilityLiveRegion="polite" style={styles.body}>{busy ? '● Conectando / leyendo…' : client ? `● Conectado · ${origin}` : '○ Sin conexión'}</Text></View>
      {(['Datos', 'Movimiento'] as const).map(name => <Pressable key={name} accessibilityRole="tab" accessibilityState={{selected: tab === name}} onPress={() => {if (tab !== name) {cancel(); setBusy(false); setTab(name);}}} style={[styles.button, {backgroundColor: tab === name ? colors.accent : colors.surface}]}><Text style={[styles.buttonText, {color: tab === name ? colors.background : colors.text}]}>{name}</Text></Pressable>)}
    </View>
    <ScrollView onScrollBeginDrag={() => setScrollEpoch(value => value + 1)} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {!client && <View style={styles.card}><Text style={styles.heading}>{busy ? 'Conectando con la estación' : 'Sin conexión con la estación'}</Text>
        <Text style={styles.body}>{configured.current || 'EXPO_PUBLIC_API_URL no configurada'}</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <ActionButton title="Reintentar" disabled={busy} onPress={() => void connect()} />
      </View>}
      {tab === 'Datos' ? <>
        <DataScreen {...{data, busy}} error={client ? error : ''} connected={!!client} capture={() => void capture()} />
      </> : <MovementScreen client={client} scrollEpoch={scrollEpoch} />}
    </ScrollView></SafeAreaView></SafeAreaProvider>;
}
