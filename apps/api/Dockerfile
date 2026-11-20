# syntax=docker/dockerfile:1.7
# Imagen de producción de voip-manager: API Fastify + frontend compilado servido desde la misma API.
# Construir desde la raíz del repositorio: docker build -f apps/api/Dockerfile -t voip-manager-api .

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build -w @voip-manager/shared \
 && npm run build -w @voip-manager/api \
 && npm run build -w @voip-manager/web

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
# ffmpeg: conversión de MP3/OGG a WAV para música en espera (opcional pero útil).
RUN apk add --no-cache ffmpeg tini
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/web/dist apps/web/dist
WORKDIR /app/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
