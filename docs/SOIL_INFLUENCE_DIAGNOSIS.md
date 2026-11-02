# Diagnóstico de humedad del suelo — 2026-11-01

## Conclusión

El suelo sí llegaba íntegro y sí influía. Las capturas 690–692 en PostgreSQL conservaban 0, 58 y 100, pH aproximadamente 9,1 y modelo v1. El hash del modelo y los archivos Python del contenedor coincidían con los locales. Spring pasa temperatura, humedad ambiental, pH y suelo sin constantes ni imputación; cada captura crea una medición nueva e invoca un proceso Python nuevo.

La clasificación constante se explica por la combinación de variables y la extrapolación: pH 9,1 está fuera de 5,5–7,5. En este dataset melón tiene pH medio 6,91 (tomate 6,09), temperatura compatible con 26,7 y suficiente solapamiento de humedad. Los árboles envían valores exteriores a hojas existentes; no detectaban por sí mismos que faltaba evidencia. Las probabilidades altas no demostraban idoneidad agrícola.

No se modificó el dataset, el firmware, los pines, la calibración, las credenciales ni los controles de movimiento. No se forzaron etiquetas mediante umbrales de suelo.

## Experimento controlado sobre el modelo original

Temperatura 26,7; humedad ambiental 68,4; pH 9,1. Probabilidades en porcentaje. El CSV incluye también las diferencias de cada probabilidad respecto al punto anterior, cambio de ganador y distancia de variación total; el primer punto no tiene diferencia previa.

| Suelo | Frijol | Tomate | Sandía | Melón | Lechuga | Ganador |
|---:|---:|---:|---:|---:|---:|---|
| 0.0 | 3.0 | 0.0 | 0.0 | 97.0 | 0.0 | melón |
| 10.0 | 3.0 | 0.0 | 0.0 | 97.0 | 0.0 | melón |
| 20.0 | 3.0 | 0.0 | 0.0 | 97.0 | 0.0 | melón |
| 30.0 | 0.0 | 0.0 | 0.0 | 100.0 | 0.0 | melón |
| 40.0 | 0.0 | 0.0 | 1.0 | 99.0 | 0.0 | melón |
| 50.0 | 0.0 | 0.0 | 0.0 | 100.0 | 0.0 | melón |
| 58.0 | 0.0 | 0.0 | 0.0 | 100.0 | 0.0 | melón |
| 60.0 | 0.0 | 0.0 | 0.0 | 100.0 | 0.0 | melón |
| 70.0 | 0.0 | 0.0 | 0.0 | 100.0 | 0.0 | melón |
| 80.0 | 0.0 | 1.0 | 1.0 | 98.0 | 0.0 | melón |
| 90.0 | 0.0 | 4.0 | 0.0 | 95.0 | 1.0 | melón |
| 100.0 | 0.0 | 4.0 | 0.0 | 95.0 | 1.0 | melón |

En las tres capturas reportadas (incluyendo las pequeñas variaciones de humedad y pH) se reproducen 97 %, 100 % y 95 % para melón. Sobre el barrido completo, melón varía 5 puntos; frijol 3, tomate 4, sandía 1 y lechuga 1. En 0 y 100 también el suelo está fuera del rango observado: 20,15–90,83.

Se repitió con pH 5,8; 6,2; 6,5; 6,8 y 7,2. Son valores representados en el dataset, no una recomendación para ajustar el suelo. Con pH 6,5 y suelo 40, melón tiene 65 % y tomate 20 %; con suelo 58, 42 % y 44 %; con suelo 70, 13 % y 82 %. Cambiar solo suelo sí cruza la frontera de decisión. Con pH 6,2 tomate sube de 44 % a 94 % sin dejar de ganar. Dentro de los rangos marginales tampoco se garantiza soporte conjunto ni validez de campo.

