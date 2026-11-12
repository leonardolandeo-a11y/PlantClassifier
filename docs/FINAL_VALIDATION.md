# Validación integral local

Trabajo sobre `main` desde `cf32f97`, conservando los cambios locales de la sesión anterior. Sin commit, push, PR,
modificación de credenciales, carga de firmware ni actuación física. Los contenedores
de pruebas usan nombres únicos, loopback y PostgreSQL desechable. No se tocaron los
volúmenes del laboratorio. Modelo y dataset permanecen iguales.

## Cambios

- E2E/benchmark navegan entre Datos y Movimiento y validan ambos ejes. Expectativas
  adaptadas al texto actual; observación de cambios de texto corregida en benchmark.
- R breve conserva CENTER. El firmware confirma `holding` al renovar CENTER ya en
  100°. HOLD, blur, visibilidad, salida de pestaña y desmontaje cancelan el control.
- Cola urgente: conserva la parada pendiente; saturación invalida control y colas
  desde el loop. Sin ACK ficticio ni ampliación de watchdogs.
- MQTT: presupuestos separados para actuación, seguridad, adquisición, estado y
  captura; ACK exige presencia vigente y nonce coincidente. Recursos acotados.
- V7: nonce/secuencia de muestra, índice único, recepción separada de adquisición
  estimada, política de repetición devuelve la fila existente. Captura persiste antes
  de ML. PENDING tiene diagnóstico (`ml-not-completed` o `soil-*`).
- Worker Python persistente: una inferencia admitida, sin cola ilimitada; conserva
  contrato de cuatro variables, versión de modelo, abstención, timeout y reinicio
  en siguiente petición. `ML_PERSISTENT=false` restaura proceso por inferencia.
- Expo comparte control web, cookies/CSRF y tiene controles bajo habilitación de
  laboratorio. Cancela/deshabilita al salir, background/inactive y blur; no reanuda.
- Docker publica web en loopback por defecto; LAN requiere `APP_BIND_ADDRESS`.
- CI incorpora MQTT, Mosquitto, Expo y compilación Arduino sin carga. Estado remoto
  pendiente: no se hizo push.

## Correcciones de esta continuación

- HOLD fallido ya no permite enviar una dirección de servo que quedó pendiente.
- El apagado de Spring se coordina con el arranque del worker: no puede crear un
  proceso nuevo después del cierre; procesos vencidos se terminan y recogen.
- El protocolo Python limita también la entrada y rechaza líneas truncadas o grandes.
- MQTT conserva su cupo hasta terminar publicación y respuesta, incluso cuando el
  ACK vence primero. Una publicación completada nunca equivale a ejecución.
- Expo deshabilita la referencia de control inmediatamente en background/blur,
  antes del desmontaje React, para rechazar eventos nativos tardíos.
- La prueba de heartbeat cuenta exclusivamente los ACK de la fase mantenida; antes
  podía contar órdenes anteriores y ocultar una interrupción hasta soltar la tecla.
- El simulador MQTT y E2E permiten probar caída/reinicio del broker, pérdida de Wi-Fi,
  retardo de despacho y bloqueo del renderer con infraestructura temporal aislada.
- Se añadieron regresiones de saturación real de colas, captura duplicada concurrente,
  rollback Flyway, cierre del worker y cancelación móvil durante adquisición.

El fallo MQTT histórico no tenía trazas suficientes para atribuir su causa exacta.
Se reprodujo determinísticamente el mecanismo de ausencia de heartbeat durante más
que el watchdog: expira la sesión y una parada posterior no puede confirmarse como
orden de esa sesión. Se verifica STOP lógico independiente y ninguna reanudación;
no se aumentaron watchdogs ni timeouts para conseguir el aprobado. Las nuevas pruebas
registran ACK por fase y retraso del scheduler sin registrar tokens.

## Suites y evidencia

Validación cerrada el **12 de noviembre de 2026**. Resultados del código final,
no inferidos de ejecuciones históricas. Imagen comprobada:
`plantclassifier:final-validation`, SHA256
`2456785f309fc1f33df3f7a0c9409acc574b3de6afb5848bb19a79f4e3dbca80`.

| Suite | Resultado |
| --- | --- |
| Web TypeScript, ESLint, Vitest, build | Aprobados; **114 tests** |
| `./mvnw -B verify` | **81 registrados**, 0 fallos/errores; 19 omitidos por sus condiciones de integración |
| PostgreSQL temporal/Flyway | **7 tests**, 0 omitidos; V1–V7, históricos, duplicado concurrente y rollback de migración fallida |
| MQTT con broker real y placas simuladas | **11 tests**, 0 omitidos; incluye correlación, desconexión, prioridad y latencia |
| Benchmark HTTP Java | **1 test**, aprobado; completa los 19 casos separados de Maven |
| Firmware host | **10 grupos** aprobados: handlers reales con mocks, watchdogs, colas, sensores y actuadores |
| Arduino CLI/core 3.3.11 | **6 compilaciones**: Movement HTTP/MQTT simulado, sensores HTTP/MQTT, Movement HTTP/MQTT hardware; ninguna carga |
| Python ML | **9 tests**; modelo real, protocolo worker, validación y recuperación |
| Worker Java | **12 tests** dentro de Maven; incluye cierre durante inferencia y prevención de reinicio |
| Expo | TypeScript, **8 tests** con mocks y exportación Android aprobados |
| Mosquitto | Configuración real, autenticación técnica, healthcheck, rechazo anónimo y permisos `600:1883` aprobados |
| Docker | Build, Compose base/MQTT, smoke con PostgreSQL temporal y ML real aprobados |
| Secretos, simulador, formato | Comprobación de secretos, protocolo de ambos simuladores y `git diff --check` aprobados |

