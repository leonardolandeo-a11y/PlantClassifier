import { Icon, type IconName } from '../layout/Icon';
export type Section = 'sensors' | 'movement';
export const sections: {id: Section; label: string; icon: IconName; detail: string}[] = [
  {id: 'sensors', label: 'Datos', icon: 'sensors', detail: 'Sensores y captura'},
  {id: 'movement', label: 'Movimiento', icon: 'movement', detail: 'Carro y sensores'},
];
export function Sidebar({active, onNavigate}: {active: Section; onNavigate: (section: Section) => void}) {
  return <aside className="sidebar">
    <a className="brand" href="#sensors" onClick={event => { event.preventDefault(); onNavigate('sensors'); }}><span className="brand-icon"><Icon name="leaf" /></span><span>PlantClassifier<small>ESTACIÓN DE CONTROL</small></span></a>
    <div className="nav-caption">ESPACIO DE TRABAJO</div>
    <nav aria-label="Secciones principales">{sections.map(section => <button key={section.id} type="button" aria-label={section.label} title={section.label} className={`nav-item ${active === section.id ? 'selected' : ''}`} aria-current={active === section.id ? 'page' : undefined} onClick={() => onNavigate(section.id)}><Icon name={section.icon} /><span>{section.label}<small>{section.detail}</small></span><span className="nav-chevron" aria-hidden="true">›</span></button>)}</nav>
    <div className="sidebar-note"><Icon name="leaf" /><strong>Tu estación de campo.</strong><p>Captura el entorno. Orienta los sensores. Explora el terreno.</p><span className="badge">Laboratorio experimental</span></div>
  </aside>;
}
