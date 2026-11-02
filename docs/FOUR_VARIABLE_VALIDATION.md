# Validación de cuatro variables — 2026-11-01

Este informe conserva la validación previa de v1. La revisión posterior y el modelo v2 se documentan en [SOIL_INFLUENCE_DIAGNOSIS.md](SOIL_INFLUENCE_DIAGNOSIS.md).

Se recuperaron los cambios locales sin reset, clean, commit ni push. No se modificaron
firmware, calibración, `.env.lab` ni cabeceras de configuración durante esta continuación.
Se normalizaron exclusivamente CRLF a LF del CSV; una comparación de todas las celdas
confirmó las mismas 11 000 filas. Se regeneró `evaluation.json` con el hash actualizado.

## Modelo activo

`MLClassification/model.pkl`: RandomForestClassifier de 100 árboles, semilla 42,
versión `synthetic-five-crops-v1`. SHA-256:
`9f1e04c6eaa00da092aefc3efb75a20dbd0ebb3d99528784e4665158e365d626`.
El hash dentro de la app desplegada coincide. El respaldo de tres variables permanece
en `model.previous-3-features.pkl`; el predictor nuevo rechaza ese contrato.

Orden obligatorio: `temperature`, `humidity`, `ph`, `soilMoisture`.
Etiquetas exclusivas: frijol, tomate, sandía, melón, lechuga.
Las probabilidades del artefacto en las 11 000 filas coincidieron exactamente con un
entrenamiento nuevo reproducido sobre el mismo 80% estratificado.

Dataset: 2200 filas por cultivo, sin faltantes, infinitos ni vectores duplicados.
Accuracy: 0.8586363636; F1 macro: 0.8579449258. Permutar suelo reduce accuracy en
0.082. La prueba del tramo superior reservado de humedad obtiene 0.4425261245.
Son datos sintéticos: modelo experimental, sin validación agronómica de campo.

## Resultados ejecutados

| Suite | Resultado | Evidencia de esta ejecución |
|---|---|---|
| Python dataset, predicción, rechazo del modelo anterior y entrenamiento reproducible | 5/5, OK | `/tmp/four-ml.log` |
| Entrenamiento e informe actualizado | OK | `/tmp/four-training.log` |
| Java con PostgreSQL desechable, incluidos contratos Spring/Python, humedad inválida y migraciones | 42 descubiertas, 41 ejecutadas, 0 fallos, 1 omitida | `/tmp/four-java.log` |
| TypeScript | `npm run typecheck`, OK | salida de sesión |
| Frontend | 18 controles + 19 sensores, todas OK | `npm test`, salida de sesión |
| Build frontend | OK | `npm run build`, salida de sesión |
| Simuladores | sensor y movimiento OK | `/tmp/four-simulator.log` |
| Build Docker final | OK | `/tmp/four-build.log` |
| Smoke Docker final, Spring → Python real → PostgreSQL | OK | `/tmp/four-smoke-final.log` |
| Playwright final | OK; 3 capturas persistidas, recarga verificada | `/tmp/four-browser-final.log` |
| Whitespace | `git diff --check`, OK | salida de sesión |

La prueba Java omitida es `MovementLatencyTest`, benchmark optativo que requiere
`PLANT_BENCHMARK_OUTPUT`; no se presenta como ejecutada.
Los logs anteriores en `/tmp/four-*` ya no existían al comenzar. No fue posible
determinar la causa exacta del fallo Playwright anterior. Las expectativas recuperadas
ya reflejaban `45 %`, nombres de cultivos capitalizados y el mensaje de calibración
en español; la reproducción pasó. En esta continuación se corrigió el fixture de
calibración para devolver predicción nula/PENDING y se añadió una aserción explícita
de “Recomendación pendiente”, sin retirar validaciones.

## Despliegue y límite físico pendiente

La app anterior seguía cargando el modelo de tres variables. Se recreó únicamente
`plantclassifier-lab-app-1`; ahora está healthy con el modelo nuevo y Flyway V1–V6
correctas. PostgreSQL y sus volúmenes no se recrearon. Los 62 registros previos
(hasta id 613) permanecen; la huella de id, pH, temperatura, humedad, predicción y
humedad del suelo coincide antes y después.

La configuración apunta al ESP32 físico de `.env.lab` y mantiene movimiento simulado.
La captura física devolvió HTTP 504; desde Ubuntu, `/status` y `/capture` devolvieron
`EHOSTUNREACH`. No se pudo verificar una nueva recomendación con hardware real en
esta ejecución. Se requiere recuperar la conectividad del dispositivo; no se
sustituyeron sus lecturas por datos inventados.

## Reanudar con el ESP32 conectado

Si falta el override temporal tras reiniciar, recrearlo sin copiar secretos:

```bash
cat > /tmp/plantclassifier-sensor-real.yaml <<'YAML'
services:
  app:
    environment:
      ESP32_URL: ${ESP32_URL:?Set the sensor ESP32 address}
YAML

docker compose -p plantclassifier-lab \
  --env-file .env.lab \
  -f docker-compose.yaml \
  -f docker-compose.simulation.yaml \
  -f /tmp/plantclassifier-sensor-real.yaml \
  up -d --build --no-deps --force-recreate --wait app
```

Abrir `http://localhost:18080`, pulsar **Capture Data** y comprobar suelo calibrado,
las cuatro lecturas y la recomendación. El pH sigue siendo simulado por potenciómetro.
Si persiste 504, comprobar alimentación, Wi-Fi y que `ESP32_URL` mantenga la IP real.
