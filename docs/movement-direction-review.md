# Revisión de dirección y continuidad (2026-11-02)

## Diagnóstico y cambios

- React conserva W → FORWARD, S → BACKWARD, A → LEFT y D → RIGHT. El backend transmite el comando sin invertirlo; el firmware usa dirección lógica +1/-1. El comportamiento físico informado es compatible con polaridad opuesta respecto al montaje, pero el código no permite distinguir orientación mecánica de cableado invertido.
- `motor_polarity.h` centraliza `MOTOR_POLARITY=-1`, invirtiendo únicamente AIN1/AIN2. FORWARD ahora solicita LOW/HIGH, BACKWARD HIGH/LOW. No cambia GPIO, servo ni configuración de hardware. Las pruebas de niveles no prueban hacia dónde giran las ruedas. A/D requieren comprobar la geometría del servo; no se modificó su calibración.
- Antes, cada heartbeat bajaba STBY, incluso con idéntica dirección/PWM. Ahora conserva el puente activo durante comandos sostenidos y comprueba cada escritura PWM. Al fallar PWM, baja STBY y enclava el fallo. Cambiar dirección sigue ejecutando STOP y rechazando el arranque antes de 500 ms. Los STOP repetidos no renuevan `motorStoppedAt`; `lastPoweredDirection` mantiene la protección entre sesiones.
- No se encontró una asimetría lógica que reduzca específicamente el PWM de BACKWARD. No se puede atribuir la pérdida física de potencia a los pulsos STBY sin medirla. Siguen siendo posibles timeout HTTP, pérdida de Wi-Fi, expiración, alimentación insuficiente, caída de tensión, reinicio, rozamiento y carga mecánica.
- El heartbeat esperaba RTT + 250 ms. Ahora apunta a intervalos de inicio de 250 ms: `max(0,250-RTT)` después de cada ACK. Hay un solo movimiento pendiente, sin cola de recuperación ni reintento tras error. Con RTT simulado de 200 ms: 450 → 250 ms entre envíos (44,4% menos). Esto no es una medición de latencia física ni reduce por sí solo el RTT.
- La primera pulsación ya envía adquisición inmediatamente, sin debounce; el primer movimiento espera su respuesta. Se conserva adquisición serializada porque gira la sesión del dispositivo. El bloqueo de `acquire()` puede retrasar peticiones concurrentes mientras adquiere; no se quitó sin un protocolo que coordine las épocas. STOP durante adquisición cancela intención y cierra la sesión resultante sin arrancar.
- El cliente HTTP JDK ya se reutiliza; la persistencia efectiva depende del servidor ESP32. No se cambiaron transporte, timeouts (300/500/1200 ms), deadlines ni watchdog de 1500 ms. Las mediciones históricas GET /status no equivalen a POST /movement. No se contactó hardware para obtener nuevas mediciones.
- El watchdog del movimiento continúa local al ESP32, independiente del navegador/backend. Se comprueba antes/después de `handleClient`; no es un temporizador de corte eléctrico independiente del bloqueo del loop. No se garantiza un corte físico exacto a los 1500 ms si el firmware se bloquea.
- El backend antes ocultaba el mensaje del interbloqueo detrás de un error genérico. La ruta exclusiva de lectura de movimiento ahora reconoce ese rechazo y explica soltar, esperar al menos 500 ms y la detención real, y volver a pulsar. Sensores conservan su lector y tratamiento anterior.

## Diagnósticos

El desplegable del panel muestra duración de adquisición, POST movimiento, STOP, intervalo entre envíos y máximo, y fallos. Son tiempos de comunicación; el texto de estado sigue distinguiendo STOP confirmado/no confirmado. `MovementService` tiene trazas DEBUG opcionales con operación, duración HTTP y éxito de respuesta, sin token, URL o ID de sesión. No se habilitó logging global ni se cambiaron configuraciones.

GET /status autenticado añade dirección lógica, polaridad, edad del comando, uptime y contadores de watchdog, expiraciones, pérdida de Wi-Fi con control activo y rechazos de inversión. Ya exponía PWM solicitado, duty leído, STBY y AIN1/AIN2. Estos datos no miden velocidad de ruedas. Una caída de uptime puede ayudar a detectar reinicios; un contador de Wi-Fi STOP no cuenta todas las reconexiones de radio. Los contadores se reinician al arrancar.

