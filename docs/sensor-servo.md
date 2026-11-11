# MG996R en la ESP32 de sensores

Recablear DATA del DHT11 de GPIO 22 a GPIO 21 (libre en este firmware: sin I²C ni otros periféricos asignados). Mantener pH en GPIO 34 y suelo en GPIO 35. Conectar señal MG996R a GPIO 22 de **sensores**. La ESP32 de movimiento y W/A/S/D permanecen independientes.

Instalar ESP32Servo en Arduino junto con las dependencias existentes. PWM 50 Hz; límites heredados 70–130°, centro 100°, pulsos 500–2400 µs. No ampliar estos valores sin calibrar físicamente pulsos, neutral y holgura. El arranque del firmware adjunta el servo y comanda 100°: mantener alimentación del actuador desconectada durante instalación/verificación. No se cargó firmware ni se accionó hardware como parte de este cambio.

Alimentar MG996R con fuente externa regulada apropiada (5–6 V, dimensionada para corriente de arranque/bloqueo del servo, con margen); no desde 3.3 V ni el regulador de la ESP32. Unir GND de fuente, servo y ESP32. Verificar polaridad y disponer de corte de alimentación independiente.

React → Spring `/sensor-servo` → cliente **sensorClient** → ESP32 `/servo`. GET devuelve ángulo comandado (sin realimentación física) y estado. POST `/sensor-servo/session` adquiere una época mediante `/servo-session`; POST envía INCREASE, DECREASE, HOLD o CENTER con época y secuencia. El backend añade vencimiento relativo al reloj del dispositivo y X-Device-Token existente. Las rutas mutantes del navegador conservan CSRF. No se envía el token al navegador.

E/Q y botones giran mientras se mantienen; R centra. Soltar, perder foco, ocultar/cerrar página o desmontar envía HOLD; este invalida la época para rechazar mensajes anteriores. Renovación cada 250 ms, interpolación en firmware de hasta 2° cada 15 ms mediante millis(), sin bucles de espera. GET de estado cada 500 ms. Pérdida de Wi-Fi o 1000 ms sin comandos detiene e invalida el control; consultar estado no renueva el watchdog. La parada por red depende de la latencia, con watchdog como respaldo; HOLD mantiene PWM/posición, no corta corriente. Sensores siguen disponibles durante el giro.
