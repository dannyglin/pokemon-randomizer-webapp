# Build context is the monorepo root (see infra/docker-compose.yml).

# --- Vendor stage: same as apps/worker/Dockerfile's vendor stage — api
# needs the shim too, to synchronously import/export a settings file
# outside the job pipeline (parsing/writing one is fast, unlike a full
# randomization run, so it doesn't need the job queue). Keep these ARGs in
# sync with apps/worker/Dockerfile when bumping the vendored version.
FROM eclipse-temurin:17-jdk-jammy AS vendor
ARG RANDOMIZER_VERSION=v4.6.1
ARG RANDOMIZER_ZIP_NAME=PokeRandoZX-v4_6_1.zip
ARG RANDOMIZER_ZIP_SHA256=26051fe8a6665ea0582dfcd4d1c3e4889da42a2f731f5fc530fff0cb691a43fd
ARG JSON_LIB_VERSION=20250517
ARG JSON_LIB_SHA256=3ea61b2a06e31edf1c91134fe9106b0ebb16628be169f3db75bc7a2b06b45796
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /vendor
RUN curl -sL -o randomizer.zip "https://github.com/Ajarmar/universal-pokemon-randomizer-zx/releases/download/${RANDOMIZER_VERSION}/${RANDOMIZER_ZIP_NAME}" \
    && echo "${RANDOMIZER_ZIP_SHA256}  randomizer.zip" | sha256sum -c - \
    && unzip -j randomizer.zip PokeRandoZX.jar -d /opt/randomizer

RUN curl -sL -o /opt/randomizer/json.jar "https://repo1.maven.org/maven2/org/json/json/${JSON_LIB_VERSION}/json-${JSON_LIB_VERSION}.jar" \
    && echo "${JSON_LIB_SHA256}  /opt/randomizer/json.jar" | sha256sum -c -

COPY java-shim/src /vendor/src
RUN mkdir -p /vendor/out \
    && javac -cp "/opt/randomizer/PokeRandoZX.jar:/opt/randomizer/json.jar" -d /vendor/out $(find /vendor/src -name '*.java') \
    && cd /vendor/out && jar xf /opt/randomizer/json.jar && rm -rf META-INF \
    && jar cf /opt/randomizer/settings-shim.jar -C /vendor/out .

# --- Node build stage
FROM node:20-slim AS build
WORKDIR /repo
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm install
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w packages/shared && npm run build -w apps/api

# --- Runtime
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jre-headless && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/package.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=vendor /opt/randomizer/PokeRandoZX.jar /opt/randomizer/PokeRandoZX.jar
COPY --from=vendor /opt/randomizer/settings-shim.jar /opt/randomizer/settings-shim.jar
# Static, checked-in schema (regenerated via `node java-shim/generate-shim.mjs`
# whenever the vendored randomizer version changes — see docs spec §4).
COPY java-shim/settings-schema.json /opt/randomizer/settings-schema.json

EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
