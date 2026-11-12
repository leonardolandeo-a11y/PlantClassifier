import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SensorClient, type SensorData } from './src/api/client';
import { ActionButton } from './src/components/ActionButton';
import { DataScreen } from './src/screens/DataScreen';
import { MovementScreen } from './src/screens/MovementScreen';
import { colors, styles } from './src/theme';
export default function App() {
  const [tab, setTab] = useState<'Datos' | 'Movimiento'>('Datos');
  const [address, setAddress] = useState('');
  const [client, setClient] = useState<SensorClient | null>(null);
  const [data, setData] = useState<SensorData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false; pending.current?.abort();};}, []);
  async function read(api: SensorClient, capture = false) {
    if (pending.current) return;
    const abort = new AbortController(); pending.current = abort;
    const timer = setTimeout(() => abort.abort(), 35000);
    setBusy(true); setError('');
    try {
      const next = await (capture ? api.capture(abort.signal) : api.latest(abort.signal));
      if (abort.signal.aborted || !mounted.current) return;
      if (capture && !next) throw new Error('La captura no devolvió datos.');
      setData(next);
    } catch (cause) { if (mounted.current) setError(abort.signal.aborted ? 'Tiempo de espera agotado.' : cause instanceof Error ? cause.message : 'No se pudo conectar.'); }
    finally { clearTimeout(timer); pending.current = null; if (mounted.current) setBusy(false); }
  }
  function connect() {
    try { const next = new SensorClient(address); setClient(next); setData(null); void read(next); }
    catch (cause) { setClient(null); setError(cause instanceof Error ? cause.message : 'Dirección no válida.'); }
  }
  return <SafeAreaProvider><SafeAreaView style={styles.screen}><StatusBar style="light" /><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>PLANTCLASSIFIER / FIELD LAB</Text><Text style={styles.title}>{tab}</Text>
    {tab === 'Datos' ? <><View style={styles.card}><Text style={styles.heading}>Conectar con tu estación</Text><Text style={styles.body}>Introduce la dirección actual del backend accesible desde este teléfono.</Text><TextInput accessibilityLabel="Dirección del backend" value={address} onChangeText={value => {setAddress(value); setClient(null); setData(null); setError('');}} editable={!busy} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="Origen HTTP(S) del backend" placeholderTextColor={colors.muted} style={styles.input} /><ActionButton title="Consultar última captura" onPress={connect} disabled={busy || !address.trim()} /></View><DataScreen {...{data, busy, error}} connected={!!client} capture={() => {if (client) void read(client, true);}} /></> : <MovementScreen client={client} />}
    </ScrollView><View accessibilityRole="tablist" style={[styles.row, {padding: 12, borderTopWidth: 1, borderColor: colors.line}]}>{(['Datos', 'Movimiento'] as const).map(name => <Pressable key={name} accessibilityRole="tab" accessibilityState={{selected: tab === name}} onPress={() => setTab(name)} style={[styles.button, {flex: 1, backgroundColor: tab === name ? colors.accent : colors.surface}]}><Text style={[styles.buttonText, {color: tab === name ? colors.background : colors.muted}]}>{name}</Text></Pressable>)}</View></SafeAreaView></SafeAreaProvider>;
}