**Siete ejecuciones E2E finales, siete PASS y cero reintentos:** `http-1`, `http-2`,
`mqtt-1`, `mqtt-2`, `mqtt-3`, `mqtt-load-1`, `mqtt-load-2`.
Cada ejecución crea infraestructura propia. Las dos últimas añaden 150 ms al despacho
normal y bloquean Chromium 2200 ms; verifican expiración, STOP lógico y ausencia de
reanudación. MQTT prueba reinicio del broker; ambas rutas prueban pérdida/recuperación
de Wi-Fi simulada. Incluyen persistencia y reinicio del backend, Datos/Movimiento,
CENTER/HOLD, combinaciones y layouts de 320/390/1440 px. En las fases nominales se
observaron 13 heartbeats confirmados, con intervalo máximo aproximado de 251–252 ms.
[Resultado de los siete casos](validation/browser-runs.json).

El smoke congeló exclusivamente el worker hijo de Spring del contenedor temporal:
la medición persistió, FORWARD/STOP simulados respondieron mientras ML seguía bloqueado,
el timeout devolvió `FAILED/ml-timeout`, la siguiente captura obtuvo predicción y
el proceso antiguo fue recogido. El cierre concurrente de Spring se verifica además
en la prueba Java del ciclo de vida; no se simula como una validación de hardware.

La última batería completa se ejecutó después del cambio de capacidad Paho. Después
solo cambiaron documentación, validación Compose en CI y provisión/prueba de permisos
Mosquitto; estos scripts se verificaron de nuevo sin reconstruir firmware ni repetir
los siete E2E innecesariamente.

### Latencias medidas

Milisegundos; Linux/Docker local con modelo real y dispositivos simulados.

| Medición | n | P50 | P95 | P99 | Máximo | Fallos |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MQTT GET JVM ↔ broker ↔ mock JVM | 100 | 0.449 | 0.771 | 3.414 | 42.175 | 0 |
| Worker Python caliente | 100 | 12.004 | 22.381 | 22.790 | 23.701 | 0 |
| Python nuevo: total inicio/importación/carga/inferencia/salida | 20 | 985.869 | 1188.917 | 1203.499 | 1203.499 | 0 |
| Navegador HTTP: pulsar W → confirmación | 100 | 15.6 | 17.8 | 26.8 | 56.9 | 0 |
| Navegador HTTP: soltar → STOP confirmado | 700 | 3.6 | 5.5 | 7.2 | 56.0 | 0 |

Worker: primer arranque **812.542 ms**. Procesos nuevos: mediana intérprete/salida
7.606 ms; importaciones 214.075 ms; carga 593.487 ms (incluye importaciones diferidas
de sklearn); inferencia 28.514 ms. RSS máximo observado: **186536 KiB**; es una
medición de los procesos nuevos, no un límite garantizado de memoria.
[Datos ML](validation/ml-local.json), [datos MQTT](validation/mqtt-local.json),
[datos navegador](validation/browser-http-local.json).
Los percentiles empíricos no garantizan límites en campo. Las rutas MQTT GET y
navegador HTTP son distintas: no permiten atribuir una mejora porcentual de transporte.
No se midieron por separado latencias unidireccionales broker/ESP32, DHT11/ADC físicos,
Wi-Fi ni tiempo mecánico; no se inventan esos resultados.

### Incidencias y límites de la evidencia

- El fallo histórico MQTT permanece sin atribución exacta por falta de trazas; las
  siete ejecuciones finales no lo reprodujeron. Se cubre el mecanismo de pausa de
  renderer con una regresión determinista, sin afirmar que prueba la causa histórica.
- Una ejecución anterior del script Arduino falló por editarlo mientras bash lo
  ejecutaba (`unexpected EOF`); después se completó una ejecución íntegra de las seis
  variantes. No se contó la ejecución interrumpida como aprobada.
- La primera prueba de permisos detectó archivos temporales `0644`. La provisión de
  archivos nuevos y los fixtures usan ahora `0600`, propietario 1883 y umask `077`.
  La comprobación final aprobó; no se alteraron secretos existentes. La ACL pública
  no contiene contraseñas y puede conservar un aviso de lectura global propio.
- CI remoto **pendiente**: workflow actualizado, sin commit/push ni ejecución remota
  atribuida a estos cambios. Los controles móviles siguen bajo habilitación explícita.
