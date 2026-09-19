# =========================
# 1. BUILD SPRING BOOT APP
# =========================
FROM eclipse-temurin:21-jdk AS build

WORKDIR /app

COPY .mvn/ .mvn
COPY mvnw pom.xml ./

RUN chmod +x mvnw
RUN ./mvnw dependency:go-offline

COPY src ./src

RUN ./mvnw clean package -DskipTests


# =========================
# 2. RUN APPLICATION
# =========================
FROM eclipse-temurin:21-jre

WORKDIR /app

# Install Python and pip
RUN apt-get update \
    && apt-get install -y python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Copy Spring Boot jar
COPY --from=build /app/target/*.jar app.jar

# Copy ML files
COPY MLClassification ./MLClassification

# Install Python ML dependencies
RUN pip3 install --no-cache-dir --break-system-packages \
    -r MLClassification/requirements.txt

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]