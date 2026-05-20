FROM maven:3.9.9-eclipse-temurin-8 AS build

WORKDIR /app
COPY pom.xml ./
COPY src ./src
COPY vendor ./vendor

RUN mvn -q -DskipTests package

FROM eclipse-temurin:8-jre

WORKDIR /app
COPY --from=build /app/target/auth-bridge-official-0.1.0.jar /app/app.jar

EXPOSE 8081

CMD ["java", "-jar", "/app/app.jar"]