- Sin datos reales de campo no se valida precisión agronómica. PENDING interrumpido
  conserva diagnóstico, pero no hay reclasificación automática; firmware antiguo sin
  identidad no permite deduplicar muestras físicas (véase [migraciones](MIGRATIONS.md)).

No quedan fallos de severidad alta reproducidos sin resolver en las suites ejecutadas.
Esto es un cierre de verificación de software con simuladores, no una certificación
física ni una garantía de ausencia de cualquier defecto.

## Arranque manual

Conserva el nombre de proyecto y los archivos privados del laboratorio existente.
No ejecutes `down -v`. Si ya utilizas `plantclassifier-lab` y sus archivos configurados:

```bash
docker compose -p plantclassifier-lab --env-file .env.lab --env-file .env.mqtt \
  -f docker-compose.yaml -f docker-compose.mqtt.yaml config --quiet
docker compose -p plantclassifier-lab --env-file .env.lab --env-file .env.mqtt \
  -f docker-compose.yaml -f docker-compose.mqtt.yaml up -d --build --wait
npm start --prefix mobile
```

Si faltan secretos MQTT, sigue [guía MQTT](MQTT_MIGRATION.md); no copies encima de
archivos existentes. El Compose base mantiene rollback HTTP, que requiere firmware
HTTP y actuadores desenergizados durante el cambio:

```bash
docker compose -p plantclassifier-lab --env-file .env.lab \
  -f docker-compose.yaml up -d --build --wait
```

`/` con HTTP 200 solo verifica servicio web. Comprueba separadamente PostgreSQL
healthy, app healthy, broker healthy, presencia MQTT vigente de `movement` y `sensor`
y los diagnósticos de ambas placas. `scripts/diagnose-latency.py` usa GET de solo
lectura; los benchmarks de actuación verifican simulación antes de empezar.

## Carga manual y validación física pendiente

En Arduino IDE, selecciona una ESP32 clásica y el puerto correcto de **cada placa**.
Instala core 3.3.11, ArduinoJson 7.4.3, ArduinoMqttClient 0.1.8, ESP32Servo 3.2.1,
DHT 1.4.7, Adafruit Unified Sensor 1.1.15 y la biblioteca local `ESP32/libraries/PlantMqtt`.
Conserva los `wifi_config.h`/`mqtt_config.h` privados, GPIO, polaridad y calibración.
Compila y carga manualmente `ESP32/Movement/Movement.ino` en movimiento y
`ESP32/PlantClassifier/PlantClassifier.ino` en sensores. No intercambies sketches.
El script `compile-firmware.sh` nunca carga placas.

Primero desconecta alimentación de motor y servos; comprueba las salidas/Serial,
STOP/HOLD, pérdida Wi-Fi/broker, reinicios y ausencia de reanudación. Después, bajo
supervisión y con corte eléctrico accesible, verifica PWM/STBY y dirección con el
carro elevado; solo entonces prueba movimiento breve. Repite release, combinaciones,
CENTER/HOLD, cambio de pestaña y desconexión. Confirma cookies/CSRF, multitouch,
background, bloqueo de pantalla y pérdida de red en Android real antes de habilitar
actuadores desde móvil. Una variable STOP o un ACK no demuestran detención mecánica.

Pendientes físicos: calibración seco/húmedo GPIO35, DHT11 bajo carga, límites/neutro
MG996R, inversión y frenado, alimentación, caída de Wi-Fi y latencias LAN P95/P99.
El pH por potenciómetro sigue siendo simulado. Random Forest usa cuatro variables,
cinco cultivos y datos sintéticos: la evaluación de interpolación no valida exactitud
agronómica ni confianza científica en campo.

## Reproducir la validación aislada

Después de instalar las dependencias de [SETUP](SETUP.md) y los requirements de
`scripts/requirements-diagnostics.txt` en `.venv-diagnostics`:

```bash
docker build -t plantclassifier:final-validation .
PLANT_TEST_IMAGE=plantclassifier:final-validation python3 scripts/smoke-docker.py
CHROME_PATH=/opt/google/chrome/chrome \
  DIAGNOSTIC_PYTHON="$PWD/.venv-diagnostics/bin/python" \
  PLANT_TEST_IMAGE=plantclassifier:final-validation python3 scripts/test-browser-repeat.py
```

Si se usa Chromium de Playwright, ejecuta `npx playwright install chromium` y usa
`CHROME_PATH=""`. Las pruebas no leen `.env.lab` ni `.env.mqtt`. El broker E2E anónimo
solo existe en la red temporal publicada en loopback; la prueba independiente de
Mosquitto comprueba la configuración autenticada real del proyecto.

## Inventario y Git

[Estado completo de archivos](validation/git-status.txt). Incluye los cambios de
ambas sesiones: transporte, worker, identidad de muestras, React/Expo, firmware,
regresiones, CI y documentación. `main` conserva `cf32f97` como HEAD; no se crearon
commits, ramas ni PR. Modelo, dataset, configuraciones privadas y volúmenes reales
no se modificaron. No quedan contenedores temporales de esta validación activos.
