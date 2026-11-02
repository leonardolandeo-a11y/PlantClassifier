export function SensorCard({id, title, value, unit, source, color, icon}: {id: string; title: string; value: string; unit?: string; source: string; color: string; icon: string}) {
 return <article className={`sensor-card ${color}`}><div className="sensor-heading"><span>{title}</span><span className="sensor-icon" aria-hidden="true">{icon}</span></div><div className={`reading ${value.length > 10 ? 'reading-label' : ''}`}><span id={id}>{value}</span>{unit && <small>{unit}</small>}</div><p id={id === 'soilMoisture' ? 'soilSource' : undefined}>{source}</p></article>;
}
