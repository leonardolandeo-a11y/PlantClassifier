import { useEffect } from 'react';

function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input, textarea, select, [contenteditable="true"]'));
}
export function useKeyboardMovement(press: (key: string) => void, release: (source: string) => void, stop: () => void) {
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); stop(); return; }
      if (document.hidden || !document.hasFocus() || typing(event.target) || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (!['w', 'a', 's', 'd'].includes(key)) return;
      event.preventDefault(); press(key);
    };
    const up = (event: KeyboardEvent) => release(`key:${event.key.toLowerCase()}`);
    const visibility = () => { if (document.hidden) stop(); };
    const focus = (event: FocusEvent) => { if (typing(event.target)) stop(); };
    document.addEventListener('keydown', down); document.addEventListener('keyup', up);
    document.addEventListener('visibilitychange', visibility); document.addEventListener('focusin', focus);
    window.addEventListener('blur', stop); window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('keydown', down); document.removeEventListener('keyup', up);
      document.removeEventListener('visibilitychange', visibility); document.removeEventListener('focusin', focus);
      window.removeEventListener('blur', stop); window.removeEventListener('pagehide', stop);
      stop();
    };
  }, [press, release, stop]);
}
