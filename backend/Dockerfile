# Stage 1: Build & Dependencies
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Final Production Image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy built node_modules and source files
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY reminder-job.js ./

# Use non-root user for container security
USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
