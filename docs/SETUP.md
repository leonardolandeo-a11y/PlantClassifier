# Configuración y pruebas

## Aplicación y base de datos

El [README](../README.md) contiene los dos comandos de arranque: normal y simulación.
Ejecuta siempre desde la raíz. Compose lee `.env`; Spring/IntelliJ no lo carga por sí solo.
Mantén el nombre de proyecto usado para tus datos: por ejemplo, si ya utilizabas
`-p plantclassifier-lab --env-file .env.lab`, conserva esas opciones en todos los comandos.
No cambies `plantclassifier_postgres_data` ni ejecutes `down -v`.
Las credenciales nuevas de `.env` no cambian las de un PostgreSQL ya inicializado.

| Variables | Uso |
|---|---|
| `POSTGRES_DB/USER/PASSWORD` | Inicialización de PostgreSQL en Compose |
| `SPRING_DATASOURCE_URL/USERNAME/PASSWORD` | JVM nativa; URL habitual `jdbc:postgresql://127.0.0.1:5433/plantclassifier` |
| `DEVICE_TOKEN` | Secreto compartido con las dos placas, ≥32 caracteres |
| `ESP32_URL` | Origen HTTP(S) del ESP32 de sensores |
| `MOVEMENT_ESP32_URL` | Origen distinto del ESP32 de movimiento |
| `APP_PORT`, `POSTGRES_PORT` | Puertos Compose, por defecto `127.0.0.1:18080` y `127.0.0.1:5433` |
| `ML_PYTHON_PATH` | Python del entorno virtual; Compose lo configura automáticamente |
| `ML_SCRIPT_PATH`, `ML_WORKING_DIRECTORY` | `predict.py`, `MLClassification` |
| `ML_TIMEOUT` | 30 s; incluye proceso y lectura de salida |
| `ESP32_CONNECT_TIMEOUT/READ_TIMEOUT` | Sensores: 2 s / 5 s |
| `MOVEMENT_CONNECT_TIMEOUT/READ_TIMEOUT` | Movimiento: 300 ms / 500 ms |
| `SESSION_COOKIE_SECURE` | `true` con HTTPS, `false` para la demostración HTTP local |

Abre `http://127.0.0.1:18080` sin login. Solo se admite uso local y supervisado;
cualquier usuario o proceso local puede controlar el robot. No expongas la aplicación
a la LAN, Internet, túneles o proxies. Compose fija la publicación a `127.0.0.1`;
`APP_PORT` permite conservar un puerto local existente. Las antiguas variables de operador
no se utilizan; no es necesario editar `.env` ni `.env.lab`. La sesión HTTP anónima
identifica al controlador y mantiene CSRF; no contiene el token privado del ESP32.

Las URLs no admiten usuario, contraseña, ruta, query ni fragmento. No uses la misma
placa para ambos roles. Dentro de Docker, localhost identifica el contenedor.
La simulación configura automáticamente dos URLs internas; expone movimiento en
`127.0.0.1:18081` y sensores en `127.0.0.1:18082`.

## IntelliJ o JVM nativa

Requisitos: Java 21, Node 24, Python 3.12+ y Docker para PostgreSQL.

```bash
docker compose up -d db
python3 -m venv .venv
.venv/bin/pip install -r MLClassification/requirements.txt
npm ci
npm run build
```

Abre `pom.xml`, elige JDK 21 y la raíz del repositorio como directorio de trabajo.
Configura las variables anteriores en IntelliJ, en particular los tres valores
`SPRING_DATASOURCE_*` y la ruta absoluta `.venv/bin/python` en `ML_PYTHON_PATH`.
Arranca `PlantClassifierApplication`; desde un terminal con esas variables también
puedes ejecutar `./mvnw spring-boot:run`. La JVM nativa escucha en `127.0.0.1:8080`;
configura `SERVER_PORT=18080` para usar la misma URL local. Mantén `SERVER_ADDRESS=127.0.0.1`.
`npm run watch` recompila TypeScript y CSS durante el desarrollo y cierra ambos procesos.
Después de cambiar el frontend, guarda también los JS/CSS generados con `npm run build`.

## Dos placas independientes

Sensores ejecuta `ESP32/PlantClassifier/PlantClassifier.ino`: solo `GET /status` y
`GET /capture`. Movimiento ejecuta `ESP32/Movement/Movement.ino`: `GET /status`,
`POST /control-session` y `POST /movement`. Todas requieren `X-Device-Token`.
`ENABLE_SELFTEST_ENDPOINT=0` mantiene deshabilitado el diagnóstico físico opcional.

## Sensor wiring and input contract

