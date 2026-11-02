# PlantClassifier

PlantClassifier permite conducir un robot con W/A/S/D y consultar qué cultivo sugiere
un modelo a partir de temperatura, humedad y pH. La página se comunica con Spring Boot;
el servidor guarda las mediciones en PostgreSQL y ejecuta Python para predecir.

Hay **dos ESP32 independientes**:

- **Sensores:** DHT11 para temperatura/humedad ambiental, suelo analógico y potenciómetro para simular pH.
  El potenciómetro no mide pH químico. La interfaz y la base de datos conservan ese origen.
- **Movimiento:** recibe comandos HTTP autenticados. Por defecto solo los imprime en
  Serial Monitor; activar el TB6612FNG y el servo requiere revisar el hardware.

```mermaid
flowchart TD
    UI[Navegador: React + TypeScript + Tailwind] -->|Sesión y CSRF| API[Spring Boot / Java 21]
    API -->|HTTP y token| SENSOR[ESP32 sensores: DHT11, suelo y potenciómetro]
    API -->|HTTP y token| MOTOR[ESP32 movimiento: simulación por defecto]
    API -->|JPA y Flyway| DB[(PostgreSQL persistente)]
    API -->|Proceso con timeout| ML[Python / Random Forest]
    MOTOR --> SERIAL[Serial Monitor / actuadores opcionales]
```

## Iniciar la aplicación

Necesitas Docker con Compose. Desde la raíz, copia `.env.example` a `.env` **solo si
no existe**, configura credenciales privadas y las dos direcciones ESP32. No uses los
valores `REPLACE_`. `DEVICE_TOKEN` necesita al menos 32 caracteres; el token debe coincidir en Spring y ambos ESP32. Puedes generar valores
independientes con `openssl rand -hex 32`.

```bash
test -f .env || cp .env.example .env
# Editar .env antes de continuar.
docker compose up -d --build --wait
```

Abre `http://127.0.0.1:18080`: el dashboard permite usar **Capture Data** y W/A/S/D
directamente, sin login. Compose publica exclusivamente en `127.0.0.1`.
Si ya tienes datos, conserva el mismo nombre de proyecto Compose y volumen. Para una
base anterior a Flyway, sigue [MIGRATIONS](docs/MIGRATIONS.md) antes de arrancar.
Nunca necesitas borrar volúmenes para ejecutar esta guía.

## Simulación sin placas

Con el mismo `.env`, este único overlay sustituye las dos placas por dos servidores
Python separados. Mantiene Spring, PostgreSQL y el modelo real:

```bash
docker compose -f docker-compose.yaml -f docker-compose.simulation.yaml up -d --build --wait
docker compose -f docker-compose.yaml -f docker-compose.simulation.yaml logs -f simulator
```

Las mediciones aparecen como simuladas por software. Para volver a las placas,
ejecuta el comando normal de arranque. USB sirve para alimentar, cargar firmware y
observar Serial; los comandos siguen viajando por Wi-Fi/HTTP.

## Cómo funciona

**Movimiento:** una tecla determina la dirección; la última pulsada tiene prioridad.
El frontend adquiere control si hace falta, envía un comando y espera su confirmación.
Los cambios de dirección pendientes se reducen al más reciente. Soltar todas las teclas,
perder foco o pulsar STOP envía STOP inmediatamente. Un error cancela el movimiento;
hay que soltar y volver a pulsar. LEFT/RIGHT orientan el servo y detienen la propulsión.

**Captura:** consultar ESP32 → validar valores y origen → guardar medición → ejecutar
Python → guardar predicción → devolver resultado. Si falla ML, la medición permanece
con estado `FAILED`; si falla el último guardado, queda `PENDING` para diagnóstico.
La última medición se consulta directamente en la base de datos.

