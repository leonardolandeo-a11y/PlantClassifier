# Migración MQTT de laboratorio

Implementación en main. La continuación parte del commit `f472cbd`; esta verificación no crea commits ni despliega. No se han cargado sketches ni accionado dispositivos.

## Arquitectura y seguridad

React/Expo → API Spring con cookies/CSRF → servicios existentes → adaptador MQTT central → Mosquitto → ESP32. PostgreSQL, migraciones y predicciones no cambian. No hay cuentas de interfaz ni roles de usuario; las credenciales MQTT son técnicas y tienen ACL por dispositivo.

`DEVICE_TRANSPORT=http` es el valor por defecto. El override Docker activa `mqtt` explícitamente. No hay fallback automático. En firmware, `MQTT_ENABLED=1` rechaza por HTTP la adquisición y las órdenes de actuadores, incluso si Spring está configurado incorrectamente. HTTP conserva diagnósticos de lectura; durante control MQTT activo no se atiende HTTP para evitar que clientes lentos bloqueen el watchdog. Para rollback hay que detener el control, restaurar ambos sketches con MQTT deshabilitado y levantar solo el Compose base. Nunca cambiar de modo con actuadores energizados.

Topics por `movement` y `sensor` bajo `plant/v1/<dispositivo>/`:

| Topic | Uso |
| --- | --- |
| `command` | Solicitudes ordinarias; también GET de diagnóstico |
| `urgent` | STOP/HOLD, buzón independiente prioritario |
| `ack` | Confirmación emitida por el firmware tras validar/aplicar la operación lógica |
| `state` | Presencia cada segundo; Last Will offline; nonce de conexión |
| `telemetry` | Diagnóstico lógico cada segundo, sin muestras inventadas |
| `probe` | Eco ESP32 → broker → ESP32, de solo lectura, cada 10 segundos |

Órdenes y ACK: QoS 0, retain=false. Se evita retransmisión MQTT de movimiento; pérdidas producen timeout/watchdog, nunca reintentos automáticos de órdenes. Las conexiones TCP se mantienen abiertas, pero MQTT usa clean session y sin buffering offline. Mosquitto no persiste sesiones ni retiene órdenes desde la aplicación. El firmware descarta mensajes marcados retained y exige nonce aleatorio nuevo por reconexión, además de sesión/epoch, secuencia creciente y deadline del protocolo original. La cola local normal es limitada y descarta entradas de más de 250 ms. STOP/HOLD cierran la sesión e invalidan órdenes posteriores de esa sesión. La desconexión invalida el control y una reconexión no lo restaura.

La tarea de red utiliza ArduinoMqttClient 0.1.8; no toca actuadores. El loop principal procesa primero seguridad y órdenes urgentes. Los watchdogs existentes permanecen: carro 1500 ms y servo 1000 ms. PWM, STBY, interbloqueo, polaridad -1, GPIO y límites del MG996R se conservan. Heartbeats idénticos no reescriben PWM/STBY.

Spring usa Paho asíncrono, correlación por UUID/rol/nonce y cupos separados para operaciones normales y urgentes. PUBACK/publicación no es ejecución. Los futures se eliminan al completar, desconectar o vencer. Las adquisiciones no retienen el monitor de estado durante I/O: STOP/HOLD pueden adelantarse a ellas; una revisión de control impide que la respuesta tardía reabra control y cierra esa sesión tardía. El adaptador compatible con RestClient espera el ACK en el hilo de solicitud, con límite de 600 ms configurable 50–750 ms; NO es un controlador HTTP completamente no bloqueante. Este límite es provisional y debe ajustarse con mediciones LAN, sin aumentar watchdogs. Broker desconectado, ESP32 ausente, rechazo y timeout tienen categorías distintas.

## Arranque sin alterar datos existentes

Se encontraron proyectos Compose `plantclassifier` y `plantclassifier-lab`. Estos comandos usan **plantclassifier-lab**, el laboratorio existente; no cambies el nombre de proyecto si quieres reutilizar su volumen. No ejecutes `down -v`.

