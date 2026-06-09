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
# prisma.config.ts is required by the Prisma 7 CLI at runtime — `prisma db push`
# reads `datasource.url` from it. Without this file the CLI errors with
# "The datasource.url property is required in your Prisma config file".
COPY --from=builder /app/prisma.config.ts ./
# Prisma 7 generated client lives in src/generated/prisma and is bundled into
# the standalone server output by Next. The Prisma CLI is needed at runtime for
# `prisma db push`. It is installed *locally* (not -g) so that prisma.config.ts's
# `import "prisma/config"` resolves against ./node_modules at startup — a global
# install leaves that bare specifier unresolvable. dotenv is loaded best-effort
# by the config; DATABASE_URL is injected via compose env.
RUN npm install prisma@7
EXPOSE 3000
CMD ["node", "server.js"]
