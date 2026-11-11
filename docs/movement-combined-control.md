# Movimiento combinado y diagnóstico de dirección

Implementación local en `main`, 2026-11-02. Sin commits, push, cambio de rama, cargas de firmware ni contacto con actuadores físicos.

## Recuperación

Al reanudar había 13 archivos modificados y ningún archivo nuevo no rastreado:

- `ESP32/Movement/{Movement.ino,actuators.h,control_protocol.h}`.
- `frontend/src/components/movement/MovementPanel.tsx`, `frontend/src/hooks/useMovement.ts`, `frontend/src/movement/controller.ts`.
- `frontend/tests/{control.test.js,react.test.tsx}`.
- `scripts/esp32-simulator.py`.
- `src/main/java/com/codewithmosh/plantclassifier/dto/{MovementAck.java,MovementRequestDTO.java}`.
- `src/main/java/com/codewithmosh/plantclassifier/service/MovementService.java`.
- `src/test/java/com/codewithmosh/plantclassifier/MovementServiceTest.java`.

Se inspeccionaron `/tmp/edit_movement.py`, `/tmp/edit_firmware.py` y `/tmp/edit_tests.py`; no se ejecutaron de nuevo. Sus cambios ya estaban aplicados. Los logs anteriores confirmaron 68 pruebas frontend y Maven de movimiento satisfactorios, con el benchmark opt-in omitido.

Se completaron después la negociación de versión en adquisición/API, validación de ACK, diagnósticos de recepción y servo, pruebas combinadas React/Java/HTTP firmware, mocks del sketch real, pruebas del simulador y esta guía. `useKeyboardMovement.ts`, `DirectionButton.tsx` y `movement_safety.h` se revisaron y conservan su implementación: ya gestionaban foco/repeticiones, fuentes de puntero y las paradas de seguridad necesarias.

## Comportamiento y protocolo

W/S y A/D se resuelven de manera independiente. Prevalece la última pulsación dentro de cada eje; una repetición no reordena las teclas. Soltar la ganadora restaura la otra que siga sostenida. Teclado y punteros mantienen fuentes independientes.

| Teclas | command | steering | speed |
|---|---|---|---|
| W | FORWARD | CENTER | 150 |
| S | BACKWARD | CENTER | 150 |
| A | LEFT | LEFT | 0 |
| D | RIGHT | RIGHT | 0 |
| W+A / A+W | FORWARD | LEFT | 150 |
| W+D / D+W | FORWARD | RIGHT | 150 |
| S+A / A+S | BACKWARD | LEFT | 150 |
| S+D / D+S | BACKWARD | RIGHT | 150 |
| Ninguna | STOP | CENTER implícito | 0 |

Ejemplo enviado a Spring Boot:

```json
{"command":"FORWARD","speed":150,"steering":"LEFT","sessionId":"<sesión válida>","sequence":1}
```

El backend añade `deadlineMs` con la misma política anterior. El ESP32 valida sesión, secuencia, deadline, comando, velocidad y dirección antes de aplicar un estado completo mediante `applyMovement()`. `steering` acepta exclusivamente LEFT/CENTER/RIGHT; una dirección que contradiga LEFT/RIGHT/CENTER o STOP se rechaza. Velocidad cero no conserva la propulsión anterior. No hay dos peticiones para los dos ejes.

La adquisición anuncia `protocolVersion: 2`. Spring transmite la capacidad real del dispositivo al navegador. El frontend nuevo exige v2 antes de enviar movimiento; el backend también bloquea una petición extendida si el firmware no la anunció. Los ACK extendidos deben devolver versión 2, dirección exacta, comando, velocidad aplicada, sesión y secuencia coincidentes. No se declara éxito si falta algún campo. STOP sigue disponible sin extensión.

Compatibilidad: firmware nuevo acepta comandos antiguos; LEFT/RIGHT/CENTER siguen significando motor detenido. FORWARD/BACKWARD sin `steering` centran determinísticamente el servo. Clientes antiguos pueden seguir usando esos comandos individuales. Backend/frontend nuevos requieren actualizar también el firmware para el control combinado. Un frontend nuevo frente a un backend antiguo detecta la falta de versión durante adquisición y solo cierra con STOP.

Al soltar A/D se envía la misma propulsión con CENTER. Al eliminar W/S se envía STOP prioritario, cerrando la sesión y anulando peticiones antiguas; únicamente tras su ACK se adquiere otra sesión para la dirección todavía sostenida, a velocidad cero. Puede existir un breve centrado del servo durante esa transición: se prioriza detener el motor. Si STOP falla se cancela toda intención y se informa que la detención no está confirmada. Soltar todo, Escape, botón STOP, foco, visibilidad y abandono conservan su parada.

