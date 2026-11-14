# PlantClassifier

## Arrancar la demo web

Demo web autónoma: solo Docker con Compose **2.24.4 o posterior** y navegador
(Git para clonar). La primera descarga/construcción puede tardar más de dos minutos.
No necesitas Node, Java, Python, ESP32, MQTT ni archivos `.env` en el host.

```bash
git clone https://github.com/leonardolandeo-a11y/PlantClassifier.git
cd PlantClassifier
docker compose --env-file /dev/null -p plantclassifier-standalone-demo -f docker-compose.demo.yaml up -d --build --wait
# URL real: Docker asigna un puerto libre, incluso si 18080 está ocupado.
echo "http://$(docker compose --env-file /dev/null -p plantclassifier-standalone-demo -f docker-compose.demo.yaml port web 8080)"
# Logs (Ctrl+C solo deja de seguirlos)
docker compose --env-file /dev/null -p plantclassifier-standalone-demo -f docker-compose.demo.yaml logs -f
# Detener sin borrar datos
docker compose --env-file /dev/null -p plantclassifier-standalone-demo -f docker-compose.demo.yaml down
# Volver a iniciar conservando PostgreSQL
docker compose --env-file /dev/null -p plantclassifier-standalone-demo -f docker-compose.demo.yaml up -d --build --wait
```

Abre la URL impresa, pulsa **Capturar datos** y visita **Movimiento** para probar
W/A/S/D, STOP y el servo. Las lecturas son simuladas; la predicción la ejecuta Python
con el modelo incluido. El volumen `plantclassifier-standalone-demo_demo_data` conserva
los datos; no uses `down -v` si quieres mantenerlos. Consulta otra vez la URL después
de recrear contenedores: puede cambiar.

Este Compose es independiente del laboratorio: publica únicamente la web en
`127.0.0.1`. Spring, PostgreSQL y los simuladores permanecen en una red interna sin
salida hacia placas o brokers; ninguno publica puertos. Solo el proxy web conecta
esa red con el puerto del navegador. Usa valores públicos exclusivos de demo, nunca
credenciales privadas;
no interpola `.env`, `.env.lab` ni variables de transporte. No lo combines con los
Compose de hardware. Los comandos fijan el proyecto y omiten los archivos de entorno
para que incluso un `COMPOSE_PROJECT_NAME` local del laboratorio no seleccione sus
contenedores.

## Expo Go con simuladores

Dependencias **solo para móvil**: Linux con `ip` (iproute2), Python 3, Node.js 24/npm,
Docker Compose 2.24.4+, Expo Go compatible con el SDK de `mobile/package.json` y un
teléfono en la misma Wi-Fi privada. No se necesita NetworkManager en modo simulado.

```bash
npm ci --prefix mobile
python3 scripts/start-wifi.py --simulate
# Si hay varias interfaces físicas privadas:
python3 scripts/start-wifi.py --simulate --interface wlp2s0
```

Detecta la IP privada, inicia un proyecto `plantclassifier-demo-wifi-<sesión>` y
reutiliza el volumen `plantclassifier-demo-wifi_demo_data`. Rechaza otra sesión activa
para no abrir ese volumen simultáneamente. Obtiene
el puerto asignado por Docker, verifica `/csrf` e inyecta `EXPO_PUBLIC_API_URL` antes
de iniciar Metro. Elige un puerto libre para Metro y solo muestra el QR tras comprobar
su disponibilidad. No pide `CONFIAR`, no lee `.env.lab` y anuncia explícitamente que
usa HTTP simulado. Ctrl+C cierra Metro, elimina los contenedores y redes de esa
sesión y conserva los datos. Para reutilizar imágenes locales ya construidas, añade
`--no-build`. Si otro proceso
ocupa el puerto entre la selección y el arranque, muestra el error: vuelve a ejecutar;
no mata procesos ajenos. Si el teléfono no conecta, abre la URL del backend desde él
y revisa aislamiento Wi-Fi/firewall. La web de escritorio sigue siendo solo loopback.
**Expo Go no se ha probado en un teléfono físico en esta entrega.**

## Hardware y laboratorio (flujo independiente)

El comando sin `--simulate` conserva el flujo HTTP existente con `.env.lab` y
NetworkManager. Rechaza MQTT en vez de cambiar el transporte silenciosamente.
Para MQTT usa el procedimiento de hardware descrito abajo. Los archivos y volúmenes
del laboratorio no forman parte de la demo.

PlantClassifier permite conducir un robot con W/A/S/D y consultar qué cultivo sugiere
un modelo a partir de temperatura, humedad del aire, humedad del suelo y pH. La página se comunica con Spring Boot;
el servidor guarda las mediciones en PostgreSQL y ejecuta Python para predecir.

Hay **dos ESP32 independientes**:

- **Sensores:** DHT11 para temperatura/humedad ambiental, suelo analógico y potenciómetro para simular pH.
  El potenciómetro no mide pH químico. La interfaz y la base de datos conservan ese origen.
- **Movimiento:** recibe comandos MQTT cuando se configura ese transporte; HTTP es el rollback explícito. Por defecto solo los imprime en
  Serial Monitor; activar el TB6612FNG y el servo requiere revisar el hardware.

