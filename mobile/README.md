# PlantClassifier móvil — base Expo

Base React Native con TypeScript y dos pestañas: Datos y Movimiento. Proyecto independiente del workspace web, con lockfile propio. Versiones basadas en la [plantilla oficial de Expo](https://docs.expo.dev/more/create-expo/).

## Ejecutar

Desde la raíz del repositorio:

```sh
npm ci --prefix mobile
npm start --prefix mobile
```

Abrir con Expo Go compatible con SDK 58 o un development build compatible. Para emulador Android: `npm run android --prefix mobile`. iOS requiere macOS/simulador o un dispositivo compatible. No se generó APK/IPA.

En Datos, introducir el **origen actual del backend Spring** accesible desde el teléfono (esquema, host y puerto, sin rutas ni credenciales). Pulsar «Consultar última captura» y luego «Capturar datos». La dirección queda solo en memoria; no se modifica ninguna IP, archivo de entorno, WiFi ni configuración del servidor. No introducir la dirección directa del ESP32. El teléfono debe poder acceder al backend con la red ya configurada; localhost en un teléfono apunta al propio teléfono.

## Implementado

- Navegación inferior, áreas seguras, tema azul grafito y tarjetas de sensores.
- Cliente GET `/sensors`, GET `/csrf`, POST `/sensors/capture`, cookies de sesión y cabecera CSRF recibida del servidor. No hay tokens de dispositivo embebidos.
- Carga, error, espera máxima de 35 segundos, captura y última recomendación. Sin datos inventados ni almacenamiento de credenciales.
- Reutilización de tipos y funciones puras de formato de `frontend/src`; Metro observa esa carpeta. Mantener ambas carpetas al ejecutar.
- Pantalla Movimiento diseñada con carro y servo separados.

## Pendiente explícito

Los botones de Movimiento **están deshabilitados y no envían comandos**. Falta adaptar `MovementControl` y la máquina de sesión del servo a eventos nativos: press-in/out, interrupción del gesto, AppState, cambio de pestaña y desmontaje, conservando secuencias, heartbeat, STOP/HOLD prioritario y cierre de adquisiciones tardías. La web sí ofrece estos controles completos.

Falta validar captura/cookies CSRF contra el backend real en Android/iOS. El export de Metro valida el empaquetado, no el comportamiento en hardware. Las políticas de HTTP sin cifrar dependen del runtime/build nativo: no se añadieron excepciones de transporte ni se cambió la seguridad del backend. No hay persistencia local, historial paginado, reconexión automática ni distribución en tiendas.

## Validar

```sh
npm run typecheck --prefix mobile
npm run export --prefix mobile
```

`export` produce un bundle Android en `mobile/dist` (ignorado por Git), no una aplicación instalada. Las dependencias móviles no cambian las de React web.
