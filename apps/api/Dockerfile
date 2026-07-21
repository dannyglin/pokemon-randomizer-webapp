# Build context is the monorepo root (see infra/docker-compose.yml).
FROM node:20-slim AS build
WORKDIR /repo
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm install
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w packages/shared && npm run build -w apps/api

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/package.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
# Static, checked-in schema (regenerated via `node java-shim/generate-shim.mjs`
# whenever the vendored randomizer version changes — see docs spec §4).
COPY java-shim/settings-schema.json /opt/randomizer/settings-schema.json

EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
