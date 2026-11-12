import React from 'react';
const listeners = new Map<string, Set<(value:string) => void>>();
export const AppState = {currentState:'active', addEventListener(event:string, callback:(value:string)=>void) {
  const set = listeners.get(event) ?? new Set(); set.add(callback); listeners.set(event,set);
  return {remove:()=>set.delete(callback)};
}, emit(event:string, value:string) {if(event==='change') this.currentState=value; listeners.get(event)?.forEach(fn=>fn(value));}};
export const StyleSheet = {create:<T,>(value:T)=>value};
export const Text = ({children}:any) => <span>{children}</span>;
export const View = ({children}:any) => <div>{children}</div>;
export const Pressable = ({children,disabled,onPress,onPressIn,onPressOut}:any) => <button disabled={disabled} onClick={onPress} onPointerDown={onPressIn} onPointerUp={onPressOut}>{children}</button>;