This code targets **classic ESP32**, compiled as `esp32:esp32:esp32`. This is not proof
of the attached board's identity: inspect its module marking and schematic before wiring.
Other ESP32 families deliberately fail the compile-time target guard.

| Connection | Sensor ESP32 |
|---|---|
| DHT11 DATA | GPIO 22 |
| DHT11 VCC / GND | compatible 3.3 V supply / GND |
| DHT11 DATA pull-up | 10 kΩ to 3.3 V if not already present on module |
| Potentiometer outer terminal | compatible 3.3 V reference |
| Potentiometer other outer terminal | GND |
| Potentiometer wiper | GPIO 34 |

GPIO34 is input-only ADC1 channel 6 on the classic ESP32, usable alongside WiFi.
The sketch explicitly configures 12-bit acquisition (0–4095) and `ADC_11db` attenuation.
Espressif documents an approximate 150–3100 mV measurement range at this attenuation;
3.3 V can saturate the ADC. Attenuation does **not** grant permission to exceed GPIO
voltage ratings. Use only the verified board's 3.3 V domain, never 5 V on DATA or ADC,
and never exceed that board's rated input voltage. Avoid feeding inputs on an unpowered board.
Exact board identity, supply voltage, and wiring have not been physically verified.
See [Espressif ADC API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html)
and [ESP32 datasheet](https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf).

