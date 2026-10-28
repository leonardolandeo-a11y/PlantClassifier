FROM node:24-bookworm-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY frontend ./frontend
COPY scripts ./scripts
COPY tsconfig.json ./
COPY src/main/resources/static/index.html ./src/main/resources/static/index.html
COPY src/main/resources/templates ./src/main/resources/templates
RUN npm run typecheck && npm test && npm run build

FROM eclipse-temurin:21-jdk-noble AS build
WORKDIR /app
# Use authenticated transport for repository indexes; keep APT signature/hash checks.
RUN sed -i 's|http://|https://|g' /etc/apt/sources.list.d/ubuntu.sources \
    && apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw dependency:go-offline
COPY src ./src
COPY --from=frontend /app/src/main/resources/static ./src/main/resources/static
# H2 and fake-device tests require no production credentials or hardware.
RUN ./mvnw -B verify

FROM eclipse-temurin:21-jre-noble
WORKDIR /app
# Use authenticated transport for repository indexes; keep APT signature/hash checks.
RUN sed -i 's|http://|https://|g' /etc/apt/sources.list.d/ubuntu.sources \
    && apt-get update && apt-get install -y --no-install-recommends ca-certificates python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
COPY MLClassification/requirements.txt ./MLClassification/requirements.txt
RUN python -m pip install --no-cache-dir -r MLClassification/requirements.txt
COPY MLClassification/predict.py MLClassification/features.py MLClassification/model.pkl ./MLClassification/
RUN python MLClassification/predict.py 25 60 7
COPY --from=build /app/target/*.jar ./app.jar
RUN useradd --system --uid 10001 app
USER 10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
