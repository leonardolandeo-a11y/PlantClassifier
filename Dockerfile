# =========================
# 1. BUILD SPRING BOOT APP
# =========================
FROM eclipse-temurin:21-jdk-noble AS build

WORKDIR /app

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw
RUN ./mvnw dependency:go-offline

COPY src ./src
RUN ./mvnw clean package -DskipTests

# =========================
# 2. RUN APPLICATION
# =========================
FROM eclipse-temurin:21-jre-noble

WORKDIR /app

# Install Python via HTTPS Ubuntu repositories.
# HTTPS helps avoid stale HTTP caches, but network/repository errors may still occur.
RUN sed -i \
    -e 's|http://archive.ubuntu.com|https://archive.ubuntu.com|g' \
    -e 's|http://security.ubuntu.com|https://security.ubuntu.com|g' \
    /etc/apt/sources.list.d/ubuntu.sources \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get -o Acquire::Retries=3 update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        python3 \
        python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Isolated virtual environment inside Docker (not the laptop's .venv).
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

# Install Python dependencies independently of ML source changes.
COPY MLClassification/requirements.txt ./MLClassification/requirements.txt
RUN python -m pip install --no-cache-dir -r MLClassification/requirements.txt

# Copy scripts and model.pkl, but never the local .venv (see .dockerignore).
COPY MLClassification/ ./MLClassification/

COPY --from=build /app/target/*.jar ./app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]