```bash
# Desde la raíz del repositorio. Solicita cuatro secretos técnicos nuevos.
bash scripts/setup-mqtt-secrets.sh
# No sobrescribir si estos archivos ya existen.
cp -n docker/mosquitto/mqtt.env.example .env.mqtt
cp -n ESP32/Movement/mqtt_config.h.example ESP32/Movement/mqtt_config.h
cp -n ESP32/PlantClassifier/mqtt_config.h.example ESP32/PlantClassifier/mqtt_config.h
chmod 600 .env.mqtt ESP32/Movement/mqtt_config.h ESP32/PlantClassifier/mqtt_config.h
```

Edita exclusivamente los tres archivos nuevos. Conserva `.env.lab` y ambos `wifi_config.h` sin cambios:

- `.env.mqtt`: `MQTT_BIND_ADDRESS` = dirección LAN de Ubuntu, `MQTT_PASSWORD` = secreto técnico backend; opcionales `MQTT_PORT=1883`, `MQTT_ACK_TIMEOUT=600ms`. La dirección por defecto 127.0.0.1 impide acceso LAN hasta configurarla explícitamente.
- Firmware: `MQTT_HOST` = la dirección LAN de Ubuntu, nunca `mosquitto`; puerto y contraseña técnica de cada placa. IDs distintos `plant-movement` y `plant-sensor`; usuarios `movement` y `sensor`. `MQTT_ENABLED=1`.
- Spring recibe `MQTT_URL=tcp://mosquitto:1883`, `MQTT_USERNAME=backend` y `DEVICE_TRANSPORT=mqtt` del override. Ningún secreto llega al navegador.
- No configurar port-forwarding en el router. El broker usa TCP sin TLS: usar LAN de laboratorio confiable y limitar acceso de red a las placas/host. La publicación Docker queda vinculada solo a la interfaz indicada.

```bash
docker compose -p plantclassifier-lab --env-file .env.lab --env-file .env.mqtt \
  -f docker-compose.yaml -f docker-compose.mqtt.yaml config --quiet
# Puede iniciarse el broker antes de cargar manualmente los sketches.
docker compose -p plantclassifier-lab --env-file .env.lab --env-file .env.mqtt \
  -f docker-compose.yaml -f docker-compose.mqtt.yaml up -d mosquitto
# Después de la configuración de firmware y validación con alimentación de actuadores desconectada:
docker compose -p plantclassifier-lab --env-file .env.lab --env-file .env.mqtt \
  -f docker-compose.yaml -f docker-compose.mqtt.yaml up -d --build db app mosquitto
docker compose -p plantclassifier-lab --env-file .env.lab --env-file .env.mqtt \
  -f docker-compose.yaml -f docker-compose.mqtt.yaml ps
```

Rollback, una vez restaurado firmware HTTP: `docker compose -p plantclassifier-lab --env-file .env.lab -f docker-compose.yaml up -d --build app`. No borra datos ni requiere detener PostgreSQL.

## Arduino IDE

- ESP32 #1: `ESP32/Movement/Movement.ino`.
- ESP32 #2: `ESP32/PlantClassifier/PlantClassifier.ino`.
- Instalar/copiar la biblioteca local `ESP32/libraries/PlantMqtt` al directorio de bibliotecas del sketchbook de Arduino IDE. Dependencias: ArduinoMqttClient 0.1.8, ArduinoJson 7, ESP32Servo, DHT sensor library y Adafruit Unified Sensor. Core ESP32 3.x, placa ESP32 clásica; compilación validada con el core instalado 3.3.11.
- No cambiar asignaciones de hardware, Wi-Fi, polaridad ni configuración de simulación por copiar los ejemplos MQTT. El script de compilación utiliza credenciales ficticias y nunca carga firmware. El sketch de sensores controla un servo físico: no ejecutarlo con alimentación de actuadores sin validación manual.

## Diagnósticos seguros de Ubuntu