Archivos: [CSV completo](../MLClassification/soil-analysis/soil_sensitivity.csv), [capturas reportadas](../MLClassification/soil-analysis/reported_captures.csv), [gráfica original](../MLClassification/soil-analysis/probabilities-baseline.png), [gráfica candidato](../MLClassification/soil-analysis/probabilities-candidate.png). Las gráficas incluyen salidas crudas fuera de dominio exclusivamente para diagnóstico; la inferencia de producción v2 se abstiene en esos casos.

## Auditoría del dataset

11 000 filas, 2200 por cultivo; sin faltantes, infinitos ni vectores duplicados. No se cambiaron números ni etiquetas. Se conserva su SHA-256 en analysis.json y evaluation.json. Estadísticas completas (media, desviación, mínimo, máximo, percentiles 5/25/50/75/95) en distributions.csv; histogramas de 20 intervalos comunes por variable en histograms.csv.

| Cultivo | Temperatura min–max | Humedad ambiental min–max | pH min–max | Suelo min–max | Suelo media ± DE |
|---|---:|---:|---:|---:|---:|
| frijol | 16.03–25.00 | 25.27–78.08 | 5.50–7.50 | 20.22–80.78 | 50.11 ± 11.30 |
| lechuga | 12.02–20.97 | 39.98–78.99 | 6.00–7.00 | 40.43–90.83 | 69.52 ± 9.55 |
| melón | 18.13–30.00 | 25.44–78.46 | 6.01–7.50 | 23.60–82.87 | 53.50 ± 10.71 |
| sandía | 20.26–34.99 | 25.18–77.47 | 6.00–7.00 | 20.15–81.05 | 48.36 ± 10.63 |
| tomate | 20.01–27.00 | 34.36–78.95 | 5.51–6.79 | 30.14–88.63 | 62.11 ± 10.58 |

El suelo tiene variación amplia por clase, pero mucho solapamiento: coeficiente de histogramas frijol–sandía 92,18 %, frijol–melón 87,59 %, sandía–melón 81,73 %. No existe una correspondencia unívoca suelo → cultivo. Estas diferencias sintéticas son estadísticamente aprendibles, pero no están justificadas agronómicamente con las fuentes disponibles.

Las correlaciones dentro de cada cultivo son muy pequeñas (máximo absoluto Pearson/Spearman aproximadamente 0,039). Globalmente temperatura–suelo = −0,383 y humedad ambiental–suelo = 0,355. Esto es compatible con generación casi independiente por variable condicionada a la etiqueta y correlaciones inducidas al mezclar cultivos; es una inferencia, no una reconstrucción del generador. No hay metadatos de grupos, sitios o campañas para validar independencia real.

Véanse [distribuciones](../MLClassification/soil-analysis/distributions.png), correlations.csv y overlap.csv. Los coeficientes de solapamiento dependen de los intervalos elegidos.

## Importancia y sensibilidad

Importancia por permutación en las 2200 filas de prueba, 10 repeticiones, semilla 42. La caída es en puntos de accuracy; la desviación entre permutaciones no es un intervalo de confianza poblacional. Estas importancias describen el predictor sobre este dataset, no efectos causales agronómicos.

| Variable | Importancia por impureza v1 | Caída por permutación v1 ± DE |
|---|---:|---:|
| temperature | 44.43 % | 46.33 ± 0.91 puntos |
| humidity | 16.01 % | 9.35 ± 0.51 puntos |
| ph | 24.94 % | 21.32 ± 0.72 puntos |
| soilMoisture | 14.61 % | 8.23 ± 0.48 puntos |

Ablación con reentrenamiento sin suelo: accuracy 81,00 %, F1 macro 0,8090, frente a 85,86 % y 0,8579. Al variar exclusivamente suelo entre percentiles 5 y 95 de cada clase calculados en entrenamiento, cambia la clase en 27,14 % de las 2200 filas de prueba (v2: 26,77 %). Distancia media de variación total entre distribuciones: 0,2675 (v2: 0,2591). No se mide accuracy de esas entradas alteradas porque no existen etiquetas contrafactuales reales.

## Comparación y aceptación

