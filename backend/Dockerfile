# Build the API from source and run it as an unprivileged user on a JRE-only image.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 --create-home padav
USER padav
WORKDIR /app
COPY --from=build /src/target/*.jar app.jar
EXPOSE 8080
# TieredStopAtLevel=1 keeps the JIT at its quick first tier. On a small instance that is what the free plan
# gives, it roughly halved the time to "Started" (measured 12-23 s -> 6.5 s on one core, first request
# 0.6 s -> 0.2 s), and start-up is the whole of the wait after the container has slept. The cost is lower peak
# throughput, which a desk of a few people never reaches; drop the flag when the service moves to a plan with
# more than one CPU and no sleep.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-XX:TieredStopAtLevel=1", "-jar", "app.jar"]
