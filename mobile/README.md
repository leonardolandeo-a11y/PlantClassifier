# PlantClassifier móvil — Expo

App Expo/React Native con Datos y Movimiento, orientación **landscape**, áreas seguras y columnas flexibles. Los paneles se reorganizan en pantallas estrechas; el desplazamiento es vertical. Comparte tipos, formatos y controladores de seguridad con `frontend/src`.

## Abrir Expo Go con conexión automática

Desde la raíz del repositorio:

```sh
python3 scripts/start-wifi.py
```

Requisitos previos: Docker Compose con soporte `--wait`, Python 3, iproute2, NetworkManager (`nmcli`), Node/npm y las dependencias instaladas (`npm ci` y `npm ci --prefix mobile`). Conserva el `.env.lab` del backend ya configurado; si es una instalación nueva, prepara ese archivo a partir de `.env.example` según la guía raíz. El script no modifica credenciales, firmware ni archivos `.env`. El comando corto usa `plantclassifier-lab` y `.env.lab` por defecto. Para otra configuración, usa `COMPOSE_PROJECT_NAME=mi-proyecto python3 scripts/start-wifi.py --env-file .env.personal`; se puede combinar con `--interface`.

Detecta una IPv4 privada de una interfaz física Ubuntu y muestra el nombre de conexión de NetworkManager. Arranca sin confirmaciones ni entrada por teclado y muestra el QR incluso con stdin cerrado. Expo usa modo no interactivo (`CI=1`), sin recarga automática al editar código. Usa tu red privada de confianza, sin reenvíos de puertos del router. Si hay varias interfaces/IPs, se detiene y muestra opciones: usa `python3 scripts/start-wifi.py --interface wlp2s0` (sustituye el nombre, nunca una IP). No utiliza VPN, Docker, túneles públicos, USB ni ADB.

