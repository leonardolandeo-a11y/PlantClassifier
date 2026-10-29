# Movimiento: medición y simplificación

## Alcance y referencia

Referencia original: `737a5a5` en `main`, merge del PR #18 (verificado en GitHub).
Árbol limpio y `origin/main` sincronizado al iniciar. No se crean ramas ni PR.
Las pruebas usan dispositivos **software** y PostgreSQL desechable; no `.env`,
`.env.lab`, bases existentes, volúmenes existentes ni motores físicos.

## Recorrido revisado

1. El navegador escucha `keydown` directamente, sin debounce. Ignora repetición,
   escritura en campos, pestaña oculta y modificadores. La última tecla gana.
2. La protección CSRF necesita un GET `/csrf` por carga de página. Originalmente
   se esperaba ese GET en la primera acción. No se adquiere control del robot
   solo por visitar el dashboard.
3. `/movement/session` pasa por sesión HTTP y CSRF de Spring. `acquire` serializa
   adquisiciones, detiene el dispositivo y recibe una época aleatoria nueva.
4. `/movement` valida el DTO y, bajo un bloqueo corto, propietario, época,
   secuencia y vencimiento. El bloqueo se libera **antes** del HTTP al dispositivo.
   El JSON pequeño con Content-Length evita streaming chunked incompatible.
5. Un RestClient/HttpClient por dispositivo ya permite reutilizar conexiones
   cuando el servidor las acepta. No se crea un cliente TCP por comando.
   El simulador Python cierra conexiones HTTP/1.0: sus resultados no demuestran
   keep-alive en ESP32. No se modifica el servidor embebido para imponerlo.
6. El firmware autentica, valida formato, sesión, secuencia y deadline; aplica
   motor/servo; construye el ACK JSON. Sus actuadores no usan esperas bloqueantes.
7. El frontend verifica el ACK. Si cambió la intención durante el HTTP, envía
   inmediatamente la última dirección. Si no cambió, programa un heartbeat
   250 ms después de la respuesta. **No hay espera de 250 ms para teclas nuevas.**
8. STOP limpia intención y timer, adelanta HTTP pendiente e invalida la época.
   El watchdog independiente detiene tras 1500 ms sin comunicación. Un fallo
   cancela intención; no hay reintento automático de movimiento.

### Límites conservados y su propósito

- `session`, `sequence`: identidad y orden verificados en cada frontera de confianza.
- `generation`: invalida respuestas tardías incluso después de adquirir otra época.
- `acquiring`, `stopping`: trabajos asíncronos diferentes; impiden adquirir en paralelo
  o reutilizar control antes de confirmar STOP.
- `inFlight`: solo una petición normal; identidad del objeto evita limpiar otra petición.
- `desired`: guarda solo la intención más reciente. `timer`: único heartbeat.
- Bloqueo de adquisición: evita que dos propietarios reciban épocas incoherentes.
  Puede demorar STOP durante otra adquisición; esta también ejecuta STOP en firmware.
- Validaciones navegador, Java y firmware: protegen fronteras diferentes. El límite
  de 8 KiB de respuesta protege el backend; no es una cola ni una espera artificial.
- Timeouts: conexión Java 300 ms, respuesta 500 ms, navegador 1200 ms. No son retrasos
  añadidos a peticiones exitosas. No se reducen para maquillar las mediciones.
- Interbloqueo de inversión: rechaza inversión durante 500 ms; no duerme ni programa
  un arranque posterior. W→S aceptado en simulación **no equivale** a inversión física.
- `delay(1)` cede CPU a tareas del ESP32; checks antes/después del HTTP conservan
  expiración previa y detección tras trabajo de red. Reconexión cada 5 s solo al
  perder Wi-Fi; espera de 400 ms solo en setup. No son debounce de teclado.
- Watchdog adicional por estado del actuador, fallos PWM/servo, pines, PWM, simulación
  predeterminada, CSRF, token privado y publicación localhost se conservan.

## Método reproducible

Construir la imagen del checkout a comparar y ejecutar:

```bash
docker build -t plantclassifier:movement-before .
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 \
PLANT_TEST_IMAGE=plantclassifier:movement-before \
PLANT_BENCHMARK_OUTPUT=/tmp/movement-before.json \
python3 scripts/test-browser.py
```

Repetir con imagen y salida `movement-after`. El runner crea recursos efímeros,
verifica simulación y no acepta hardware habilitado. `CHROME_PATH` permite elegir
Chrome instalado. Sin `PLANT_BENCHMARK_OUTPUT` ejecuta la suite E2E.