Una hipótesis de regularización predefinida, sin búsqueda usando el test: 200 árboles y min_samples_leaf=5, frente a 100 y 1. Semilla 42, max_features=sqrt, mismas 8800 filas de entrenamiento y 2200 de evaluación, sin reentrenar con el test. Criterios fijados antes de ejecutar: pérdidas máximas de 1 punto en accuracy/F1 macro y cola inferior, 3 puntos de F1 por cultivo, Brier no peor y ganancia mínima de 5 puntos en cola superior. Todos se cumplieron. No se usó que la etiqueta cambiara para aceptar el candidato.

| Métrica | v1 | v2 |
|---|---:|---:|
| Accuracy aleatoria | 0.858636 | 0.866818 |
| Brier multiclase (suma; menor mejor) | 0.207620 | 0.198311 |
| Log loss (menor mejor) | 0.415513 | 0.357163 |
| ECE clase ganadora, 10 intervalos | 0.013195 | 0.027524 |
| F1 macro | 0.857945 | 0.866360 |
| Accuracy upper_tail | 44.25 % | 56.57 % |
| Accuracy lower_tail | 37.94 % | 38.71 % |
| Accuracy global_above_70 | 91.16 % | 92.51 % |

| Cultivo | F1 v1 | F1 v2 |
|---|---:|---:|
| frijol | 0.8113 | 0.8187 |
| tomate | 0.8659 | 0.8646 |
| sandía | 0.8420 | 0.8525 |
| melón | 0.8333 | 0.8513 |
| lechuga | 0.9372 | 0.9448 |

Se verificaron adicionalmente semillas 17 y 2026, sin reajustar hiperparámetros. La accuracy aleatoria v2 fue 86,36 % y 86,09 % (v1: 85,68 % y 85,73 %); cola superior 55,79 % y 56,38 % (v1: 51,29 % y 52,11 %); cola inferior 38,76 % y 39,44 % (v1: 38,39 % y 38,07 %). Son comprobaciones de estabilidad, no intervalos de confianza ni validación externa.

**Limitación crítica del estrés:** los ensayos de colas entrenan modelos separados excluyendo el 20 % superior/inferior de suelo por clase. La asignación depende de la etiqueta y altera la relación suelo–clase, de modo que no estima directamente rendimiento de campo. Aun así revela fragilidad real del aprendizaje: v2 tiene recall 0 % para frijol en cola superior, y aproximadamente 0,23 % para tomate y 0 % para lechuga en cola inferior. La mejora agregada no resuelve esas extrapolaciones. El corte global >70, independiente de etiquetas, obtuvo 92,51 %, pero cambia la mezcla de cultivos y tampoco sustituye validación por sitio/campaña.

## Probabilidades y dominio

Las probabilidades son medias de distribuciones de clase en hojas del bosque. La unanimidad de árboles fuera de dominio puede producir 100 % sin evidencia de idoneidad. Brier y log loss mejoran con v2, pero ECE empeora de 0,0132 a 0,0275; además depende del binning. No se añadió un porcentaje al dashboard. La calibración observada en el test sintético no valida probabilidades de campo ni de entradas fuera de dominio.

El artefacto v2 incluye sus límites empíricos de entrenamiento: temperatura 12,02–34,99; humedad ambiental 25,18–78,99; pH 5,5–7,5; suelo 20,15–90,83. Son un filtro conservador de extrapolación, NO rangos agronómicos recomendados. La escala del sensor resistivo sigue siendo relativa a la calibración local, no humedad volumétrica universal.

Python conserva el contrato de una etiqueta en stdout cuando es admisible. Fuera de esos límites, no predice ni recorta el valor: termina con código 2, stdout vacío y marcador específico en stderr. Spring exige ese marcador para no confundir errores del intérprete con abstenciones. Spring registra la medición original, modelo v2, prediction=null, predictionStatus=OUT_OF_DOMAIN y predictionError=ml-out-of-domain. Falta de suelo/estado inválido siguen PENDING; errores numéricos se rechazan; los fallos de ejecución siguen FAILED. No se requiere migración nueva ni se reescriben históricos.

