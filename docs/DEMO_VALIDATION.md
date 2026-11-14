# Validación de la demo autónoma

Base: `main`, referencia `9bc101e`. Los cambios se aplicaron sin commit ni push.
No se modificaron credenciales, firmware, hardware ni PostgreSQL del laboratorio.

## Reproducir la aceptación

En un checkout limpio (sin archivos privados), con Docker Compose 2.24.4+, Python 3,
Node.js 24 y navegador Playwright **solo para las pruebas**:

```bash
npm ci
npx playwright install --with-deps chromium
python3 scripts/test-demo.py
python3 scripts/test-start-wifi.py
python3 scripts/test-simulator.py
```

La demo web en sí solo necesita Docker y navegador; los comandos de usuario están
al inicio del README. El job `demo` de `.github/workflows/verify.yml` ejecuta la
aceptación en un checkout nuevo y publica `standalone-demo` incluso si falla.
No hay reintentos de escenarios; los healthchecks y la espera de Metro comprueban
preparación antes de comenzar. El conflicto de puerto es un fallo esperado y
asertado, seguido del arranque con asignación dinámica.

La prueba crea servicios HTTP propios en 18080, 18081, 18082 y 55433. Si un puerto
ya está ocupado, falla sin detener al dueño. Para comprobar convivencia en una
máquina de desarrollo se puede usar `DEMO_ALLOW_EXISTING_PORTS=1`; CI no lo usa.
Cada ejecución tiene un proyecto aleatorio y elimina únicamente sus recursos de
prueba, incluido su volumen desechable. Esto no altera el comportamiento del volumen
persistente de la demo del README.

## Comprobaciones

- Construye Spring/frontend/Python y ambos simuladores desde las fuentes.
- PostgreSQL y simuladores no publican puertos; Spring solo tiene la red interna,
  sin ruta por defecto. Solo Nginx publica una web en loopback.
- Variables hostiles de MQTT y direcciones de dispositivos no cambian el Compose.
- Conflicto explícito en 18080: Docker falla; al quitar la asignación fija se obtiene
  un puerto libre. Los servicios de prueba siguen respondiendo al terminar.
- Chromium abre el dashboard, pulsa Capturar datos y verifica `simulated=true`,
  `predictionStatus=SUCCEEDED` y `predictionModel=synthetic-five-crops-v2`.
- Comprueba el worker Python activo, contrasta la predicción con el script real y
  consulta la fila de PostgreSQL directamente.
- Ejecuta movimiento, STOP y servo/HOLD desde la interfaz, únicamente con simuladores.
- Hace `down` sin `-v`, recrea los contenedores y exige la misma lectura/predicción.
- Guarda capturas del dashboard/movimiento, JSON, conflicto de puerto, logs y resultado
  en `/tmp/plant-demo-report` (o `DEMO_REPORT`).

## Resultado confirmado el 14 de noviembre de 2026 (America/Lima)

- **E2E PASS, código 0**, usando Chrome instalado e imágenes existentes, sin build.
  Proyecto desechable: `plant-demo-test-d5274344a0`. Se eliminaron sus contenedores,
  redes y volumen únicamente después de guardar los logs.
- Dashboard, captura, movimiento, STOP y HOLD aprobados. Lectura: 25 °C, 60 % ambiente,
  45 % suelo, pH 6,5 → **sandía** (`synthetic-five-crops-v2`). Worker Python activo,
  predicción contrastada con el script real y fila SQL confirmada. La lectura completa
  persistió después de `down/up` sin borrar el volumen.
- Puerto web dinámico y conflicto explícito comprobados; Spring sin ruta por defecto.
  Se usó `DEMO_ALLOW_EXISTING_PORTS=1`: los puertos ya ocupados se dejaron intactos.
  Esta recuperación no equivale a una nueva construcción desde un clon limpio.
- Evidencia: `/tmp/plant-demo-verified-report/` y `/tmp/plant-demo-verified.log`.
  Incluye `result.txt`, `execution.log`, `runtime.json`, `capture.json`, capturas PNG,
  conflicto de puerto y logs Compose. Copia durable local en
  `target/demo-delivery/evidence.tar.gz` (directorio ignorado por Git).
