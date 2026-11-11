export type IconName = 'leaf' | 'sensors' | 'movement' | 'results';
const paths: Record<IconName, string> = {
  leaf: 'M20 4C10 2 3 7 5 14c2 7 12 7 15-10ZM5 20l9-10',
  sensors: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  movement: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  results: 'M5 20V10M12 20V4M19 20v-7',
};
export function Icon({name}: {name: IconName}) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
