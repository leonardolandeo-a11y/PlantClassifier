import type { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar, sections, type Section } from '../navigation/Sidebar';
export function DashboardLayout({children, active, onNavigate}: {children: ReactNode; active: Section; onNavigate: (section: Section) => void}) {
  return <div className="dashboard"><a className="skip-link" href="#main-content">Saltar al contenido</a><Sidebar active={active} onNavigate={onNavigate} /><div className="main-shell"><Header section={sections.find(section => section.id === active)!.label} /><main id="main-content" tabIndex={-1}>{children}</main><footer>PlantClassifier <span>Entorno · Robótica · Aprendizaje automático</span></footer></div></div>;
}