```bash
python3 -m venv .venv-diagnostics
.venv-diagnostics/bin/pip install -r scripts/requirements-diagnostics.txt
# Fase inicial: broker aislado en loopback y placas simuladas, sin hardware.
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 DIAGNOSTIC_PYTHON="$PWD/.venv-diagnostics/bin/python" bash scripts/test-mqtt.sh
# Introducir valores técnicos sin escribirlos en argumentos de procesos ni historial.
read -rp 'IP LAN del broker: ' BROKER_LAN
read -rsp 'Contraseña técnica backend MQTT: ' MQTT_PASSWORD; echo
export MQTT_PASSWORD
.venv-diagnostics/bin/python scripts/diagnose-latency.py mqtt --host "$BROKER_LAN" --role movement --count 100 --output /tmp/mqtt-movement.json
.venv-diagnostics/bin/python scripts/diagnose-latency.py mqtt --host "$BROKER_LAN" --role sensor --count 100 --output /tmp/mqtt-sensor.json
unset MQTT_PASSWORD
# HTTP GET /status sigue disponible cuando no hay control MQTT activo.
read -rp 'IP de la ESP32: ' DEVICE_LAN
read -rsp 'DEVICE_TOKEN existente: ' DEVICE_TOKEN; echo
export DEVICE_TOKEN
python3 scripts/diagnose-latency.py http --host "$DEVICE_LAN" --count 100 --output /tmp/http-status.json
unset DEVICE_TOKEN
```

El diagnóstico de latencia solo envía GET /status (la suite test-mqtt.sh también prueba comandos exclusivamente en placas simuladas): no adquieren sesiones, no capturan/guardan muestras ni accionan nada. Entrega P50/P95/P99/máximo/pérdidas y errores en consola; el JSON añade muestras crudas, cambios de presencia y telemetría. Una conexión inicial rechazada por el broker también genera el informe de pérdidas y errores. `brokerRoundTripMs` en state mide eco iniciado por ESP32; la resta `ackMs-receivedMs` mide cola y handler en su reloj. El RTT del script también incluye cliente/broker/red/retorno. No permite inferir latencia unidireccional ni movimiento mecánico. Comparar HTTP y MQTT con misma placa, señal Wi-Fi, carga, número de muestras e intervalo; el GET es una referencia de transporte, no una comparación de actuación.

Para captura/BD/ML, habilita DEBUG en `com.codewithmosh.plantclassifier.service.SensorDataService` y en `com.codewithmosh.plantclassifier.mqtt.MqttDeviceTransport` (variables Spring `LOGGING_LEVEL_COM_CODEWITHMOSH_PLANTCLASSIFIER_SERVICE_SENSORDATASERVICE=DEBUG` y `LOGGING_LEVEL_COM_CODEWITHMOSH_PLANTCLASSIFIER_MQTT_MQTTDEVICETRANSPORT=DEBUG`). Agrega explícitamente esas variables al servicio app mediante un override local si se ejecuta en Docker. Procesa logs:

```bash
docker compose -p plantclassifier-lab logs --no-color app | python3 scripts/summarize-timings.py
```

Hay métricas `sensor-capture`, `postgres-save`, `ml`, `mqtt-ack`; incluyen operaciones fallidas cuando el temporizador está en finally. No se ha demostrado un cuello de botella de ML ni se ha cambiado el proceso/dataset. La interfaz conserva diagnósticos de adquisición, comando y STOP; servo conserva medidas `servo:<operación>:ack` en Performance API. Falta medir distribución real de pulsación/soltado y desplazamiento mecánico en el montaje.

## Capturas y móvil

Capturar durante servo activo permite caché fresca; cuando exige otra lectura, devuelve `capture-deferred` con explicación de que debe soltarse el control. DHT11 no se lee durante control activo. `sampleAgeMs` se valida (máximo 2000 ms) y se descuenta del timestamp persistido; no equivale a sincronización de relojes ni deduplicación de capturas. ADC fuera de rango falla, no se convierte artificialmente a pH 0/14. pH sigue marcado como potenciómetro/simulado.