Chromium ejecuta los listeners reales con eventos de teclado sintéticos, no una
medición de latencia del teclado físico/OS. Cada primera tecla se mide tras recargar
la página, completar `/sensors` y esperar la misma ventana de 50 ms. Se conserva
el contexto HTTP entre recargas. No incluye startup de JVM ni apertura del navegador.
100 repeticiones por primera tecla y cambio W→A/D/S; STOP y reinicios se agrupan.
`performance.now()` mide evento→fetch, fetch→JSON y evento→texto de ACK válido.
No se resta un reloj de otro dispositivo. El wrapper solo registra números, sin
sesiones/tokens ni logs por comando. Los resultados incluyen todas las muestras,
sin descartar outliers. p95 = rango `ceil(0.95*n)`; mediana convencional.

La prueba opcional `MovementLatencyTest` usa `System.nanoTime()` alrededor del
servicio real y HTTP autenticado hacia el simulador. Tras 10 calentamientos mide
100 muestras por comando. Incluye validación, JSON y viaje de red; no incluye
navegador ni filtros de Spring. No instrumenta producción ni depende de PostgreSQL.

El tiempo **dentro del ESP32**, Wi-Fi, UART, consumo, movimiento mecánico y parada
física requieren hardware; no se sustituyen por números del simulador Python.

## Cambios y decisiones

| Mecanismo | Decisión | Evidencia / responsabilidad |
|---|---|---|
| GET CSRF dentro de primera pulsación | Prepararlo al cargar | El GET medido se elimina del recorrido cuando ya terminó el bootstrap; no se elimina CSRF |
| Token resuelto + promesa pendiente separados | Una sola promesa compartida | Una promesa resuelta ya conserva el token; simultaneidad cubierta por E2E |
| `Serial.printf` por movimiento | Eliminado | Solo observabilidad, sin consumidores de control; ACK y `/status` ya exponen estado. Ganancia física pendiente de medir |
| `sendError` duplicado | Usar `protocolError` | Mismo status, MIME y JSON; reduce mantenimiento, sin atribuirle ganancia de latencia |
| `checkControlSafety` sin llamadas | Eliminado | La seguridad activa usa `checkMovementSafety` antes y después de HTTP; ganancia temporal nula, código muerto |
| Sesión + primer movimiento atómicos | No implementado | Complica cancelar antes de conocer la época; no justificado por los tiempos locales |
| Concurrencia de movimientos normales | No implementada | Ya se colapsan cambios pendientes; STOP sí puede adelantar. No se acumula una cola |
| Desactivar ahorro Wi-Fi / otro servidor HTTP | No implementado | Requiere medir placa, energía, radio y comportamiento de watchdog; no hay evidencia local |
| MQTT, broker, WebSocket, otros servicios | No implementados | HTTP local cumple objetivos sin infraestructura adicional |

No se presenta la limpieza de firmware como mejora numérica del benchmark Python:
ese benchmark **no ejecuta** el `.ino`. El único cambio en el recorrido medido del
navegador es CSRF. Tampoco se atribuyen variaciones de W→A/D/S o STOP a una
optimización de esos caminos: permanecen iguales salvo la microtarea de la promesa
CSRF resuelta. El número total de GET CSRF sigue siendo uno por carga; ahora ocurre
incluso si el usuario no mueve ni captura. No hay preadquisición de control.

## Cobertura de seguridad

| Escenarios solicitados | Comprobación |
|---|---|
| Primera W/A/S/D, volver tras STOP | Unitarias, 100 repeticiones por tecla y E2E |
| W→A/D/S, W→A→D→S rápido | Benchmark y unitarias con FORWARD pendiente; solo última intención |
| Mantener W, heartbeat, soltar | Unitarias y E2E durante más de 3 s |
| Perder foco, campos editables, ocultar pestaña | E2E; no reinicio automático |
| Abandonar página | Navegación real a `about:blank`, STOP keepalive y consulta del simulador |
| FORWARD retrasado, STOP pendiente, ACK fuera de orden | Unitarias, HTTP Java concurrente y E2E con respuesta/transporte retenidos |
| Pérdida / recuperación Wi-Fi | Función real de seguridad con conectividad simulada en host; no prueba de radio física |
| Sesiones vencidas, secuencias repetidas, deadlines | C++ CommandGate y conformidad HTTP del simulador |
| Timeout / error de red | HTTP Java con respuesta demorada; control cancela intención, E2E aborta transporte |
| Separación movimiento / sensores | Pruebas de rutas, dos simuladores independientes y compilación de sketches |
| CSRF pendiente + captura + movimiento | E2E retiene GET; un bootstrap compartido y ningún movimiento antes de protección |
| Motor y servo | Mocks de funciones reales en ambos modos: STBY, PWM, servo, fallos, inversión, rollover |