Se mantiene una petición normal activa por época, sin cola de estados intermedios; STOP puede adelantarla. Una respuesta de la época anterior no restaura movimiento. Heartbeats apuntan al mismo intervalo de 250 ms entre inicios, sin aumentar timeouts. No se cambió `motorDrive()`: conserva polaridad -1, PWM, STBY estable y el interbloqueo de 500 ms, también entre sesiones. Ese intervalo no certifica detención mecánica.

## Diagnóstico del servo

La imposibilidad de giro simultáneo sí tenía dos causas de software verificadas: selección de una sola tecla en React y parada del motor para órdenes de dirección aisladas en firmware. Ahora cambiar `steering` dentro de FORWARD/BACKWARD no llama a `motorStop()` por ese cambio.

No se encontró evidencia que explique de manera concluyente que A/D no muevan físicamente el servo. Se inspeccionaron la implementación local y ESP32Servo 3.2.1 instalada: `allocateTimer(0)` restringe la asignación, se configura 50 Hz y se adjunta GPIO 22. El motor usa canal 2/temporizador 1 a 5 kHz. Para esta configuración de ESP32 clásico no se observa conflicto de temporizadores. La versión realmente instalada en la placa todavía debe confirmarse.

`attach()` puede devolver el canal 0 válido: se sigue usando `attached()` para establecer `servoOK`, no un cast booleano de ese retorno. Ahora se registra el canal. `servoAttached=true` significa recurso de software adjunto; no confirma pulsos medidos, alimentación ni desplazamiento. La frecuencia reportada es configuración, no medición. `servoMove()` conserva LEFT=70, CENTER=100, RIGHT=130 y pulsos 500–2400 µs. Son valores heredados sin nueva validación física. No se invirtieron A/D ni se recalibraron ángulos arbitrariamente.

`robotStop()` centra el servo al iniciar/adquirir, con STOP, fallos, watchdog, expiración y pérdida Wi-Fi. Los heartbeats combinados mantienen el ángulo mientras se sostiene la tecla. En simulación no se emite señal eléctrica y `servoAttached` permanece falso: comprobar `mode` y `hardwareOutputEnabled` antes de interpretar ese estado.

Diagnósticos autenticados `/status`:

- `lastReceivedCommand/Steering/Sequence`: última petición con campos básicos válidos; steering inválido se marca INVALID. No constituyen aceptación.
- `lastAcceptedCommand/Steering/Sequence`: último comando aceptado; son historial y pueden preceder a una parada automática.
- `logicalDirection`, `speed`, `steeringAngle`, `controlActive`, `commandAgeMs`: estado lógico actual.
- `servoAttached`, `servoChannel`, `servoTimer`, `servoPin`, `servoFrequencyHz`, `pwmAttached`, `lastPwmWriteOk`, `pwmDuty`, STBY/AIN: configuración y estado interno de salidas.
- `protocolRejections`, `lastProtocolError`, contadores de watchdog/Wi-Fi/sesiones/inversión y uptime: rechazos y paradas. El último error es histórico; puede persistir tras una orden válida.
- `physicalMotionVerified=false`: nunca se infiere movimiento real del ACK.

Las trazas DEBUG existentes de `MovementService` ahora distinguen envío (comando, steering, velocidad, secuencia), ACK validado y duración HTTP. No se habilitó logging global ni se registran tokens, URLs o IDs de sesión. Serial registra cambios aceptados y motivos de rechazo, sin imprimir cada heartbeat aceptado.

Así se distingue: ausencia de envío (traza backend), rechazo (HTTP/error/contador), aceptación y cambio lógico (ACK + ángulo), y ausencia de desplazamiento pese a aceptación (requiere medición eléctrica/mecánica). `/status` por sí solo no puede probar que el backend jamás envió algo: hay que correlacionar trazas y secuencias.

## Pruebas ejecutadas

- Frontend: **96 pruebas pasan**, 3 archivos. Casos individuales y combinados, ambos órdenes, conflictos en cada eje, liberación de propulsión/dirección, fuentes teclado/puntero, heartbeats, respuestas tardías, STOP pendiente, fallos/ACK inválidos y compatibilidad. Incluye regresión de sensores/UI.
- `npm --prefix frontend run lint` y `npm --prefix frontend run build`: pasan.
- Maven `verify`: **BUILD SUCCESS**, 50 pruebas registradas, 0 fallos/errores, 5 omitidas (4 PostgreSQL opt-in y 1 benchmark opt-in). Incluye validación DTO, contrato v2 y rechazo de firmware/ACK antiguos, seguridad web, sensores y aplicación.
- `bash scripts/test-firmware.sh`: pasa. Gate, actuadores mock en ambos modos, sensores existentes y nuevo `movement_http_test.cpp`: compila y ejecuta el sketch real con ArduinoJson y Wi-Fi/GPIO/PWM/servo simulados. Verifica combinaciones, STBY estable durante cambios de steering/heartbeats en ambos sentidos, STOP, sesión antigua, secuencias duplicadas, deadlines, watchdog, Wi-Fi, inversión y fallos PWM/servo.
- `python3 scripts/test-simulator.py`: pasa con servidores HTTP locales efímeros; contratos de sensores y movimiento, nuevas combinaciones v2 y STOP. El simulador Python no modela mecánica ni sustituye el interbloqueo ensayado con los mocks del firmware.
- El sandbox inicialmente bloqueó sockets de loopback en Java/Python; se repitieron con autorización fuera del sandbox, únicamente contra mocks/simuladores.
- `git diff --check`: pasa.
- **Pendiente**: compilación con el core real ESP32 porque Arduino CLI no está disponible; los tests host no la sustituyen. Tampoco se realizaron medidas físicas ni carga de firmware. PostgreSQL opt-in/benchmark no se ejecutaron; no se modificó la configuración de base de datos.

