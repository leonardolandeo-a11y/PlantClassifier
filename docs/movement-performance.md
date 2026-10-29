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