El lanzador reutiliza el enfoque de [StudyStreak](https://github.com/leonardolandeo-a11y/StudyStreak): URL pública del bundle mediante `EXPO_PUBLIC_API_URL` y puerto del backend mediante Compose. Aquí conserva la autoconexión existente, cookies y CSRF; no copia JWT ni publicaciones globales de puertos.

### Wi-Fi

1. Conecta teléfono y Ubuntu a la misma red privada, sin aislamiento entre clientes; también sirve un hotspot privado que permita comunicación entre dispositivos.
2. Ejecuta el comando. Publica el backend **solo en la IP LAN seleccionada**, usando `APP_BIND_ADDRESS`, con `127.0.0.1` como valor predeterminado de Compose. PostgreSQL permanece en loopback; el lanzador usa únicamente Compose base, no inicia MQTT ni simulación ni aplica overrides ambientales. No cambia firewall, router ni protocolos existentes.
3. Espera Docker y escanea el QR de Metro con Expo Go compatible con SDK 58. Inyecta `EXPO_PUBLIC_API_URL` y el host de Metro en el proceso, sin guardar IPs. Usa el `APP_PORT` efectivo de Compose (18080 por defecto). Desactiva la carga `.env` de Expo para evitar URLs antiguas y limpia su caché.
4. El script comprueba `/sensors` desde Ubuntu; **solo «Conectado» en el teléfono confirma comunicación real entre ambos dispositivos**. La lectura no habilita motores.
5. Ctrl+C cierra Expo y detiene el contenedor app (sin borrar datos). Mientras está activo, comprueba cambios de interfaz/IP/conexión cada 3 segundos y detiene ante cambios. La sesión LAN usa `restart: no` para no reaparecer tras reiniciar Docker. Un cierre forzado/SIGKILL no permite limpieza: ejecuta `docker compose -p plantclassifier-lab --env-file .env.lab stop app`. Para volver a modo local: `APP_BIND_ADDRESS=127.0.0.1 docker compose -p plantclassifier-lab --env-file .env.lab up -d app`.

Si no conecta, abre la URL `/sensors` que imprime el script desde el navegador del teléfono. Si responde en Ubuntu pero no en el teléfono, revisa aislamiento AP/clientes, red de invitados, VPN y reglas de firewall. El script no puede distinguir remotamente cuál de ellos bloquea el tráfico. Usa una red privada sin aislamiento; no desactives el firewall ni publiques el backend en Internet. Si administras un firewall, limita 18080 (o `APP_PORT`) y Metro 8081 al teléfono/red confiable; Docker puede gestionar sus propias reglas de publicación. Nunca configures port forwarding/DMZ hacia estos puertos. Si Metro avisa que 8081 está ocupado, detén la instancia anterior antes de continuar.

La URL es un **origen HTTP(S)** del backend, sin rutas ni credenciales, recibido exclusivamente por `EXPO_PUBLIC_API_URL`. El lanzador la inyecta sin fijar IPs en código. No hay selector, edición de URL, direcciones guardadas, detección de Metro ni servidores alternativos. Si falta la variable, la app lo indica; si el servidor no responde, **Reintentar** usa la misma URL. Las variables `EXPO_PUBLIC_*` están dentro del bundle y no deben contener secretos.

### Android por USB (sin publicar el backend en LAN)

Con depuración USB autorizada y Spring disponible en el equipo en `127.0.0.1:18080`:

```sh
adb reverse tcp:18080 tcp:18080
adb reverse tcp:8081 tcp:8081
EXPO_PUBLIC_API_URL=http://127.0.0.1:18080 npm start --prefix mobile -- --localhost
```

Abre el proyecto en Expo Go desde el enlace/QR de Metro. Si Metro utiliza otro puerto, ajusta también su `adb reverse`. `adb reverse --list` permite verificar los túneles. Repite los comandos al reconectar USB si los túneles desaparecen. En este caso localhost en el teléfono llega al equipo por el túnel; sin él apunta al teléfono. Docker puede conservar `APP_BIND_ADDRESS=127.0.0.1`.

## Conexión y recuperación

- Se muestra conexión confirmada solo después de responder `/sensors`. Comprueba la conexión cada 5 segundos en primer plano (timeout de 4,5 s). Un error deshabilita captura y movimiento; reintenta automáticamente cada 5 segundos, además de ofrecer **Reintentar** contra la misma URL. Una comprobación sana conserva el cliente y las sesiones activas; reconectar exige una pulsación nueva.
- Al volver al primer plano/foco se consultan nuevamente los datos. Nunca se repiten capturas ni comandos de movimiento automáticamente.
- Se conservan cookies (`credentials: include`), bootstrap CSRF compartido, invalidación de CSRF tras 403, límites de 35 segundos para sensores y 1,2 segundos para control, cancelaciones y cierre de sesiones tardías. Ninguna mutación se reintenta automáticamente.
- Cambiar pestaña, perder foco, pasar a segundo plano o desmontar cancela lecturas pendientes. Resultados de intentos anteriores no pueden sobrescribir una conexión nueva.

## Movimiento y seguridad

Con la app en primer plano y el backend conectado, una pulsación nueva solicita sesión si hace falta. La orden solo sale si esa pulsación sigue vigente; no hay botón de habilitación. El D-pad combina ↑/↓ con ←/→ y sigue los identificadores de cada dedo, incluso varios dedos sobre la misma tecla. Soltar una tecla conserva las restantes; cancelar el gesto detiene e invalida las pulsaciones. Hay indicación de pulsación y vibración breve cuando el dispositivo la admite.

**STOP rojo** detiene carro y servo, invalida las pulsaciones y exige una pulsación nueva. Servo tiene **+**, **−**, **CENTER** (acción sostenida hasta centrar) y **HOLD** (solo servo). HOLD limpia sus pulsaciones anteriores sin cancelar las flechas del carro.

Salir de Movimiento, perder foco, background/inactive, inicio de scroll, cambio de dimensiones/orientación, error o reemplazo de conexión detiene e invalida órdenes pendientes. Nunca se reanudan motores automáticamente. Se conservan sesiones, secuencias, renovación periódica, prioridad STOP/HOLD y watchdogs de los controladores compartidos. No se cambian firmware, GPIO, credenciales ni protocolos.

Los estados proceden de confirmaciones del backend/dispositivo; no prueban movimiento físico. Con lector de pantalla, activar una flecha o +/− produce un impulso breve de 200 ms, sin enclavar el movimiento. Botones con etiquetas accesibles y objetivos de al menos 48 dp; texto ajustable y scroll vertical para pantallas bajas.

## Validación

```sh
python3 scripts/test-start-wifi.py
docker compose --env-file .env.lab config --quiet # o tu .env completo
npm run typecheck --prefix mobile
npm test --prefix mobile
npm run export --prefix mobile
```

El export genera un bundle Android en `mobile/dist` (ignorado), no APK/IPA. Los tests Vitest usan React DOM con un adaptador de eventos nativos: cubren autoconexión, errores, URL única/timeout, reintento, sondeos sin reinicio de sesión, recuperación sin reanudación, cookies/CSRF, sesiones tardías, multitouch, STOP/HOLD, cancelación y cambio de dimensiones. No necesitan acceso a motores ni a la red.

**Pendiente de validación física:** Expo Go en teléfonos de varios tamaños con fuentes ampliadas, giro/safe areas, multitouch real y cancelación por scroll, vibración, cookies/CSRF nativos, HTTP permitido por el runtime, Wi-Fi/USB y actuadores. Primero comprobar con motores desconectados y supervisión. El typecheck, los mocks y Metro no prueban hardware ni el diseño renderizado por Android/iOS. No se añadieron excepciones de transporte nativo.