El dashboard distingue fuera de dominio, pendiente y captura fallida; identifica explícitamente el modelo experimental. Al comenzar una captura retira la recomendación anterior. Una respuesta tardía del GET inicial no puede sobrescribir la captura nueva. Las predicciones v1 se identifican como históricas.

## Artefactos y reproducción

Original v1: soil-analysis/baseline.pkl (SHA-256 9f1e04c6eaa00da092aefc3efb75a20dbd0ebb3d99528784e4665158e365d626). Candidato aceptado: soil-analysis/candidate.v2.pkl; activo local: model.pkl (SHA-256 d99329e27df0d0a9a8df867abbef07ca0f7608abebaa108a05b6d81532718e26). El antiguo respaldo de tres variables permanece intacto. candidate.pkl es el ensayo intermedio sin contrato v2, no se carga en producción.

```bash
docker run --rm --user "$(id -u):$(id -g)" --entrypoint python \
  -v "$PWD:/work" -w /work plantclassifier:soil-diagnosis \
  MLClassification/analyze_soil.py --output MLClassification/soil-analysis
docker run --rm --entrypoint python -v "$PWD/MLClassification:/work:ro" \
  -w /work plantclassifier:soil-diagnosis -m unittest -v test_pipeline
```

Las gráficas se generan con plot_soil.py en un entorno temporal con Matplotlib; no se añadieron dependencias a la aplicación.

## Evidencia adicional necesaria

Se necesitan mediciones de campo con sensor/calibración identificados, tipo de suelo, salinidad y textura, etapa de cultivo, zona, estación y resultados agronómicos observados; además de fuentes y código del generador sintético. Validar por sitio/campaña y evaluar/calibrar con muestras independientes que cubran condiciones húmedas y secas. No basta balancear el CSV o ampliar límites inventados. Un pH de potenciómetro demuestra el flujo técnico, no mide el pH real del suelo.

