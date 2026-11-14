# Auditoría end-to-end — 2026-11-13 (America/Lima)

## Alcance y referencia

Referencia y HEAD comprobado: `937674c7e9b91aa0862336bdb2921b83a395d75f`. No hay commits posteriores a la referencia en este checkout. `git status --short` estaba vacío al comenzar; no se sustituyeron archivos privados/ignorados ni se hizo reset, commit o push. Los cambios de esta revisión quedan locales.

Validación con perfiles de test, PostgreSQL temporal sin volúmenes del laboratorio, brokers temporales en loopback y ESP32 simulados con salida física deshabilitada. No se arrancó el lanzador contra `.env.lab`, no se modificaron credenciales, no se cargó firmware y no se actuó sobre hardware. Se conservaron los servicios de laboratorio existentes. La auditoría no certifica comportamiento físico ni Expo Go nativo. El build fue interrumpido en la salida de herramientas por un reinicio del servidor de la sesión; después se comprobó la imagen terminada y los logs antes de continuar, sin repetir mutaciones a ciegas.

## Hallazgos confirmados

### F1 — Alta: una lectura del servo detenía el carro

- Archivos: `frontend/src/servo/controller.ts`, `mobile/src/screens/MovementScreen.tsx`.
- Reproducción: mantener ↑ con ACK de movimiento válidos; rechazar repetidamente GET `/sensor-servo`. Antes se enviaba STOP y se invalidaban los dedos, aunque el encabezado continuaba en «Listo».
- Causa: el callback de error mezclaba lectura periódica y adquisición/control del servo; todos los errores llamaban a la parada global.
- Decisión: **corregido**. El controlador identifica origen `read`/`control`. El móvil muestra el error de lectura sin cancelar propulsión. Un fallo de adquisición/comando/HOLD sigue cancelando ambos controles. La pérdida real del backend sigue desmontando controles; las renovaciones fallidas y el watchdog conservan su comportamiento.
- Regresión: `repeated idle servo read failures do not stop held propulsion; control failure still stops both` falló antes (`STOP=true`) y pasa después. Comprueba varias lecturas fallidas, propulsión mantenida y STOP/HOLD ante fallo de control. Las pruebas existentes cubren pérdida de Wi-Fi, foco, STOP, HOLD y nuevas pulsaciones después de reconectar.

### F2 — Media: captura habilitada ignorada durante sondeo

- Archivo: `mobile/App.tsx`.
- Reproducción: resolver conexión inicial, dejar pendiente el sondeo de los 5 segundos, pulsar «Capturar datos». Antes no se llamaba a `/sensors/capture`.
- Causa: `pending.current` bloqueaba tanto mutaciones como lecturas automáticas, pero la UI solo deshabilitaba por `busy`.
- Decisión: **corregido**. La captura explícita cancela el sondeo; una referencia independiente impide duplicar capturas mientras la mutación está pendiente. Las respuestas/finalizadores cancelados no pueden reemplazar datos ni limpiar el estado de otra operación. No se reintenta automáticamente una mutación.
- Regresión: `explicit capture preempts a pending poll, deduplicates taps and ignores its late failure` falló antes (cero capturas) y pasa después. `a late successful health read cannot replace the explicitly captured data` verifica también éxito tardío del sondeo.

### F3 — Media: errores de sensores confundidos con sesión/conectividad

- Archivos: `mobile/src/api/client.ts`, `mobile/App.tsx`, `mobile/src/screens/DataScreen.tsx`.
- Reproducción: responder a POST `/sensors/capture` con HTTP 409 y `type=urn:plantclassifier:stale-sample`. Antes aparecía «Control caducado», se perdía `client` y la pantalla indicaba «Sin conexión»; además Datos ocultaba el detalle tras un texto genérico.
- Causa: clasificación de todo 409 como `ControlRejected` y desconexión incondicional en el catch de captura.
- Decisión: **corregido**. Se interpreta ProblemDetail de sensores/persistencia/transporte, se reserva el conflicto de control para sus rutas y se distingue respuesta HTTP de fallo de red. Una respuesta HTTP fallida mantiene conexión al backend y muestra el error específico. Un fallo de red durante captura sí desconecta, como verifica una prueba separada. El 403 invalida CSRF; solo una acción nueva lo renueva. Nunca se repite automáticamente la captura.
- Evidencia: cuatro regresiones de UI (409 stale-sample, 503 capture-busy, 503 persistence, 403 sesión) fallaron antes y pasan después, con exactamente una mutación. `403 invalidates CSRF but never replays a mutation; a fresh action bootstraps again` verifica renovación explícita. Se conserva la lectura anterior sin atribuirle una recomendación nueva.

