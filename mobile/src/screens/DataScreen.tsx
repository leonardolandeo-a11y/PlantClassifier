import { Text, View } from 'react-native';
import type { SensorData } from '../api/client';
import { colors, styles } from '../theme';
import { ActionButton } from '../components/ActionButton';
import { numeric, soilValue } from '../../../frontend/src/utils/sensors';
export function DataScreen({data, busy, error, connected, capture}: {data: SensorData | null; busy: boolean; error: string; connected: boolean; capture: () => void}) {
  const prediction = busy ? 'Lectura en curso' : error ? 'Sin nueva recomendación' : data?.predictionStatus === 'OUT_OF_DOMAIN' ? 'Fuera del rango del modelo' : data?.predictionStatus === 'PENDING' ? 'Recomendación pendiente' : data?.predictionStatus === 'SUCCEEDED' && data.predictionModel === 'synthetic-five-crops-v2' ? data.prediction : data ? 'Sin recomendación disponible' : 'Tu próximo cultivo';
  return <View style={styles.columns}><View style={styles.column}>
    <View style={styles.card}><Text style={styles.heading}>¿Qué nos dice el entorno?</Text><Text style={styles.body}>Captura los cuatro sensores y actualiza tu recomendación.</Text><ActionButton title={busy ? 'Leyendo…' : '＋ Capturar datos'} disabled={!connected || busy} onPress={capture} />{error ? <Text accessibilityRole="alert" style={styles.error}>Lectura sin confirmar. Revisa la conexión y reintenta.</Text> : <Text accessibilityLiveRegion="polite" style={styles.body}>{busy ? 'Esperando respuesta…' : data ? 'Última lectura disponible' : 'Sin capturas todavía'}</Text>}</View>
    </View><View style={[styles.column, {flexGrow: 2}]}><View style={styles.row}>{[['Temperatura', `${numeric(data?.temperature)} °C`], ['Humedad del aire', `${numeric(data?.humidity)} %`], ['Humedad del suelo', soilValue(data)], ['pH del suelo', numeric(data?.ph, 2)]].map(([title, value]) => <View key={title} style={[styles.card, {flexBasis: '45%', flexGrow: 1}]}><Text style={styles.body}>{title}</Text><Text style={{color: colors.accent, fontSize: 26, fontWeight: '600'}}>{value}</Text></View>)}</View>
    <View style={styles.card}><Text style={styles.eyebrow}>RESULTADO / ÚLTIMA CAPTURA</Text><Text style={styles.heading}>{prediction}</Text><Text style={styles.body}>{data?.capturedAt ? new Date(data.capturedAt).toLocaleString() : 'Sin fecha disponible'}</Text><Text style={styles.body}>{data?.simulated ? 'Lecturas simuladas. ' : ''}{data?.phSource === 'potentiometer' ? 'pH simulado con potenciómetro. ' : ''}Modelo experimental entrenado con datos sintéticos; orientación de laboratorio.</Text></View>
  </View></View>;
}