| Clase o archivo principal | Responsabilidad |
|---|---|
| `PlantClassifierApplication` | Arrancar Spring Boot |
| `SecurityConfig`, `DeviceClients` | CSRF y conexiones autenticadas con límites de tiempo |
| `SessionController` | Token CSRF vinculado a la sesión HTTP anónima |
| `MovementController`, `SensorDataController` | Recibir solicitudes HTTP válidas |
| `MovementService` | Propietario del control, secuencias, vencimiento y confirmaciones |
| `SensorDataService` | Captura, validación, persistencia y predicción |
| `MLService` | Ejecutar Python con timeout, salida limitada y limpieza de procesos |
| `DeviceResponse`, `GlobalExceptionHandler`, `SystemFailure` | Validar respuestas y comunicar errores seguros |
| `SensorData`, `SensorDataRepository` | Entidad JPA y consulta de la última medición |
| `MovementRequestDTO`, `MovementAck`, `CaptureResponse` | Contratos de comunicación sin exponer la entidad |
| `frontend/src/movement/`, `frontend/src/hooks/`, `frontend/src/components/` | Máquina de estados, hooks React y dashboard |
| `Movement.ino` y sus headers | `setup`: Wi-Fi/hardware; `handleMovement`: comando; `motorDrive`: motor; `robotStop`: STOP; `loop`: seguridad |
| `PlantClassifier.ino` y sus headers | Leer DHT/suelo/potenciómetro y servir `/capture` y `/status` |
| `predict.py`, `features.py`, `train.py` | Inferencia, orden de variables y evaluación reproducible |

## Seguridad y límites

Uso exclusivamente local y supervisado: cualquier usuario o proceso con acceso a esta
computadora puede operar el robot y capturar datos. No publiques la aplicación en la LAN
ni Internet, tampoco mediante túneles o proxies. CSRF no sustituye el control de acceso.

Se conservan CSRF, token privado del dispositivo, secuencias crecientes y sesiones
que STOP invalida. Un FORWARD retrasado no puede reactivar esa sesión. También se
conservan watchdog de 1500 ms, STOP al perder Wi-Fi, interbloqueo de inversión y límites
de comunicación. Una confirmación acredita aceptación del comando, **no movimiento físico**.
HTTP del ESP32 requiere una red aislada de confianza; no publiques sus puertos.

No se han validado físicamente el cableado, las fuentes, el recorrido del servo, la
inversión/parada del motor ni el watchdog bajo fallos reales de radio. Usa ruedas
levantadas y desconexión física de emergencia. Lee [la guía física](docs/REAL_HARDWARE_SETUP.md)
antes de conectar actuadores y [SECURITY](docs/SECURITY.md) para credenciales y despliegue.

El modelo experimental `synthetic-five-crops-v2` usa cuatro variables y recomienda únicamente frijol, tomate,
sandía, melón o lechuga. Se entrenó con 8800 de 11000 ejemplos sintéticos; `evaluation.json`
evalúa las 2200 filas reservadas. Usa 200 árboles y hojas de al menos 5 muestras.
Se abstiene fuera de los rangos de entrenamiento y conserva la lectura como `OUT_OF_DOMAIN`.
No demuestra precisión de campo ni sustituye una medición real de pH.
Consulta el [diagnóstico de suelo, probabilidades y comparación v1/v2](docs/SOIL_INFLUENCE_DIAGNOSIS.md).

Consulta [SETUP](docs/SETUP.md) para IntelliJ, firmware USB y pruebas, y
[CONTROL_PROTOCOL](docs/CONTROL_PROTOCOL.md) para el contrato HTTP y las carreras con STOP.

## Humedad del suelo

El ESP32 de sensores conserva temperatura y humedad ambiental DHT11, pH de demostración
y añade suelo analógico en GPIO35. Sin calibración devuelve `null`; las otras lecturas
se guardan normalmente. V4 añade columnas opcionales sin alterar mediciones antiguas.
El Random Forest usa **temperature, humidity, ph, soilMoisture**. Sin suelo válido la
medición se guarda, pero la recomendación queda pendiente. V6 identifica el modelo de
cada predicción nueva para distinguirla de los resultados históricos.
Consulta [calibración e investigación de datos](docs/SETUP.md#humedad-del-suelo-y-modelo).


### Dashboard React

La interfaz única vive en `frontend/` (React + TypeScript + Vite + Tailwind).
`npm ci` instala el workspace. `npm run dev` abre Vite en `http://127.0.0.1:5173`
y envía `/csrf`, `/sensors` y `/movement` al backend en `http://127.0.0.1:18080`.
Usa `PLANT_BACKEND_URL` para cambiar únicamente el proxy de desarrollo.

`npm run typecheck`, `npm run lint`, `npm test` y `npm run build` verifican el frontend.
Maven ejecuta el build en `generate-resources` y empaqueta los assets en el JAR.
Docker compila Vite en una etapa Node; producción ejecuta únicamente Spring y Python.
No se versionan los assets generados. Detalles y validación: [migración React](docs/REACT_MIGRATION.md).
