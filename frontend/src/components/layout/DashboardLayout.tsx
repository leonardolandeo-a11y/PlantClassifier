import type { ReactNode } from 'react';
import { Header } from './Header';
export function DashboardLayout({children}: {children: ReactNode}) { return <><Header /><main>{children}</main><footer>PlantClassifier · Sensores, robótica y aprendizaje automático</footer></>; }