```mermaid
flowchart TD
    UI[Navegador: React + TypeScript + Tailwind] -->|Sesión y CSRF| API[Spring Boot / Java 21]
    MOBILE[Expo: Datos y Movimiento] -->|Cookies y CSRF| API
    API -->|MQTT configurado| BROKER[Mosquitto]
    BROKER --> SENSOR[ESP32 sensores: DHT11, suelo y potenciómetro]
    BROKER --> MOTOR[ESP32 movimiento: simulación por defecto]
    API -.->|Rollback HTTP explícito| SENSOR
    API -.->|Rollback HTTP explícito| MOTOR
    API -->|JPA y Flyway| DB[(PostgreSQL persistente)]
    API -->|Worker Python con timeout| ML[Python / Random Forest]
    MOTOR --> SERIAL[Serial Monitor / actuadores opcionales]
```

## Iniciar la aplicación con hardware

Necesitas Docker con Compose. Desde la raíz, copia `.env.example` a `.env` **solo si
no existe**, configura credenciales privadas y las dos direcciones ESP32. No uses los
valores `REPLACE_`. `DEVICE_TOKEN` necesita al menos 32 caracteres; el token debe coincidir en Spring y ambos ESP32. Puedes generar valores
independientes con `openssl rand -hex 32`.

```bash
test -f .env || cp .env.example .env
# Editar .env antes de continuar.
docker compose up -d --build --wait
```

Abre `http://127.0.0.1:18080`: el dashboard permite usar **Datos** para capturar y **Movimiento** para W/A/S/D, sin login. Compose publica en `127.0.0.1` por defecto. Para Expo Go por Wi-Fi, con las dependencias móviles instaladas y tu `.env.lab` existente, ejecuta desde la raíz:

```bash
python3 scripts/start-wifi.py
```

Arranca Docker y Expo y muestra el QR sin pedir entrada por teclado. Usa el proyecto
`plantclassifier-wifi` y `.env.lab` por defecto, con un volumen independiente.
Solo admite HTTP y rechaza proyectos existentes que no pertenezcan al lanzador.
No reutiliza el PostgreSQL de laboratorio. Elige puertos libres si el laboratorio
ya está activo. Para MQTT sigue el [flujo local explícito](docs/END_TO_END_REVIEW.md#flujo-local-por-wi-fi). Si usas otro proyecto o archivo:

```bash
COMPOSE_PROJECT_NAME=mi-proyecto python3 scripts/start-wifi.py --env-file .env.personal
```

Detecta la interfaz física y su IPv4 privada e inyecta `EXPO_PUBLIC_API_URL` en Expo,
sin guardar IPs. Si hay varias interfaces candidatas, especifica `--interface NOMBRE`.
El teléfono debe estar en la misma red privada. PostgreSQL permanece en loopback;
el backend se publica solo en la IP seleccionada. Ctrl+C detiene Expo y el backend
LAN, conservando PostgreSQL y sus datos; un cambio de red también cierra la sesión.
Expo usa el puerto 8081: si está ocupado, falla sin preguntar por otro puerto.
Se ejecuta en modo no interactivo (`CI=1`), sin recarga automática al editar código.
Sin USB/ADB; consulta [la guía móvil](mobile/README.md).
Si ya tienes datos, conserva el mismo nombre de proyecto Compose y volumen. Para una
base anterior a Flyway, sigue [MIGRATIONS](docs/MIGRATIONS.md) antes de arrancar.
Nunca necesitas borrar volúmenes para ejecutar esta guía.

## Simulación del laboratorio (overlay anterior)

Para un clon nuevo usa la demo autónoma del inicio: no requiere esta configuración.
Este overlay conserva la configuración y los puertos del laboratorio.

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

**Movimiento:** W/S controlan propulsión y A/D dirección; la última pulsada tiene prioridad por eje.
El frontend adquiere control si hace falta, envía un comando y espera su confirmación.
Los cambios de dirección pendientes se reducen al más reciente. Soltar todas las teclas,
perder foco o pulsar STOP envía STOP inmediatamente. Un error cancela el movimiento;
hay que soltar y volver a pulsar. R centra el MG996R incluso tras una pulsación breve; HOLD o una cancelación de seguridad lo interrumpen. A/D mantenidas junto a W/S conservan ambos ejes; soltar W/S elimina la propulsión.

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

## Validación y cambios locales

La demo tiene su propia [validación reproducible](docs/DEMO_VALIDATION.md), configurada
en CI con puertos ocupados, navegador real y persistencia tras recrear contenedores.
Los cambios de esta entrega siguen locales: el workflow remoto aún no está validado.

Consulta [validación integral](docs/FINAL_VALIDATION.md) para pruebas ejecutadas,
limitaciones y puesta en marcha. No se realizaron commits, push ni cargas a placas.
MQTT se inicia con el overlay documentado en [guía MQTT](docs/MQTT_MIGRATION.md).
La alternativa HTTP permanece en el Compose base.

El worker ML conserva una sola copia del modelo, admite una inferencia cada vez y
rechaza saturación sin encolar trabajo ilimitado. Un timeout mata el proceso; la
siguiente solicitud crea uno nuevo, sin repetir automáticamente la captura.
`ML_PERSISTENT=false` conserva el proceso por predicción como rollback.
El modelo y el dataset no se sustituyen. Sus datos sintéticos no validan precisión
agronómica de campo.
