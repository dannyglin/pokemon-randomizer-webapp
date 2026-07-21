# Build context is the monorepo root (see infra/docker-compose.yml).

# --- Vendor stage: fetch the official, unmodified randomizer release and
# compile our settings shim against it. Pin both the randomizer release and
# the JSON library by tag/version + sha256, verified before use. Bump
# RANDOMIZER_VERSION deliberately (and regenerate java-shim/settings-schema.json
# + SettingsBuilder.java via `node java-shim/generate-shim.mjs`) rather than
# tracking upstream automatically.
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
# javac only emits .class files for the sources we compile, not org.json's —
# so settings-shim.jar is built as a fat jar (our compiled class + org.json's
# unpacked classes) to keep the runtime classpath to just two jars (see
# packages/shared/src/config.ts randomizerJarPath/settingsShimJarPath and
# apps/worker/src/lib/randomize.ts).
RUN mkdir -p /vendor/out \
    && javac -cp "/opt/randomizer/PokeRandoZX.jar:/opt/randomizer/json.jar" -d /vendor/out $(find /vendor/src -name '*.java') \
    && cd /vendor/out && jar xf /opt/randomizer/json.jar && rm -rf META-INF \
    && jar cf /opt/randomizer/settings-shim.jar -C /vendor/out .

# --- Node build stage
FROM node:20-slim AS build
WORKDIR /repo
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
RUN npm install
COPY packages/shared packages/shared
COPY apps/worker apps/worker
RUN npm run build -w packages/shared && npm run build -w apps/worker

# --- Runtime
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jre-headless && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/package.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/apps/worker/dist ./apps/worker/dist
COPY --from=build /repo/apps/worker/package.json ./apps/worker/package.json
COPY --from=vendor /opt/randomizer /opt/randomizer

RUN useradd --system --create-home randomizer
USER randomizer

CMD ["node", "apps/worker/dist/index.js"]
