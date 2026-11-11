# Rediseño local de PlantClassifier

## Resultado

Dos vistas principales: Datos (captura, cuatro sensores, estado, recomendación y última captura) y Movimiento (carro y servo). Paleta azul grafito, acentos cian/naranja, controles grandes con etiquetas, foco visible y navegación inferior en móvil. El resultado se conserva al cambiar de pestaña.

Se conserva el controlador del carro, sus contratos HTTP, heartbeat, secuencias, controles por teclado/puntero y cleanup. El servo conserva su implementación local previa; cambia su presentación y se añade Escape para detenerlo. Al salir de Movimiento se desmontan ambos paneles y se envía STOP/HOLD cuando corresponde. No se mide ni inventa velocidad física.

## Archivos modificados en esta tarea

- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/components/navigation/Sidebar.tsx`
- `frontend/src/components/movement/DirectionButton.tsx`
- `frontend/src/components/movement/MovementPanel.tsx`
- `frontend/src/components/servo/ServoPanel.tsx` (sobre cambios locales previos, conservados)
- `frontend/src/styles/dashboard.css`
- `frontend/tests/navigation.test.tsx`

## Archivos nuevos

- `frontend/src/components/sensors/CapturePanel.tsx`
- `scripts/test-ui-redesign.mjs`
- `docs/ui-redesign.md`
- `mobile/.gitignore`
- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/app.json`
- `mobile/tsconfig.json`
- `mobile/metro.config.js`
- `mobile/index.ts`
- `mobile/App.tsx`
- `mobile/README.md`
- `mobile/src/theme.ts`
- `mobile/src/api/client.ts`
- `mobile/src/components/ActionButton.tsx`
- `mobile/src/screens/DataScreen.tsx`
- `mobile/src/screens/MovementScreen.tsx`

Los artefactos de build se generan en `frontend/dist`, `target/generated-resources/frontend/static` y `mobile/dist`, todos ignorados por Git. Dependencias móviles locales en `mobile/node_modules`.

## Validación

- `npm run lint`
- `npm test`: 108 pruebas, incluidos STOP/HOLD al navegar y Escape del servo.
- `npm run build`: TypeScript, Vite y sincronización de recursos generados de Spring.
- `npm run typecheck --prefix mobile`
- `npm run export --prefix mobile`: bundle Android generado por Metro.
- Chrome headless: dos pestañas, captura/resultado, WASD, STOP/HOLD, sin errores de JS ni desbordamiento a 1440, 390 y 320 px. API simulada; no acciona hardware. Capturas visuales en `/tmp/plant-datos-{ancho}.png` y `/tmp/plant-movimiento-{ancho}.png`.

Para repetir la comprobación de navegador, iniciar `npm run dev` y ejecutar `node scripts/test-ui-redesign.mjs`. Si no hay navegador Playwright instalado, proporcionar `CHROME_PATH` con la ruta del Chrome local. `PLANT_UI_URL` permite apuntar al servidor de revisión sin editar configuraciones del proyecto.

## Alcance móvil y pendientes

Expo incluye layout, navegación, cliente CSRF, consulta/captura de sensores y presentación del resultado. Movimiento es una vista previa con controles deshabilitados. Falta integrar las sesiones nativas de carro/servo y validar las paradas con AppState y gestos en un dispositivo. No se probó Android/iOS en hardware, ni captura nativa contra el backend real; el bundle no equivale a un APK. Ver `mobile/README.md` para ejecución y límites.

No se ejecutó el E2E histórico que requiere el stack completo y un dispositivo simulado; la prueba nueva de UI aísla la presentación y navegación mediante respuestas HTTP simuladas. No se hicieron pruebas físicas ni cambios de backend, firmware, Docker, endpoints, red, IPs, WiFi, tokens o `.env.lab`. Se conservaron los cambios preexistentes en esos archivos. Sin commit ni push.
