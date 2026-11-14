import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View, Vibration, useWindowDimensions } from 'react-native';
import { ActionButton } from '../components/ActionButton';
import { HoldButton } from '../components/HoldButton';
import { styles } from '../theme';
import type { SensorClient } from '../api/client';
import { KeyboardState, MovementControl, type Acknowledgement } from '../../../frontend/src/movement/controller';
import { createServoControl } from '../../../frontend/src/servo/controller';
export function MovementScreen({client, scrollEpoch = 0}: {client: SensorClient | null; scrollEpoch?: number}) {
  const {width, height} = useWindowDimensions();
  const [servoEpoch, setServoEpoch] = useState(0);
  const [touchEpoch, setTouchEpoch] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const focused = useRef(AppState.currentState === 'active');
  const enabled = !!client && foreground;
  const [message, setMessage] = useState('Pulsa un control para solicitar sesión.');
  const [servoMessage, setServoMessage] = useState('Estado sin consultar.');
  const mounted = useRef(false);
  const reportEpoch = useRef(0);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  const controls = useRef<{press: (key:string) => void; release: (key:string) => void; stop: () => void; servo: ReturnType<typeof createServoControl>} | null>(null);
  useEffect(() => {controls.current?.stop(); setTouchEpoch(value => value + 1);}, [width, height, scrollEpoch, client]);
  useEffect(() => {
    if (!foreground || !client) return;
    let alive = true;
    const epoch = ++reportEpoch.current;
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
    }, value => {if (alive && mounted.current && epoch === reportEpoch.current) setMessage(value);}, () => {if (alive) {controls.current?.stop(); setTouchEpoch(value => value + 1);}});
    const servo = createServoControl(client.request.bind(client), status => {
      if (alive) setServoMessage(`${status.angle}° · ${status.state} (comandado)`);
    }, (error, source) => {if (alive) {setServoMessage(error); if (source === 'control') {controls.current?.stop(); setTouchEpoch(value => value + 1);}}});
    const stop = () => {keys.clear(); movement.stop(); servo.stop();};
    controls.current = {
      press: key => {if (!focused.current || AppState.currentState !== 'active') return; keys.press(key); const next = keys.intent(); movement.set(next.command, next.steering);},
      release: key => {if (!keys.pressedKeys.has(key)) return; keys.release(key); const next = keys.intent(); movement.set(next.command, next.steering);}, stop, servo,
    };
    return () => {alive = false; controls.current = null; movement.dispose(); servo.dispose();};
  }, [foreground, client]);
  useEffect(() => {
    const update = (active: boolean) => {
      focused.current = active;
      if (!active) {controls.current?.stop(); setTouchEpoch(value => value + 1);}
      setForeground(active);
    };
    const subscription = AppState.addEventListener('change', state => update(state === 'active'));
    const blur = AppState.addEventListener('blur', () => update(false));
    const focus = AppState.addEventListener('focus', () => update(AppState.currentState === 'active'));
    return () => {subscription.remove(); blur.remove(); focus.remove();};
  }, []);
  function emergencyStop() {setServoMessage('HOLD solicitado · estado físico sin confirmar.'); controls.current?.stop(); setTouchEpoch(value => value + 1); Vibration.vibrate(35);}
  function holdServo() {controls.current?.servo.stop(); setServoEpoch(value => value + 1); Vibration.vibrate(20);}
  const direction = (key: string, label: string, symbol: string) => <HoldButton key={`${touchEpoch}-${key}`} {...{label, symbol}} disabled={!enabled} press={() => controls.current?.press(key)} release={() => controls.current?.release(key)} cancel={emergencyStop} />;
  return <>
    <View style={[styles.card, styles.row]}><View style={{flex:1, minWidth:180}}><Text style={styles.heading}>Control de laboratorio · {enabled ? 'Listo' : 'Sin conexión o foco'}</Text>
      <Text style={styles.body}>Mantén las flechas para mover; combina dirección y avance. Salir o perder foco detiene el control; para volver a mover, pulsa de nuevo.</Text>
      </View>
    </View>
    <View style={styles.columns}>
      <View style={[styles.card, styles.column]}><Text style={styles.heading}>Carro</Text>
        <View style={{gap:8, alignSelf:'center', width:'100%', maxWidth:320}}>
          <View style={styles.row}><View style={{flex:1}} />{direction('w','↑ Adelante','↑')}<View style={{flex:1}} /></View>
          <View style={styles.row}>{direction('a','← Izquierda','←')}<ActionButton title="STOP" danger onPress={emergencyStop} />{direction('d','→ Derecha','→')}</View>
          <View style={styles.row}><View style={{flex:1}} />{direction('s','↓ Atrás','↓')}<View style={{flex:1}} /></View>
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text>
      </View>
      <View style={[styles.card, styles.column]}><Text style={styles.heading}>Servo de sensores</Text><Text accessibilityLiveRegion="polite" style={styles.body}>{servoMessage}</Text>
        <View style={styles.row}>{(['DECREASE','INCREASE'] as const).map((command, i) => <HoldButton key={`${touchEpoch}-${servoEpoch}-${command}`} label={i ? '↻ Girar +' : '↺ Girar −'} symbol={i ? '+' : '−'} disabled={!enabled} press={() => focused.current && controls.current?.servo.press(command,command)} release={() => controls.current?.servo.release(command)} cancel={emergencyStop} />)}</View>
        <View style={styles.row}><ActionButton title="CENTER" disabled={!enabled} onPress={() => focused.current && controls.current?.servo.start('CENTER')} /><ActionButton title="HOLD" danger onPress={holdServo} /></View>
        <Text style={styles.body}>CENTER centra el servo. HOLD cancela su movimiento. STOP detiene ambos controles y exige una pulsación nueva.</Text>
      </View>
    </View>
  </>;
}