`SOIL SAMPLES: 0` puede ser ausencia de valores calibrados, no humedad de suelo cero. Revisar `soilStatus`, `soilRaw`, alimentación/GND común, salida analógica en GPIO35 (no digital), rango 0–3.3 V y puntos seco/húmedo del archivo de calibración. Rail 0/4095, calibración ausente o puntos iguales producen lectura no utilizable. No se imputan datos. PostgreSQL guarda capturas válidas antes de ML; si falta suelo queda PENDING.

Android conserva dos pestañas y controles deshabilitados. Exportación/TypeScript no validan cookies nativas, CSRF, press-in/out, multitouch ni AppState. Esas comprobaciones y STOP/HOLD al salir/segundo plano siguen pendientes antes de habilitar botones.

## Pruebas reproducibles sin actuadores

```bash
npm test && npm run lint && npm run build
bash scripts/test-postgres.sh -B -Dfrontend.skip=true verify
bash scripts/test-firmware.sh
bash scripts/compile-firmware.sh  # ARDUINO_CLI=/ruta/arduino-cli si no está en PATH
DIAGNOSTIC_PYTHON="$PWD/.venv-diagnostics/bin/python" bash scripts/test-mqtt.sh
bash scripts/test-mosquitto-config.sh
npm run typecheck --prefix mobile && npm run export --prefix mobile
git diff --check
```

Los scripts de PostgreSQL/MQTT crean contenedores aislados en loopback; solo eliminan sus contenedores temporales. Firmware prueba handlers reales con I/O, tareas y colas mockeadas; integración usa broker real y placas simuladas, no HIL. MQTT comprueba ACK real frente a mera publicación, STOP pendiente, correlación, timeout, desconexión, retained y reinicio sin replay, además de los servicios de ambas placas.

Medición obtenida en una ejecución local del test `readOnlyLoopbackLatencySample`: 100 GET simulados, 0 pérdidas; P50 0.996 ms, P95 41.458 ms, P99 41.808 ms, máximo 43.151 ms. Es JVM ↔ Mosquitto Docker ↔ mock JVM en loopback; no demuestra mejora frente a HTTP ni representa Wi-Fi o mecánica. Cada ejecución imprime una nueva muestra.

Pendiente físicamente: jitter y tiempos LAN, apagado broker/Wi-Fi/backend con hardware alimentado de forma segura, consumo/stack FreeRTOS, alimentación MG996R, neutral y deadtime, calibración de suelo, fallos DHT y validación Android. No se ejecutaron pruebas de movimiento real.

## Cierre de verificación — 2026-11-11

- Maven: BUILD SUCCESS, 67 pruebas, 0 fallos, 0 errores, 9 omitidas (8 MQTT ejecutadas aparte; 1 benchmark HTTP opcional).
- Frontend: 108 pruebas, lint y build aprobados; Expo: TypeScript y exportación Android aprobados.
- Firmware: ambas placas compiladas en HTTP/MQTT; Movement también en rama hardware; mocks de prioridad, exclusividad, reconexión y watchdog aprobados. Sin carga física.
- Docker: imagen `plantclassifier:mqtt-validation` construida; Compose validado sin secretos reales. Smoke de esa imagen aprobado con dispositivos HTTP simulados, PostgreSQL temporal y ML real.
- PostgreSQL: 4 pruebas adicionales, 0 fallos/errores/omisiones.
- MQTT: 8 pruebas repetidas al validar el diagnóstico corregido, 0 fallos/errores/omisiones. Diagnósticos HTTP/MQTT y broker rechazando conexión aprobados.
- Última muestra loopback: 100 solicitudes, 0 pérdidas, P50 0.937 ms, P95 41.694 ms, P99 41.880 ms, máximo 42.323 ms. No son mediciones físicas.
- Configuración Mosquitto: healthcheck y rechazo anónimo aprobados en la verificación previa, con credenciales temporales.

No se repitieron compilaciones ni pruebas de frontend/Expo/firmware ya aprobadas porque sus fuentes no cambiaron en esta continuación. Las validaciones físicas y móviles indicadas arriba siguen pendientes.
