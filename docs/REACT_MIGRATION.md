# Migración a React

La aplicación vive únicamente en `frontend/`. React 19, TypeScript, Vite y Tailwind
se compilan a assets estáticos que sirve Spring Boot. No hay servidor Node en producción.
Los contratos HTTP, PostgreSQL, firmware, calibración y modelo Random Forest no se alteran.

## Estructura

```text
frontend/src/
  main.tsx / App.tsx
  api/             HTTP con CSRF compartido, sensores y movimiento
  components/
    layout/        Header, DashboardLayout
    sensors/       SensorCard, SensorGrid, SensorStatus
    movement/      MovementPanel, DirectionButton, MovementStatus
    recommendation/ RecommendationPanel, RecommendationStatus
  hooks/           useSensors, useMovement, useKeyboardMovement
  movement/        controller.ts (máquina existente + dispose)
  pages/           DashboardPage
  types/           sensor.ts
  utils/           sensores y formatos
  styles/          dashboard.css (Tailwind y tema oscuro)
frontend/tests/    máquina de estados, React, hooks y HTTP
```

`useMovement` crea una instancia por montaje, libera timers y envía STOP al desmontar.
Una adquisición pendiente se completa exclusivamente para enviar STOP si fue cancelada.
StrictMode no adquiere control al abrir la página. Los listeners tienen limpieza simétrica.
Se conservan secuencias, prioridad de última tecla, heartbeats de 250 ms, CSRF, sesiones,
STOP prioritario y validación de acknowledgements. Se agregan controles de puntero con
captura, cancelación y liberación, así como teclado accesible y Escape.

`useSensors` aborta lecturas obsoletas, serializa capturas y descarta respuestas tardías.
La recomendación anterior se oculta durante una captura y ante error. Los estados
SUCCEEDED, PENDING, FAILED y OUT_OF_DOMAIN se renderizan explícitamente. Solo se presenta
como actual una predicción de `synthetic-five-crops-v2` para uno de sus cinco cultivos.

## Build y ejecución

Requisitos locales: Node 24, npm y Java 21.

```bash
npm ci
npm run dev                    # http://127.0.0.1:5173, proxy a :18080
npm run typecheck
npm run lint
npm test
npm run build
./mvnw verify                  # incluye el build frontend
```

`PLANT_BACKEND_URL` cambia el destino del proxy Vite. Nunca se cargan `.env.lab` ni
credenciales de dispositivo en Vite. Los endpoints conservan rutas relativas y cookies.

Vite escribe `frontend/dist`. `scripts/sync-frontend.mjs` copia únicamente ese resultado
a `target/generated-resources/frontend/static`. Maven incluye esta ruta en el JAR.
Docker utiliza una etapa Node para compilar y probar, y pasa los assets a Maven con
`-Dfrontend.skip=true`; la imagen final contiene Java, Python y el modelo existente.

Para actualizar solo el servicio del laboratorio existente, conservando los overrides:

```bash
docker compose -p plantclassifier-lab --env-file .env.lab \
  -f docker-compose.yaml -f docker-compose.simulation.yaml \
  -f /tmp/plantclassifier-sensor-real.yaml up -d --build --no-deps app
```

Dashboard de producción: http://127.0.0.1:18080. No ejecutar `down -v`.
Las pruebas usan contenedores desechables, nunca motores físicos ni la base de laboratorio.

```bash
docker build -t plantclassifier:react .
PLANT_TEST_IMAGE=plantclassifier:react python3 scripts/smoke-docker.py
PLANT_TEST_IMAGE=plantclassifier:react PLANT_SCREENSHOT_DIR=/tmp/plant-react-visual \
  python3 scripts/test-browser.py
scripts/test-postgres.sh -B verify
python3 scripts/test-simulator.py
```

## Archivos retirados

`frontend/control.ts` se conserva como `src/movement/controller.ts`; sus 18 pruebas
están en `frontend/tests/control.test.js`. Las pruebas de sensores se trasladaron a React.
Se retiraron `frontend/scripts.ts`, `frontend/input.css`, `frontend/control.test.mjs`,
`frontend/sensors.test.mjs`, el `tsconfig.json` raíz, `scripts/watch.cjs` y los cuatro
assets antiguos de `src/main/resources/static` (index, scripts.js, control.js, output.css).
La copia de recuperación local está en `/tmp/plant-react-legacy-backup`.

## Validación

- TypeScript y ESLint: aprobados.
- Vitest: 65 pruebas aprobadas, incluidas las 18 originales del controlador.
- Maven: 45 pruebas descubiertas, 40 ejecutadas y 5 condicionales omitidas.
- Maven con PostgreSQL desechable: 44 ejecutadas, sin fallos; solo la prueba de benchmark de latencia se omite por su condición de entorno.
- Simuladores: protocolo, comandos, secuencias, deadlines y watchdog aprobados.
- Docker: build y smoke con ML real, CSRF y persistencia aprobados.
- Playwright E2E: aprobado, incluyendo STOP al abandonar la página antes del watchdog, controles de puntero, errores y descarte de GET obsoleto.
- Servicio local actualizado: `http://127.0.0.1:18080`, contenedor healthy; índice React y assets HTTP 200, assets legacy HTTP 404. Verificación local solo de lectura.
- Capturas revisadas: `/tmp/plant-react-visual/dashboard.png` y `dashboard-mobile.png`; escritorio 1440 px y móvil 390 px sin desbordamiento horizontal.

`npm audit` informa 11 alertas moderadas en herramientas de desarrollo, derivadas de
minimatch transitivo de ESLint. No se aplicó la sugerencia de degradar ESLint a v4,
que rompería la configuración. No hay paquetes npm en la imagen final de producción.


Nota del entorno local: el archivo `/tmp/plantclassifier-sensor-real.yaml` estaba
ausente aunque el contenedor lo referenciaba. Se recuperaron únicamente los overrides
de direcciones de dispositivo desde el contenedor existente; se comprobó que el
entorno efectivo de Compose coincide con el anterior, sin exponer credenciales.