Referencias técnicas: [RandomForestClassifier](https://sklearn.org/1.7/modules/generated/sklearn.ensemble.RandomForestClassifier.html), [calibración de probabilidades](https://sklearn.org/stable/modules/calibration.html). Brier/log loss combinan discriminación y calibración; no son por sí solos una garantía de calibración.

## Archivos modificados en esta continuación

- `MLClassification/features.py`, `train.py`, `predict.py`, `model.pkl`, `evaluation.json`, `test_pipeline.py`: bosque regularizado, dominio embebido, abstención y pruebas.
- `MLClassification/analyze_soil.py`, `plot_soil.py`, `soil-analysis/`: experimentos reproducibles, respaldos, candidato, CSV, métricas y gráficas.
- `MLService.java`, `SensorDataService.java` y sus tests: conservar los cuatro argumentos, reconocer exclusivamente la señal de abstención y guardar estado/modelo. Nuevas capturas usan microsegundos para coincidir exactamente con PostgreSQL.
- `frontend/scripts.ts`, `frontend/sensors.test.mjs`, `static/js/scripts.js`, `static/index.html`: estados explícitos, identificación del modelo y protección contra respuestas obsoletas. No se rediseñó el dashboard.
- `scripts/smoke-docker.py`, `scripts/browser-e2e.mjs`: pruebas de valores fraccionarios, persistencia exacta, abstención y carreras del frontend.
- `README.md`, `docs/SETUP.md` y este informe: documentación actualizada.

No se modificaron DTO, migraciones, esquema, controles WASD, firmware ni CSV. Los cambios de esos archivos que aparecían al empezar eran preexistentes.

## Reconstruir únicamente la aplicación

```bash
docker compose -p plantclassifier-lab \
  --env-file .env.lab \
  -f docker-compose.yaml \
  -f docker-compose.simulation.yaml \
  -f /tmp/plantclassifier-sensor-real.yaml \
  up -d --build --no-deps --force-recreate --wait app
```

Si falta el override temporal, su contenido es:

```yaml
services:
  app:
    environment:
      ESP32_URL: ${ESP32_URL:?Set the sensor ESP32 address}
```

El movimiento continúa apuntando a `http://simulator:8081`; el sensor toma `ESP32_URL` de `.env.lab`. No usar `down -v`. Abrir `http://localhost:18080` y pulsar **Capture Data**. Con pH alrededor de 9,1 se espera una medición guardada sin cultivo, marcada fuera de dominio. Esto no indica que el transporte o el sensor de suelo hayan fallado.

## Pruebas ejecutadas

| Suite | Resultado | Evidencia local |
|---|---|---|
| Auditoría, barridos y comparación reproducible | OK; 144 entradas de barrido, baseline y candidato; 3 semillas | `MLClassification/soil-analysis/analysis.json` y CSV |
| Python de inferencia/entrenamiento sobre modelo v2 activo | 7/7 OK | `/tmp/soil-diagnosis-python-final.log` |
| Java + PostgreSQL desechable | 45 descubiertas; 44 ejecutadas, 0 fallos, 1 omitida | `/tmp/soil-diagnosis-java-final.log` |
| TypeScript y build frontend | OK | `npm run typecheck`, `npm run build` |
| Frontend | 18 controles + 21 sensores, todas OK | `npm test` |
| Simuladores | Sensor y movimiento OK | `/tmp/soil-diagnosis-simulator.log` |
| Docker build final | OK | `/tmp/soil-diagnosis-build-verified.log` |
| Smoke ampliado final | OK; predicción real, fracciones, dominio, pendiente, invalidez y persistencia exacta | `/tmp/soil-diagnosis-smoke-verified.log` |
| Playwright final | OK; 4 registros persistidos, recarga, errores, respuesta tardía y WASD | `/tmp/soil-diagnosis-browser-verified.log` |
| `git diff --check` | OK | ejecución local |

La omitida es `MovementLatencyTest`, benchmark optativo no ejecutado. Los primeros intentos de smoke/Playwright se lanzaron antes de terminar el build y fallaron por imagen inexistente; se repitieron después. El smoke posterior encontró una diferencia real de precisión de `capturedAt` (nanosegundos frente a microsegundos de PostgreSQL). Se corrigió el origen del timestamp y se mantuvo la aserción de igualdad completa, que finalmente pasó. No hay fallos pendientes en las suites finales.

## Despliegue y captura física final

Se recreó únicamente `plantclassifier-lab-app-1` con el comando anterior. Está healthy, usa `synthetic-five-crops-v2`, 200 árboles, min_samples_leaf=5 y el hash local verificado. Flyway V1–V6 siguen correctas; no hubo migraciones nuevas. Movimiento continúa simulado.

Los 103 registros preexistentes hasta id 692 permanecen idénticos en todas sus columnas: huella completa antes/después `48d3a204f83fb8c1876b3a1476040ad2`. No se eliminaron contenedores de PostgreSQL ni volúmenes de producción.

La captura física final (id 702) devolvió temperatura 26,7 °C, humedad ambiental 67,5 %, pH 9,08376 de potenciómetro y suelo 100 % con `soilStatus=calibrated`. Se guardó con modelo v2, `OUT_OF_DOMAIN`, `ml-out-of-domain` y predicción nula. La respuesta de captura coincidió exactamente con la recarga desde PostgreSQL. Tanto pH como suelo superan el dominio del entrenamiento; el porcentaje calibrado no implica soporte del modelo. El indicador `simulated=true` corresponde al pH de potenciómetro; DHT11 y suelo conservan su procedencia física.

Logs: `/tmp/soil-diagnosis-deploy.log`, `/tmp/soil-diagnosis-physical.log`, `/tmp/soil-diagnosis-history-before.txt`, `/tmp/soil-diagnosis-history-after.txt`. Se comprobaron hashes de dataset, firmware, cabeceras, `.env.lab`, controles y CSS antes/después. No hubo commit ni push. El informe previo FOUR_VARIABLE_VALIDATION.md se mantuvo como histórico, añadiendo un enlace a esta revisión.