### F4 — Alta: cambio silencioso de MQTT a HTTP / reutilización de Compose

- Archivos: `scripts/start-wifi.py`, `scripts/test-start-wifi.py`, `README.md`, `mobile/README.md`, `.github/workflows/verify.yml`.
- Reproducción sin tocar servicios: mocks con `DEVICE_TRANSPORT=mqtt` en el entorno efectivo del env-file o un proyecto existente ajeno al lanzador. En la referencia se ejecutaba `up ... app` con solo el Compose base HTTP, ignorando `COMPOSE_FILE`; el proyecto por defecto era `plantclassifier-lab`. El cierre podía detener el app de ese proyecto.
- Causa: selección forzada de archivos Compose sin validar transporte ni procedencia de recursos.
- Decisión: **corregido**. El lanzador declara que solo soporta HTTP y rechaza configuración MQTT/COMPOSE_FILE antes de mutar servicios. Usa `plantclassifier-wifi` por defecto (también ante variable vacía), etiqueta sus contenedores y volumen, y rechaza recursos existentes sin esa etiqueta. Consulta solo etiquetas, no imprime configuración ni secretos. Mantiene validación de bind privado, cambio de red y parada de app sin borrar volúmenes. No incorpora MQTT parcialmente al lanzador.
- Regresión: pruebas de env-file MQTT, contenedor ajeno y volumen ajeno verifican que no ocurre `up` ni `stop`; diez pruebas del lanzador pasan. La suite nueva contra copia de `937674c:scripts/start-wifi.py` falla (antes de añadir los dos casos finales: cuatro fallos y dos errores). Se añadió la suite al workflow para que no quede fuera de CI.
- Compatibilidad: el comando corto ya no reutiliza la base de laboratorio. Si sus puertos están ocupados, elegir puertos libres en la configuración dedicada; no detener ni borrar el laboratorio para liberar puertos. Los proyectos antiguos sin etiqueta se rechazan expresamente.

## Otros riesgos revisados

| Severidad si reaparece | Archivo / área | Reproducción / causa examinada | Decisión y evidencia |
|---|---|---|---|
| Alta | `frontend/src/movement/controller.ts`, controlador de servo | Soltar o STOP durante adquisición lenta; ACK después de soltar | **No reproducido**: generación invalida intención y cierra sesión tardía con STOP/HOLD. Pruebas móviles y web pasan. |
| Alta | `mobile/src/components/HoldButton.tsx`, `MovementScreen.tsx` | Dos dedos sobre una flecha, avance + giro, soltar uno; scroll, cancelación, rotación, background/blur | **No reproducido en mocks**: se conservan dedos restantes, se detiene ante pérdida de foco y se exige gesto nuevo. Multitouch nativo queda pendiente. |
| Alta | `mobile/App.tsx`, controladores compartidos | Pérdida de Wi-Fi/backend durante pulsación y reconexión con dedo antiguo | **No reproducido**: pruebas móviles y E2E HTTP/MQTT comprueban STOP y ausencia de reanudación automática. |
| Alta | API Spring, `SensorClient` | Mutación sin CSRF, 403, sesión ajena/caducada | **No reproducido** fuera de F3: API rechaza mutaciones; cliente no reenvía; acción nueva renueva CSRF. Cookies nativas pendientes en Expo Go. |
| Media | `SensorDataService`, migración V7 | Capturas concurrentes con misma identidad de muestra, insert duplicado, escritura fallida | **No reproducido**: índice único arbitra concurrencia, retorna fila ganadora y conserva históricos. Siete pruebas con PostgreSQL real temporal; pruebas de servicio y persistencia pasan. |
| Media | `service/MLService`, `SensorDataService` | Timeout/crash de worker, fallo de predicción tras guardar | **No reproducido**: suites Java verifican timeout, recuperación y lectura persistida con diagnóstico FAILED/PENDING; E2E usa ML real. |
| Alta | Transporte MQTT y sketches con mocks | ACK tardío/duplicado, presencia retenida, broker reiniciado, saturación y pérdida de Wi-Fi | **No reproducido**: once pruebas con broker temporal y pruebas de firmware verifican STOP/HOLD prioritarios, watchdog, conexión nueva y ausencia de replay. E2E MQTT confirma recuperación de broker. |
| Media | Backend/PostgreSQL | Reiniciar app después de captura | **No reproducido**: E2E HTTP y MQTT recuperan id y predicción, conservan cuatro filas y comprueban actuadores simulados en STOP sin sesión. |

