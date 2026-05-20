FROM eclipse-temurin:8-jdk AS build

WORKDIR /app
COPY src ./src

RUN mkdir -p out && \
  javac -encoding UTF-8 -d out $(find src -name '*.java')

FROM eclipse-temurin:8-jre

WORKDIR /app
COPY --from=build /app/out ./out

EXPOSE 8080

CMD ["java", "-cp", "/app/out", "com.tianditu.authbridge.AuthBridgeServer"]
