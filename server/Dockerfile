FROM node:20-alpine AS builder
WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci

COPY server ./
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ttf-freefont

COPY --from=builder /app/server/package*.json ./
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/assets ./assets
COPY skills ./skills

RUN mkdir -p /app/uploads
RUN mkdir -p /app/share

ENV THUMBNAIL_CHROMIUM_PATH=/usr/bin/chromium

EXPOSE 3000
CMD ["node", "dist/index.js"]