## Pruebas y evidencia local

Los logs bajo `/tmp` son evidencia de esta sesión, no artefactos permanentes del repositorio. Una ejecución bloqueada no se cuenta como aprobada.

| Comando / prueba | Resultado |
|---|---|
| `npm test` | **114/114**, `/tmp/audit-web.log`. |
| `npm test --prefix mobile` | **38/38**, `/tmp/audit-mobile-final.log`. Primera reproducción: 6 fallos nuevos y 29 pruebas previas aprobadas en `/tmp/audit-mobile-before.log`. También se ejecutaron 37 pruebas finales contra una copia de los fuentes de `937674c` en `/tmp` (sin modificar el checkout): 7 fallos y 30 aprobadas, `/tmp/audit-mobile-reference.log`. |
| `npm run typecheck`, `npm run lint`, `npm run typecheck --prefix mobile` | **Aprobados**, logs `/tmp/audit-web-types.log`, `audit-lint.log`, `audit-mobile-types.log`. |
| `npm run export --prefix mobile` | **Aprobado**, bundle Android de 613 módulos, `/tmp/audit-android.log`. No equivale a prueba en Expo Go. |
| Python ML en imagen aislada, fuente montado solo lectura, sin red | **9/9**, `/tmp/audit-ml.log`. Primer intento sin montar tests ejecutó cero pruebas y no se contó como aprobado. |
| Java 21 `./mvnw -B verify` | **BUILD SUCCESS**: 81 contabilizadas, 0 fallos/errores, **19 omitidas** por requerir infraestructura/benchmark; `/tmp/audit-maven.log`. Primera ejecución sandbox tuvo 4 errores de sockets; repetida fuera del sandbox con éxito. |
| Java 21 `scripts/test-postgres.sh` | **7/7 sin omisiones**, PostgreSQL temporal; `/tmp/audit-postgres.log`. |
| Java 21 `DIAGNOSTIC_PYTHON=.venv-diagnostics/bin/python scripts/test-mqtt.sh` | **11/11 sin omisiones** y diagnósticos aprobados; `/tmp/audit-mqtt.log`. |
| `scripts/test-mosquitto-config.sh` | **Aprobado**: configuración real, autenticación técnica, healthcheck y rechazo anónimo; `/tmp/audit-acl.log`. |
| `scripts/test-firmware.sh` | **Aprobado** HTTP/MQTT, command gate, actuadores mock, sensores, watchdog y reconexión; `/tmp/audit-firmware.log`. Sin carga a placas. |
| `python3 scripts/test-simulator.py` | **Aprobado** fuera del sandbox (primero se rechazó crear socket); `/tmp/audit-simulator.log`. |
| `python3 scripts/test-start-wifi.py` | **10/10**, sin arrancar servicios ni leer archivos privados. Interpolación real de Compose con env-file temporal MQTT también comprobada: `/tmp/audit-compose-preflight.log`. |
| Imagen `plantclassifier:audit` | Construida desde cambios locales; id `sha256:6b2559c28e6f9cdee57ce91dd2e07367d99bbefe7f53219488e2b01ff38b3b7f`. |
| `scripts/test-browser.py`, HTTP, Chrome instalado | **Aprobado**, `/tmp/audit-e2e-http.log`: navegador → Spring → simulador → ML → PostgreSQL; STOP/HOLD, CSRF, fallos, navegación, Wi-Fi, reinicio y persistencia. Primer intento sin Chrome disponible para Playwright no llegó a ejecutar navegador. |
| `PLANT_TEST_IMAGE=plantclassifier:audit python3 scripts/smoke-docker.py` | **Aprobado**, `/tmp/audit-smoke.log`; timeout real del worker conserva captura, STOP no espera ML y un worker nuevo recupera. |
| Mismo E2E, `PLANT_BROWSER_TRANSPORT=mqtt` | **Aprobado**, `/tmp/audit-e2e-mqtt.log`; incluye caída/reinicio de broker y no replay. |

