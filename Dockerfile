FROM node:20-alpine AS builder
WORKDIR /app
# Copy manifest + Prisma schema/config first so the `postinstall` hook
# (`prisma generate`) can find the schema during `npm ci`.
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
# Prisma 7 generated client lives in src/generated/prisma and is bundled into
# the standalone server output by Next. The Prisma CLI is needed at runtime for
# `prisma migrate deploy`.
RUN npm install -g prisma@7
EXPOSE 3000
CMD ["node", "server.js"]
