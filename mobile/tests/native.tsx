import React from 'react';
const listeners = new Map<string, Set<(value:string) => void>>();
export const AppState = {currentState:'active', addEventListener(event:string, callback:(value:string)=>void) {
  const set = listeners.get(event) ?? new Set(); set.add(callback); listeners.set(event,set);
  return {remove:()=>set.delete(callback)};
}, emit(event:string, value:string) {if(event==='change') this.currentState=value; listeners.get(event)?.forEach(fn=>fn(value));}};
export const NativeModules = {SourceCode:{scriptURL:'http://localhost:8081/index.bundle'}};
export const Vibration = {vibrate: (_duration:number) => {}};
export const dimensions = {width:844,height:390,scale:1,fontScale:1};
export const useWindowDimensions = () => dimensions;
export const StyleSheet = {create:<T,>(value:T)=>value};
export const Text = ({children,accessibilityRole}:any) => <span role={accessibilityRole}>{children}</span>;
export const View = ({children,onTouchStart,onTouchEnd,onTouchCancel,onTouchMove,onAccessibilityAction,accessibilityLabel,accessibilityRole,accessibilityState,style}:any) => <div role={accessibilityRole} aria-label={accessibilityLabel} aria-disabled={accessibilityState?.disabled} data-style={JSON.stringify(style)}
 onTouchStart={e=>onTouchStart?.({nativeEvent:{identifier:e.changedTouches[0]?.identifier,changedTouches:Array.from(e.changedTouches)}})}
 onTouchEnd={e=>onTouchEnd?.({nativeEvent:{identifier:e.changedTouches[0]?.identifier,changedTouches:Array.from(e.changedTouches)}})}
 onTouchCancel={onTouchCancel} onTouchMove={e=>onTouchMove?.({nativeEvent:{identifier:e.changedTouches[0]?.identifier,changedTouches:Array.from(e.changedTouches)}})}
 onKeyDown={e=>{if(e.key==='Enter') onAccessibilityAction?.({nativeEvent:{actionName:'activate'}});}}>{children}</div>;
export const ScrollView = View;
export const TextInput = ({value,onChangeText,accessibilityLabel}:any) => <input aria-label={accessibilityLabel} value={value} onChange={e=>onChangeText(e.target.value)} />;
export const Pressable = ({children,disabled,onPress,onPressIn,onPressOut,accessibilityRole,accessibilityState}:any) => <button role={accessibilityRole} aria-selected={accessibilityState?.selected} disabled={disabled} onClick={onPress} onPointerDown={onPressIn} onPointerUp={onPressOut}>{children}</button>;