El watchdog no puede garantizar un plazo duro si `WebServer.handleClient()` queda
bloqueado por un cliente lento. Los tests de host no prueban esa planificación del
ESP32. No se debilitan las protecciones existentes ni se promete parada física en
100 ms; ese objetivo describe la confirmación HTTP en simulación local.

## Resultados locales (milisegundos)

Medición en Linux, Java 21, Node 24, Chrome headless y Docker local.
Cada celda: **media / mediana / p95 / máximo**. Los datos agregados completos
están en [movement-latency.json](movement-latency.json).

| Escenario | Antes | Después | Cambio p95 |
|---|---|---|---|
| initial w | 15.13 / 14.30 / 22.30 / 185.90 | 10.31 / 8.60 / 14.90 / 115.30 | +33.2% |
| initial a | 13.43 / 14.50 / 20.70 / 26.10 | 9.37 / 8.80 / 14.00 / 17.10 | +32.4% |
| initial s | 13.71 / 14.35 / 19.20 / 30.40 | 8.93 / 8.35 / 13.20 / 16.20 | +31.2% |
| initial d | 13.38 / 14.15 / 18.40 / 22.20 | 8.92 / 8.60 / 12.60 / 15.60 | +31.5% |
| W -> A | 4.00 / 4.20 / 6.20 / 7.80 | 3.36 / 2.80 / 6.20 / 13.40 | +0.0% |
| W -> D | 3.93 / 4.15 / 6.40 / 8.50 | 3.00 / 2.65 / 4.80 / 10.20 | +25.0% |
| W -> S | 3.96 / 4.20 / 6.90 / 9.70 | 3.10 / 2.75 / 5.10 / 7.10 | +26.1% |
| release STOP | 4.55 / 4.70 / 7.60 / 12.10 | 3.65 / 3.20 / 6.10 / 13.10 | +19.7% |
| restart W | 7.69 / 8.40 / 12.60 / 16.60 | 5.92 / 5.20 / 9.70 / 21.50 | +23.0% |
| /movement/session | 4.30 / 4.20 / 6.40 / 95.60 | 4.21 / 4.00 / 6.70 / 66.00 | -4.7% |
| /movement | 4.26 / 4.30 / 7.10 / 79.00 | 3.41 / 3.00 / 5.70 / 48.50 | +19.7% |

Un cambio positivo indica reducción, negativo aumento. La adquisición mantiene
el mismo protocolo: su p95 no mejora; no se atribuye mejora al backend. Los
cambios de dirección y STOP ya estaban por debajo de 100 ms. La primera W baja
de 22.3 a 14.9 ms de p95 (33.2%); el coste evitado es un GET CSRF en la pulsación.
No se elimina el GET: se desplaza a la carga de página. La mejora depende de que
el bootstrap haya finalizado; pulsar inmediatamente durante él todavía espera.

| Evento → envío `/movement` | Antes | Después |
|---|---|---|
| initial w -> HTTP | 10.01 / 9.45 / 13.60 / 106.70 | 6.11 / 5.20 / 8.00 / 66.80 |
| W -> A -> HTTP | 0.05 / 0.00 / 0.10 / 0.20 | 0.06 / 0.10 / 0.10 / 0.20 |
| W -> D -> HTTP | 0.06 / 0.10 / 0.20 / 0.20 | 0.04 / 0.00 / 0.10 / 0.20 |
| W -> S -> HTTP | 0.06 / 0.10 / 0.10 / 0.20 | 0.05 / 0.00 / 0.20 / 0.30 |
| release STOP -> HTTP | 0.06 / 0.10 / 0.20 / 0.40 | 0.06 / 0.10 / 0.20 / 0.40 |

El tiempo de primera W hasta `/movement` incluye CSRF (antes) y adquisición.
Los cambios/STOP se despachan inmediatamente; resolución del reloj del navegador
aproximadamente 0.1 ms. No se interpreta 0.0 como ausencia de trabajo.

| Servicio Java → simulador → ACK | Antes | Después |
|---|---|---|
| session | 0.81 / 0.72 / 1.29 / 2.48 | 0.72 / 0.67 / 0.86 / 2.33 |
| FORWARD | 0.90 / 0.84 / 1.32 / 2.10 | 0.82 / 0.77 / 1.15 / 1.88 |
| LEFT | 0.89 / 0.84 / 1.24 / 2.05 | 0.86 / 0.77 / 1.10 / 4.21 |
| RIGHT | 0.93 / 0.84 / 1.39 / 4.72 | 0.82 / 0.78 / 1.42 / 1.85 |
| BACKWARD | 0.93 / 0.83 / 1.56 / 2.22 | 0.79 / 0.76 / 1.06 / 1.41 |
| STOP | 0.91 / 0.84 / 1.40 / 2.54 | 0.80 / 0.77 / 1.07 / 1.89 |

