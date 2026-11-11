import { Text, View } from 'react-native';
import { ActionButton } from '../components/ActionButton';
import { styles } from '../theme';
export function MovementScreen() {
  return <>
    <View style={styles.card}><Text style={styles.eyebrow}>VISTA PREVIA</Text><Text style={styles.heading}>Control del carro</Text><Text style={styles.body}>La integración de movimiento nativo está pendiente. Usa la web para controlar el dispositivo.</Text>
      <View style={{alignItems: 'center', gap: 12}}><ActionButton title="↑ Adelante" disabled /><View style={styles.row}><ActionButton title="←" disabled /><ActionButton title="■ STOP" disabled /><ActionButton title="→" disabled /></View><ActionButton title="↓ Atrás" disabled /></View>
    </View>
    <View style={styles.card}><Text style={styles.eyebrow}>ORIENTACIÓN DE SENSORES</Text><Text style={styles.heading}>Servo de sensores</Text><Text style={styles.body}>Ángulo sin consultar · Controles aún no conectados</Text><View style={styles.row}><ActionButton title="↻ Girar +" disabled /><ActionButton title="↺ Girar −" disabled /></View><ActionButton title="Centrar" disabled /><ActionButton title="Detener giro" disabled /></View>
  </>;
}