## Actualización manual y revisión física previa

Docker: reconstruir el servicio `app` con la misma invocación Compose, archivos `-f`, proyecto y `--env-file` que ya se usan, añadiendo `up -d --build --no-deps app`. En la configuración estándar: `docker compose up -d --build --no-deps app`. Si se utiliza `.env.lab`, conservar ese argumento explícito. Esto recompila backend y frontend sin recrear PostgreSQL. No ejecutar `down -v`. No se ejecutó despliegue ni se cambiaron archivos Docker.

Arduino IDE: abrir **ESP32/Movement/Movement.ino**, conservar placa ESP32 clásico y ajustes locales, usar core ESP32 Arduino 3.x, ESP32Servo y ArduinoJson 7. Pulsar **Verificar** antes de cargar. Conservar `wifi_config.h`, GPIO, modo local y calibración. No recompilar/cargar el ESP32 de sensores por este cambio. La carga posterior es manual y debe realizarse con alimentación de actuadores desconectada.

Antes de energizar actuadores, identificar modelo exacto del servo (posicional o rotación continua), tensión nominal, corriente de arranque/bloqueo, compatibilidad de señal, fuente/regulador, polaridad, fusible/cableado y capacidad del TB6612FNG según fichas de los componentes reales. Un servo de rotación continua no implementa directamente estos ángulos de dirección. La arquitectura de software es un motor DC en canal A más servo, no dos motores diferenciales. Si el montaje difiere, detener la prueba y revisar el diseño.

1. Con alimentación de motor y servo desconectada, inspeccionar masa común, señal GPIO 22, pinout del conector, alimentación correcta, conectores y unión mecánica. No alimentar el servo desde un GPIO ni asumir que USB/3,3 V soporta sus corrientes. Verificar ausencia de realimentación por señal y disponer de corte eléctrico independiente accesible; STOP de software no desconecta la alimentación del servo.
2. Comprobar primero la lógica sin actuadores alimentados. En simulación no habrá PWM; para comprobar señal, compilar manualmente el modo hardware ya previsto, mantener los actuadores desconectados y medir GPIO 22 con instrumentación apropiada. Validar por separado fuente y señal de 50 Hz/pulsos frente a la ficha del servo. No conectar tensiones incompatibles a la placa o al instrumento.
3. Con el servo aún sin alimentación, revisar recorrido de varillaje, montaje del brazo y topes. No asumir seguros los límites 70/100/130 o 500–2400 µs. La calibración física necesaria debe hacerse separadamente antes de ensayar todo el recorrido; detener ante esfuerzo, bloqueo, ruido o consumo anormal.
4. Solo tras confirmar alimentación y recorrido seguro, probar LEFT/CENTER/RIGHT bajo supervisión, manteniendo **la alimentación del motor desconectada**. Verificar sentido real, retorno al centro y corte eléctrico. Si el sentido está invertido, registrar evidencia del montaje antes de cambiar calibración; no se declara resuelto sin esta prueba.
5. Con ruedas elevadas, mecanismo despejado y corte a mano, probar el motor a potencia baja adecuada al hardware. El teclado solicita **150/255**, que no debe suponerse potencia baja. Usar un cliente manual autenticado con velocidad apropiada, sesiones, secuencia, deadline y STOP; esperar al menos 500 ms y la detención física antes de invertir.
6. Solo después evaluar avance/retroceso con giro bajo supervisión; comprobar liberación, Escape/foco, watchdog y pérdida de enlace. No reconectar esperando reanudación automática. Si el ACK/STOP no está confirmado o el comportamiento es inesperado, usar el corte independiente.

Permanecen intactos archivos de entorno, Wi-Fi/IP/URLs/tokens, conexiones de los ESP32, Docker/red, PostgreSQL, sensores, ML, GPIO, calibración/pulsos, `MOTOR_POLARITY=-1`, `WiFi.setSleep(false)`, timeouts y protecciones existentes.