- **Ctrl+C confirmado**, sesión de terminal 55410, salida 130. El proyecto
  `plantclassifier-demo-wifi-a1dc523f73` eliminó sus cinco contenedores y dos redes.
  No quedan el lanzador, Metro ni procesos de su grupo; el puerto Metro 45173 cerró.
  `plantclassifier-demo-wifi_demo_data` conserva su fecha de creación del 13 de
  noviembre. Los 19 contenedores ajenos del registro previo mantienen sus IDs y
  siguen activos. Evidencia: `/tmp/plant-demo-ctrl-c-report/`.
- No se reprodujo una fuga con Ctrl+C real ni fue necesario enviar SIGTERM manual.
  No se puede atribuir el antiguo bloqueo de `timeout -s INT` al lanzador: falta su
  evidencia. Los simuladores tardaron unos 10 segundos en la parada de Docker.
- Lanzador: **14 pruebas unitarias aprobadas**. Cada sesión usa un proyecto propio
  y conserva el volumen de demo. Un bloqueo local y una comprobación del volumen en
  uso impiden dos aperturas simultáneas. Estas guardas se verificaron con pruebas
  unitarias; no se repitió el arranque de Metro después de añadirlas.

Comando exacto de la aceptación recuperada:

```bash
CHROME_PATH=/usr/bin/google-chrome DEMO_REUSE_IMAGE_PREFIX=plantclassifier-demo-wifi DEMO_ALLOW_EXISTING_PORTS=1 DEMO_REPORT=/tmp/plant-demo-verified-report python3 scripts/test-demo.py > /tmp/plant-demo-verified.log 2>&1
```

## Diagnóstico y evidencia anterior

La ejecución con Chrome guardó primero `/tmp/plant-demo-final-report/`: pasó el
navegador, pero falló la aserción del worker Python. Inspeccionaba solo los hijos del
hilo principal de PID 1; Java puede crear el worker desde otro hilo. La prueba ahora
busca argumentos `predict.py` y `--worker` en `/proc`, guarda rutas/PIDs en
`runtime.json` y distingue el fallo de aislamiento del fallo de worker.
El intento previo sin `CHROME_PATH` falló porque faltaba la versión de Chromium
esperada por Playwright. Se conservan los dos logs fallidos, sin presentarlos como PASS.
El script ahora escribe `FAIL` en `result.txt` si ocurre una excepción.

El PASS anterior desde un clon limpio y un daemon aislado fue reportado en la sesión
previa. Al retomar ya no existían `/tmp/plant-demo-strict.log`, su supuesto directorio
`strict-report` ni `plant-demo-verification-dind`; no se recuperaron ni se reconstruyeron.
La variable correcta es **`DEMO_REPORT`**, con valor predeterminado
`/tmp/plant-demo-report`. `strict-report` solo corresponde si se configura explícitamente.
No se afirma haber vuelto a verificar aquella construcción desde cero.

## CI y entrega local

El job `demo` configura `DEMO_REPORT=${{ runner.temp }}/plant-demo-report` tanto para
la aceptación como para `upload-artifact`. Guarda stdout/stderr con `tee` y `pipefail`,
sube `standalone-demo` con `if: always()` y falla si no encuentra archivos.
CI construirá desde fuentes: no configura la opción de reutilización de imágenes.
**El workflow está revisado localmente, no ejecutado remotamente con estos cambios.**
No se ha hecho commit ni push. Un clon remoto aún necesita el parche local de esta
entrega; `target/demo-delivery/plant-demo.patch` permite aplicarlo con `git apply`.

## Fallo de arranque corregido

Docker 29 no publica el puerto de un contenedor conectado exclusivamente a una red
interna. Se verificó este fallo durante la implementación y se añadió Nginx como
entrada: Spring, PostgreSQL y ambos simuladores siguen en la red sin salida. El
proxy usa un destino fijo, `app:8080`. La URL se obtiene del servicio `web`, no de `app`.

## Expo Go

Se ejecutó el lanzador real hasta verificar el backend LAN, iniciar Metro y mostrar
el QR con IP/puertos detectados. La parada cerró exclusivamente esa demo LAN y dejó
el volumen. Pasan las pruebas del modo hardware y de URL dinámica/puerto Metro libre.
**Pendiente: probar Expo Go desde un teléfono físico.** No se afirma validación del
trayecto teléfono → backend ni de movimiento físico.
