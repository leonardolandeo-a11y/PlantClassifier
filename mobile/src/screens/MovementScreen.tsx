import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { ActionButton } from '../components/ActionButton';
import { styles } from '../theme';
import type { SensorClient } from '../api/client';
import { KeyboardState, MovementControl, type Acknowledgement } from '../../../frontend/src/movement/controller';
import { createServoControl } from '../../../frontend/src/servo/controller';
export function MovementScreen({client}: {client: SensorClient | null}) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('Control de laboratorio deshabilitado.');
  const [servoMessage, setServoMessage] = useState('Estado sin consultar.');
  const controls = useRef<{press: (key:string) => void; release: (key:string) => void; stop: () => void; servo: ReturnType<typeof createServoControl>} | null>(null);
  useEffect(() => {
    if (!enabled || !client) return;
    let alive = true;
    const keys = new KeyboardState();
    const movement = new MovementControl({
      acquire: async () => {
        const session = await client.request<{sessionId:string; protocolVersion?:number}>('/movement/session', {mutation:true});
        if (!session) throw new Error('Sin sesión de control.'); return session;
      },
      send: async body => {
        const ack = await client.request<Acknowledgement>('/movement', {mutation:true,body});
        if (!ack) throw new Error('Sin confirmación.'); return ack;
      },
    }, value => {if (alive) setMessage(value);}, () => {keys.clear(); if (alive) setEnabled(false);});
    const servo = createServoControl(client.request.bind(client), status => {
      if (alive) setServoMessage(`${status.angle}° · ${status.state} (comandado)`);
    }, error => {if (alive) {setServoMessage(error); setEnabled(false);}});
    const stop = () => {keys.clear(); movement.stop(); servo.stop();};
    controls.current = {
      press: key => {if (AppState.currentState !== 'active') return; keys.press(key); const next = keys.intent(); movement.set(next.command, next.steering);},
      release: key => {keys.release(key); const next = keys.intent(); movement.set(next.command, next.steering);}, stop, servo,
    };
    const subscription = AppState.addEventListener('change', state => {if (state !== 'active') {stop(); controls.current = null; setEnabled(false);}});
    const blur = AppState.addEventListener('blur', () => {stop(); controls.current = null; setEnabled(false);});
    return () => {alive = false; controls.current = null; movement.dispose(); servo.dispose(); subscription.remove(); blur.remove();};
  }, [enabled, client]);
  const button = (title:string, press:()=>void, release:()=>void) => <Pressable key={title} accessibilityRole="button" accessibilityState={{disabled:!enabled}} disabled={!enabled} onPressIn={press} onPressOut={release} style={styles.button}><Text style={styles.buttonText}>{title}</Text></Pressable>;
  return <>
    <View style={styles.card}><Text style={styles.heading}>Control de laboratorio</Text><Text style={styles.body}>Requiere validación Android con motores desconectados. Se deshabilita al salir de esta pestaña, perder foco o pasar a segundo plano. No se reanuda automáticamente.</Text>
      <ActionButton title={enabled ? 'Deshabilitar y detener' : 'Habilitar para esta sesión de laboratorio'} disabled={!client} onPress={() => {controls.current?.stop(); setEnabled(!enabled);}} />
    </View>
    <View style={styles.card}><Text style={styles.heading}>Control del carro</Text><Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text><View style={styles.row}>
      {([['w','↑ Adelante'],['a','← Izquierda'],['s','↓ Atrás'],['d','→ Derecha']] as const).map(([key,title]) => button(title, () => controls.current?.press(key), () => controls.current?.release(key)))}
    </View><ActionButton title="STOP / HOLD" onPress={() => controls.current?.stop()} disabled={!enabled} /></View>
    <View style={styles.card}><Text style={styles.heading}>Servo de sensores</Text><Text style={styles.body}>{servoMessage}</Text><View style={styles.row}>
      {(['INCREASE','DECREASE'] as const).map((command,i) => button(i ? '↺ Girar −' : '↻ Girar +', () => controls.current?.servo.press(command,command), () => controls.current?.servo.release(command)))}
    </View><ActionButton title="Centrar" disabled={!enabled} onPress={() => controls.current?.servo.start('CENTER')} /><ActionButton title="HOLD" disabled={!enabled} onPress={() => controls.current?.servo.stop()} /></View>
  </>;
}
