export function DirectionButton({letter, label, arrow, active, press, release}: {letter: string; label: string; arrow: string; active: boolean; press: (key: string, source: string) => void; release: (source: string) => void}) {
 return <button type="button" className={`direction direction-${letter} ${active ? 'held' : ''}`} aria-label={label} aria-pressed={active}
 onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); press(letter, `pointer:${e.pointerId}`); }}
 onPointerUp={e => release(`pointer:${e.pointerId}`)} onPointerCancel={e => release(`pointer:${e.pointerId}`)} onLostPointerCapture={e => release(`pointer:${e.pointerId}`)}
 onKeyDown={e => { if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); if (!e.repeat) press(letter, `button:${letter}`); } }}
 onKeyUp={e => { if ([' ', 'Enter'].includes(e.key)) release(`button:${letter}`); }} onBlur={() => release(`button:${letter}`)}><span aria-hidden="true">{arrow}</span><strong>{label}</strong><kbd>{letter.toUpperCase()}</kbd></button>;
}
