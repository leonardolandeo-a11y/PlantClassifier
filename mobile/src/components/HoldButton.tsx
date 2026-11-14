import { useEffect, useRef, useState } from 'react';
import { Text, Vibration, View, type GestureResponderEvent } from 'react-native';
import { colors, styles } from '../theme';

// Raw touch IDs allow independent buttons to be held simultaneously. A single
// responder/Pressable owner cannot reliably represent a multi-finger D-pad.
export function HoldButton({label, symbol, disabled, press, release, cancel}: {
  label: string; symbol: string; disabled: boolean;
  press: () => void; release: () => void; cancel: () => void;
}) {
  const touches = useRef(new Set<number>());
  const [held, setHeld] = useState(false);
  const pulse = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bounds = useRef({width: 0, height: 0});
  useEffect(() => {if (disabled) {touches.current.clear(); setHeld(false); clearTimeout(pulse.current);}}, [disabled]);
  useEffect(() => () => clearTimeout(pulse.current), []);
  function start(event: GestureResponderEvent) {
    if (disabled) return;
    const wasHeld = touches.current.size > 0;
    touches.current.add(event.nativeEvent.identifier);
    if (!wasHeld) {setHeld(true); Vibration.vibrate(12); press();}
  }
  function end(event: GestureResponderEvent) {
    if (!touches.current.size) return;
    event.nativeEvent.changedTouches.forEach(touch => touches.current.delete(touch.identifier));
    if (!touches.current.size) {setHeld(false); release();}
  }
  function abort() {touches.current.clear(); setHeld(false); cancel();}
  function accessiblePulse() {
    if (disabled || touches.current.size) return;
    clearTimeout(pulse.current); setHeld(true); Vibration.vibrate(12); press();
    pulse.current = setTimeout(() => {setHeld(false); release();}, 200);
  }
  return <View accessible accessibilityRole="button" accessibilityLabel={label}
    accessibilityHint="Mantén pulsado; con lector de pantalla, activa un impulso breve."
    accessibilityState={{disabled, selected: held}} accessibilityActions={[{name:'activate'}]}
    onAccessibilityTap={accessiblePulse} onAccessibilityAction={event => {if (event.nativeEvent.actionName === 'activate') accessiblePulse();}}
    onLayout={event => {bounds.current = event.nativeEvent.layout;}}
    onTouchStart={start} onTouchEnd={end} onTouchCancel={abort}
    onTouchMove={event => {if (event.nativeEvent.changedTouches.some(t => touches.current.has(t.identifier) && (t.locationX < 0 || t.locationY < 0 || t.locationX > bounds.current.width || t.locationY > bounds.current.height))) abort();}}
    style={[styles.button, {flex:1, minWidth:48, backgroundColor: held ? colors.orange : colors.accent}, disabled && styles.disabled]}>
    <Text style={[styles.buttonText, {fontSize: 26}]}>{symbol}</Text>
  </View>;
}