The physical acquisition path averages eight bounded ADC samples and maps their mean
linearly to 0–14. This is **pH (potentiometer simulation)**, not calibrated chemical pH.
ADC nonlinearity and rail saturation are acceptable for this demonstration, not for a probe.
DHT11 temperature and humidity must be finite and within 0–50 °C and 20–80% RH,
respectively ([Adafruit specifications](https://www.adafruit.com/product/386)).
The firmware samples at most once per 2000 ms, returning the cached sample inside that
interval with `sampleAgeMs`. A failed sample returns HTTP 503 throughout the interval;
it never substitutes synthetic values or returns an older successful sample after failure.

Example response (numbers are illustrative, not measurements from your board):

```json
{
  "temperature": 25.0,
  "humidity": 60.0,
  "ph": 6.502564,
  "temperatureSource": "dht11",
  "humiditySource": "dht11",
  "phSource": "potentiometer",
  "simulated": true,
  "sampleAgeMs": 0
}
```

`simulated=true` indicates the demonstration environmental quantity. It does not imply
that DHT readings are synthetic. Sources persist in additive Flyway migration V3;
legacy rows retain null/unknown sources. The dashboard spells out the potentiometer label.

## Firmware, USB y Serial Monitor

Instala Arduino CLI y estas versiones de las dependencias:

```bash
arduino-cli core update-index --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core install esp32:esp32@3.3.11 --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli lib install 'ArduinoJson@7.4.2' 'ESP32Servo@3.2.1' 'DHT sensor library@1.4.7' 'Adafruit Unified Sensor@1.1.15'
scripts/compile-firmware.sh
```

El script usa credenciales ficticias temporales; compila sensores, movimiento simulado y
la rama física, sin cargar nada a una placa. No demuestra funcionamiento físico.
Para preparar una placa, copia su `wifi_config.example.h` a `wifi_config.h` solo si
no existe y configura Wi-Fi/token privadamente. Mantén `SIMULATION_MODE=1` y
`ENABLE_SELFTEST_ENDPOINT=0` en movimiento. Sensores siempre usa DHT11 y potenciómetro:
las antiguas macros de simulación de sensores no tienen efecto.

Identifica físicamente ambas placas y sus puertos; no deduzcas el modelo del adaptador
USB-UART. Mantén los actuadores desconectados. Tras revisar placa y configuración,
compila/carga cada sketch a su placa correspondiente:

```bash
arduino-cli board list
# Valores de ejemplo: sustituir por placa/puerto identificados.
export FQBN=esp32:esp32:esp32
export PORT=/dev/serial/by-id/REPLACE_WITH_IDENTIFIED_BOARD
export SKETCH=ESP32/Movement  # Para la otra placa: ESP32/PlantClassifier
arduino-cli compile --fqbn "$FQBN" --build-path /tmp/plant-usb "$SKETCH"
arduino-cli upload --fqbn "$FQBN" --port "$PORT" --input-dir /tmp/plant-usb "$SKETCH"
arduino-cli monitor --port "$PORT" --config baudrate=115200
```

Usa solo el resultado de una compilación recién completada; no subas una compilación
anterior si la nueva falla. Lee cada IP del Serial Monitor y asigna su URL en `.env`.
USB no transporta los comandos HTTP: el ordenador y Docker necesitan acceso Wi-Fi.
Movimiento debe informar `mode=simulation` y `hardwareOutputEnabled=false`.
Sensores debe informar `role=sensor`, `dht11` y `potentiometer` como fuentes.

Para probar la placa conectada por USB (o un simulador), toma la IP observada:

```bash
node scripts/with-lab-env.mjs .env python3 scripts/test-device.py --url http://IP_OBSERVADA
```

El script rechaza movimiento si `/status` no confirma simulación. No ejecutes suites
automáticas contra actuadores activos. Correlaciona W/A/S/D y STOP con Serial Monitor.
El ESP32 de sensores requiere DHT y potenciómetro conectados; sin sensores usa el overlay.
La guía [REAL_HARDWARE_SETUP](REAL_HARDWARE_SETUP.md) conserva el cableado, frecuencias,
fuentes, calibración y procedimiento gradual para el robot físico.

## Verificación de software

Las comprobaciones habituales son `npm test`, `./mvnw verify` y
`scripts/test-firmware.sh`; CI ejecuta además todas las integraciones siguientes:

```bash
./mvnw verify
scripts/test-postgres.sh
npm run typecheck
npm test
npm run build
scripts/test-firmware.sh
python3 scripts/test-simulator.py
.venv/bin/python -m unittest discover -s MLClassification -p 'test_*.py'
python3 scripts/check-secrets.py
docker compose --env-file .env.example config --quiet
docker build -t plantclassifier:reliability .
python3 scripts/smoke-docker.py
```

`test-firmware.sh` requiere g++ y ArduinoJson 7.4.2 instalado como arriba, o
`ARDUINOJSON_INCLUDE` apuntando a su directorio `src`. CI instala esa versión antes de
compilar: no omite pruebas cuando falta la biblioteca. El script incluye secuencias,
STOP, watchdog, actuadores con mocks, roles separados y el sketch de sensores con
ArduinoJson real. No sustituye la compilación Arduino ni la verificación física.

Maven normal omite las pruebas PostgreSQL si no se configuran sus variables de prueba.
`test-postgres.sh` crea su propio contenedor desechable, sin volúmenes de usuario;
`test-postgres.sh -B verify` ejecuta toda la suite contra ese entorno aislado.
`test-simulator.py` reutiliza `test-device.py` para probar ambos roles; no hay dos
implementaciones del protocolo de prueba. `smoke-docker.py` prueba sesión anónima/CSRF → Spring →
dos simuladores → PostgreSQL → Python/modelo real, usando contenedores desechables.

Se conserva Playwright porque los tests del controlador no prueban el cableado real
de eventos DOM, acceso sin login, blur y peticiones retrasadas. Es una verificación adicional,
fuera del workflow principal. Con el overlay ya iniciado:

```bash
npx playwright install chromium  # O usar CHROME_PATH con Chrome ya instalado.
PLANT_BASE_URL=http://127.0.0.1:18080 PLANT_DEVICE_URL=http://127.0.0.1:18081 \
  node scripts/with-lab-env.mjs .env npm run test:e2e
```

Debe apuntar al simulador de movimiento configurado realmente en Spring. Esta prueba
crea una medición simulada. Ejecuta las pruebas de dispositivo y navegador por separado:
ambas adquieren control y se invalidarían entre sí. `with-lab-env.mjs` carga variables
sin ejecutar el archivo ni imprimir secretos; por eso se conserva.

## Diagnóstico y ML

- 403 del dashboard: recargar la página para renovar CSRF tras la expiración de sesión.
- 409: sesión vencida, parada o reemplazada; soltar y pulsar de nuevo.
- 502/504: comprobar ambas IP, red y token; STOP sin confirmación sigue siendo incierto.
- Sensor 503: revisar DHT11, GPIO22 y pull-up; esperar al menos 2 s entre muestras.
  Un fallo no se sustituye por lecturas ficticias ni por una muestra antigua válida.
- pH fijo en un extremo: revisar potenciómetro, GPIO34 y masa; no subir tensión para
  compensar la saturación del ADC.
- ML fallido: revisar Python, dependencias, modelo y directorio; la medición se conserva.
- Flyway o credenciales PostgreSQL: seguir [MIGRATIONS](MIGRATIONS.md), sin borrar datos.

```bash
.venv/bin/python MLClassification/predict.py 25 60 7
.venv/bin/python MLClassification/train.py --report /tmp/evaluation.json
```

El orden es temperatura, humedad, pH. No sobrescribas `model.pkl`; solo carga modelos
confiables. El informe de evaluación describe una partición 80/20 con semilla 42,
no una validación de campo del modelo desplegado. Las pruebas físicas pendientes son
identidad/cableado de placas, DHT real, potenciómetro, alimentación, servo/motor,
coast-down y parada ante pérdida real de comunicación.
