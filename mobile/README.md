# PlantClassifier móvil — Expo

React Native con TypeScript y dos pestañas: Datos y Movimiento. Proyecto independiente del workspace web, con lockfile propio. Versiones basadas en la [plantilla oficial de Expo](https://docs.expo.dev/more/create-expo/).

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

Los controles están implementados con habilitación explícita por sesión de laboratorio. Su uso con actuadores reales sigue pendiente de validación Android supervisada.

Falta validar captura/cookies CSRF contra el backend real en Android/iOS. El export de Metro valida el empaquetado, no el comportamiento en hardware. Las políticas de HTTP sin cifrar dependen del runtime/build nativo: no se añadieron excepciones de transporte ni se cambió la seguridad del backend. No hay persistencia local, historial paginado, reconexión automática ni distribución en tiendas.

## Validar

```sh
npm run typecheck --prefix mobile
npm run export --prefix mobile
```

`export` produce un bundle Android en `mobile/dist` (ignorado por Git), no una aplicación instalada. Las dependencias móviles no cambian las de React web.

## Controles de laboratorio

Movimiento utiliza `MovementControl` y `createServoControl`, compartidos con web.
Configura primero el origen Spring en Datos. La pestaña Movimiento requiere pulsar
«Habilitar para esta sesión de laboratorio». El cambio de pestaña, AppState
background/inactive y blur detienen y deshabilitan el control; volver no lo reactiva.
W/A/S/D táctiles combinan ejes. CENTER queda activo hasta completar o recibir HOLD.

El cliente usa `credentials: include`, un único bootstrap CSRF concurrente y no
reintenta mutaciones. Validar cookies/CSRF en Android real sigue siendo obligatorio:
los mocks de React Native no prueban el almacén de cookies nativo ni multitouch físico.

Desde la raíz: `npm ci`, `npm ci --prefix mobile`, `npm test --prefix mobile`,
`npm run typecheck --prefix mobile`, `npm run export --prefix mobile`.
Los tests usan Vitest/React DOM de la raíz y un adaptador nativo simulado. No acceden
al laboratorio. Para acceso LAN al backend usa `APP_BIND_ADDRESS=0.0.0.0` explícito.