El servicio Java y el simulador no se modificaron: las diferencias de estas
filas son variación del entorno, no evidencia de una optimización. El benchmark
no establece causalidad para mejoras fuera de la primera pulsación.

## Verificación final y publicación

- `npm run typecheck`, `npm test` (18 pruebas) y `npm run build`: pasan.
- `./mvnw verify`: 34 pruebas descubiertas, sin fallos; 3 omisiones deliberadas:
  2 pruebas PostgreSQL requieren su runner y 1 benchmark requiere opt-in.
- `scripts/test-postgres.sh`: pasa con PostgreSQL efímero; pruebas omitidas arriba ejecutadas.
- Benchmark Java opt-in: pasa en ambas ejecuciones (100 muestras tras calentamiento).
- `scripts/test-firmware.sh`: pasa; C++ compila con warnings como errores.
- `scripts/compile-firmware.sh`: pasa con Arduino CLI 1.5.2-rc.1 y core instalado;
  ambos sketches simulados y Movement hardware compilados. Sin upload; símbolos
  del sketch simulado verificados para ausencia de llamadas de hardware.
- `python3 scripts/test-simulator.py`: pasa; roles, autenticación, comandos,
  secuencias, deadlines, STOP y watchdog.
- `python3 scripts/check-secrets.py` y `git diff --check`: pasan.
- Docker build y `scripts/smoke-docker.py`: pasan; CSRF, ACK, ML real y persistencia.
- Playwright E2E: pasa; incluye CSRF retenido, carreras, STOP, heartbeat, foco,
  ocultar pestaña y navegación real con parada observada antes de 750 ms.
- Maven/simulador necesitaron ejecución fuera del sandbox para abrir sockets.
  El primer intento de medir 204 y las observaciones de eventos tras navegación
  fallaron en el arnés; se corrigieron y repitieron. No se descartaron tests del producto.
- CI de referencia `737a5a5`: success, run `40816937027`. Consultar el run del
  commit final en GitHub Actions después del push; el resultado se informa en la entrega.

### Archivos modificados

Producción: `frontend/scripts.ts`, su generado `static/js/scripts.js`,
`ESP32/Movement/Movement.ino`, `ESP32/Movement/control_protocol.h`.
Tests: `frontend/control.test.mjs`, `scripts/browser-e2e.mjs`, nuevos
`scripts/test-browser.py`, `scripts/benchmark-movement.mjs`,
`src/test/java/com/codewithmosh/plantclassifier/MovementLatencyTest.java`.
Documentación: este informe y `docs/movement-latency.json`.
No se modificaron login, `/test`, PostgreSQL/Flyway, ML, sensores, diseño,
configuración privada, pines ni PWM. No hubo cambios de producción Java porque
las mediciones no justificaron añadir o retirar mecanismos allí.

### Tamaño

Repositorio: 102 → 107 archivos versionados; texto UTF-8 sin NUL: 101 → 106 archivos, 18863 → 19698 líneas (incluye datos, tests y documentación; excluye binarios). Los cuatro archivos de producción modificados pasan de 499 a 480 líneas: **19 líneas menos**. Se añaden cinco archivos de medición/documentación y se modifican seis existentes; no se añaden clases de producción, dependencias ni servicios.

### Explicación para la exposición

1. El navegador prepara la protección HTTP al abrirse y detecta una tecla.
2. Obtiene una sesión del robot cuando hace falta, nunca solo por abrir la página.
3. Spring valida y retransmite inmediatamente el comando.
4. El ESP32 valida época, orden y vigencia, ejecuta y confirma.
5. STOP adelanta solicitudes pendientes y cierra la sesión anterior.
6. Si se pierde comunicación, el watchdog detiene y no reinicia automáticamente.

### Pendiente con hardware

Medir por separado `micros()` dentro del handler, tiempos de actuadores, radio,
TCP y ahorro Wi-Fi; no mezclar relojes. Eliminar logs no demuestra por sí solo
una mejora física cuantificada. Repetir movimiento/STOP con ruedas elevadas,
alimentación aislable y supervisión; la parada confirmada es un ACK, no feedback
mecánico. Validar clientes lentos del WebServer y desconexión/reconexión real.
La inversión de 500 ms se conserva íntegra y puede rechazar W→S físico aunque
el simulador acepte la secuencia. No se flasheó ni modificó el robot conectado.