## Pruebas y cobertura

- `scripts/test-firmware.sh`: gate, actuadores hardware con I/O simulado y simulación, adquisición de sensores y sketch real de sensores con mocks.
- Actuadores: polaridad exacta/opuesta, 40 comandos sostenidos en cada dirección, duty estable, ausencia de pulsos STBY en repetición, inversión directa, STOP/reintento antes y después de 500 ms, STOP repetido, rollover, fallo PWM enclavado, fallo de inicialización, watchdog, Wi-Fi perdido en BACKWARD y ausencia de reactivación al reconectar.
- Gate: secuencias duplicadas/obsoletas, deadlines vencidos, expiración, STOP que adelanta movimiento y cierra la época.
- Frontend: W/S, última tecla, soltar, foco/Escape (suite React), STOP pendiente y durante adquisición, ACK fuera de orden, error de red, rechazo, nueva intención explícita tras error, confirmación de STOP, cadencia con RTT y respuesta tardía sin ráfagas.
- Backend: suite Maven completa, pruebas de seguridad CSRF/autenticación y sensores; nuevas pruebas de BACKWARD repetido y mensaje de interbloqueo.
- No se instaló Arduino CLI: no estaba disponible en este entorno. Las pruebas C++ host no sustituyen compilación con el core ESP32. No se subió firmware ni se accionaron motores.

## Verificación física pendiente

1. Mantener alimentación de motor y servo desconectada, ESP32 solo por USB. Inspeccionar cableado TB6612, masa común, STBY y polaridad de alimentación sin cambiar GPIO. Compilar y cargar manualmente el firmware solo tras revisar los cambios. Registrar versión/arranque y diagnóstico autenticado.
2. Sin alimentación de actuadores, comprobar con analizador lógico/multímetro y comandos breves supervisados: W/FORWARD LOW/HIGH, S/BACKWARD HIGH/LOW, STOP STBY bajo y duty cero. Esperar al menos 500 ms entre sentidos. Confirmar liberación, Escape y pérdida de foco; no interpretar duty como velocidad.
3. Después, únicamente bajo supervisión, ruedas elevadas, mecanismo despejado, cableado validado y desconexión eléctrica de emergencia accesible. Usar PWM bajo mediante un cliente manual autenticado que respete sesión/secuencia/deadline y STOP; el teclado sigue solicitando 150/255, por lo que no debe suponerse que constituye una prueba a baja potencia.
4. Aplicar pulsos breves hacia adelante y atrás, STOP entre ellos, esperar al menos 500 ms y hasta detención completa. Verificar A/D sin propulsión. Si el sentido no coincide, desconectar y revisar únicamente MOTOR_POLARITY, sin invertir teclas ni otras capas.
5. Mantener brevemente cada sentido y registrar intervalo HTTP, PWM/STBY, contadores y uptime. Comparar tensión en fuente y motor bajo carga, corriente, batería, temperatura del driver y rozamiento/transmisión. Si PWM sigue estable y cae la velocidad, investigar alimentación/mecánica antes de alterar protecciones.
6. Con ruedas elevadas, baja potencia y corte eléctrico disponible, comprobar liberación, Escape, foco y pérdida de enlace. Reconectar nunca debe reanudar movimiento sin una nueva intención. STOP sin ACK no certifica detención: usar el corte eléctrico ante duda.

La dirección física y la estabilidad bajo carga quedan pendientes de esta comprobación manual; no se declaran resueltas por las pruebas automatizadas.

## Resultados ejecutados

- Firmware host: todas las comprobaciones pasan, incluidos sensores.
- Frontend: 68 tests, 3 archivos, todos pasan; lint y build pasan.
- Maven `verify`: BUILD SUCCESS; 47 tests, 0 fallos, 0 errores, 5 omitidos (4 PostgreSQL opt-in y 1 benchmark opt-in). La primera ejecución aislada falló exclusivamente al abrir sockets del mock HTTP; la repetición autorizada fuera del sandbox pasó.
- `git diff --check`: pasa. Estado inicial limpio en main; no se crearon ramas, commits ni push. No se modificaron credenciales, Wi-Fi, IP/URL, tokens, Docker, PostgreSQL, GPIO, calibración, firmware de sensores, ML ni captura. Se conserva `WiFi.setSleep(false)` y el modo de hardware existente.