La matriz completa `scripts/test-browser-repeat.py` también pasó **7/7 sin reintentos**, usando Chromium de Playwright en `/tmp/plant-audit-browsers`: `http-1`, `http-2`, `mqtt-1`, `mqtt-2`, `mqtt-3`, `mqtt-load-1`, `mqtt-load-2`. Los dos últimos inyectan 150 ms de retraso de transporte y 2200 ms de bloqueo del renderizador; comprueban STOP por watchdog y no reanudación automática. Evidencia: `/tmp/audit-repeat.log`, `/tmp/plant-audit-repeat/results.json` y logs por caso. Cada ejecución usó servicios independientes y verificó persistencia después de reiniciar el backend.

Los E2E individuales usan `PLANT_TEST_IMAGE=plantclassifier:audit`, `CHROME_PATH=/usr/bin/google-chrome`, `DIAGNOSTIC_PYTHON=.venv-diagnostics/bin/python`. Los runners crean nombres aleatorios, claves temporales, puertos loopback y PostgreSQL tmpfs; limpian esos contenedores al finalizar. El benchmark opcional `MovementLatencyTest` no se ejecutó y no se cuenta como aprobado.

## GitHub Actions — F5, fallo E2E no reproducido localmente

[Verify system, ejecución 43533172744](https://github.com/leonardolandeo-a11y/PlantClassifier/actions/runs/43533172744), commit exacto de referencia: **failure**. Pasaron web, Maven, PostgreSQL, firmware host y compilación ESP32, MQTT, Expo, ML, imagen y smoke. Falló la primera repetición de navegador HTTP; las siguientes repeticiones no se ejecutaron. No es evidencia de aprobación global ni de los cambios locales no publicados.

**Severidad: media. Archivo:** `scripts/browser-e2e.mjs`. **Decisión: pendiente**, fallo confirmado en CI; sin causa confirmada localmente y sin cambio especulativo al controlador ni al watchdog. **Reproducción:** workflow de la referencia, primera repetición HTTP.

El artefacto `browser-validation/http-1.log` muestra watchdog del runner a los 120 s, esperando `arrival` de `/movement/session` en `scripts/browser-e2e.mjs:162`, después del caso de foco en campo editable. Descargado a `/tmp/plant-audit-ci`, resumen `/tmp/audit-github.json`. Hay una pulsación `w` previa sin liberación explícita antes de escribir en el input: posible dependencia del comportamiento de teclado/Chromium. La ejecución local con Chrome instalado pasó ese punto; la repetición HTTP con Chromium Headless Shell 151.0.7922.34 de Playwright (misma versión de CI) también pasó completa, incluida persistencia tras reinicio: `/tmp/audit-e2e-ci-browser.log`. La matriz posterior de siete ejecuciones también pasó sin reintentos. No se atribuye el bloqueo a una causa demostrada ni se marca CI como aprobada. Pendiente: capturar foco/visibilidad, eventos de teclado y tráfico de sesión si vuelve a fallar en el runner de GitHub; no ampliar timeouts ni debilitar la exigencia de pulsación nueva para disimularlo.

## Flujo local por Wi-Fi

### HTTP con el lanzador

1. Ubuntu y teléfono en la misma Wi-Fi privada. Dependencias instaladas, NetworkManager e interfaz física inequívoca.
2. Usar configuración HTTP dedicada con puertos libres si ya hay otros proyectos activos. Ejecutar `python3 scripts/start-wifi.py --env-file .env.personal --interface NOMBRE_REAL`. El comando corto mantiene `.env.lab` como archivo por defecto, pero el proyecto ahora es `plantclassifier-wifi`; no reutiliza la base del laboratorio.
3. Escanear QR en Expo Go. Abrir `/sensors` desde el teléfono si falla la conexión. Ctrl+C detiene Expo y app; conserva datos del proyecto dedicado. No usar `down -v`.
4. Si aparece el rechazo por proyecto ajeno o configuración MQTT, no borrar recursos ni eliminar las variables MQTT para forzar HTTP. Elegir configuración/proyecto HTTP realmente independiente o seguir el flujo MQTT.

### MQTT explícito (no soportado por `start-wifi.py`)

Mantener el flujo de `docs/MQTT_MIGRATION.md`, con ambos archivos `-f docker-compose.yaml -f docker-compose.mqtt.yaml` en **todos** los comandos Compose del proyecto MQTT. Elegir deliberadamente el proyecto y su configuración privada ya preparada; no emplear el proyecto de laboratorio para una prueba desechable. No regenerar secretos existentes. El broker conserva autenticación/ACL; solo se publica en la interfaz privada cuando los dispositivos necesiten alcanzarlo. PostgreSQL queda en loopback.

Ejemplo de arranque deliberado del proyecto MQTT dedicado, después de preparar la configuración según esa guía (sustituir los marcadores, sin modificar secretos existentes):

```bash
APP_BIND_ADDRESS="<IPv4-privada-Ubuntu>" MQTT_BIND_ADDRESS="<IPv4-privada-Ubuntu>" \
docker compose -p <proyecto-MQTT-dedicado> --env-file <archivo-MQTT-privado> \
  -f docker-compose.yaml -f docker-compose.mqtt.yaml up -d --build --wait app
```

Para conectar Expo a ese backend, arrancar Metro por LAN con:

```bash
EXPO_PUBLIC_API_URL="http://<IPv4-privada-Ubuntu>:<puerto-API>" \
REACT_NATIVE_PACKAGER_HOSTNAME="<IPv4-privada-Ubuntu>" \
EXPO_NO_DOTENV=1 npm start --prefix mobile -- --lan --go --clear --port 8081
```

El teléfono usa HTTP con cookies/CSRF contra Spring; no necesita credenciales MQTT. En Compose, usar `APP_BIND_ADDRESS` para esa IP y, solo si corresponde, `MQTT_BIND_ADDRESS` para el broker. Seleccionar IP mediante `ip -j -4 address show up` y verificar interfaz física/conexión con NetworkManager; no copiar una IP histórica. Este flujo manual requiere detener Expo/app si cambia la red: no tiene el monitor automático del lanzador HTTP. No necesita Tailscale, hosting ni túneles públicos.

## Pendiente en Ubuntu y Expo Go

- **Ubuntu real:** comprobar selección de interfaz/SSID, puertos libres, rechazo de MQTT/proyecto ajeno sin cambiar servicios, Ctrl+C y cambio de Wi-Fi/IP. Los mocks no prueban NetworkManager ni conectividad de un teléfono.
- **Expo Go compatible:** comprobar cookies/CSRF nativos por HTTP privado, captura durante sondeo, detalle de stale-sample y sesión vencida sin falsa desconexión ni doble mutación.
- **Gestos nativos:** avance + giro, dos dedos en el mismo botón, soltar uno, arrastre fuera, scroll, cambio de pestaña, orientación, notificaciones, bloqueo/background y regreso. STOP/HOLD deben cancelar y el regreso exigir pulsación nueva.
- **Pérdida de Wi-Fi:** confirmar estado desconectado y recuperación sin movimiento antiguo. Distinguir fallo solo de lectura del servo del fallo de control y del backend.
- **Hardware:** no validado en esta auditoría. Las pruebas propuestas para el teléfono deben empezar contra simuladores; no asumir que exportar Android o probar sketches con mocks certifica motores/servo físicos.
