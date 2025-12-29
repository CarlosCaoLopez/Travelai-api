# ================================
# Stage 1: Builder
# ================================
FROM node:22-alpine AS builder

# Install pnpm globally
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files and Prisma schema first (for layer caching)
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

# Install ALL dependencies (including dev deps needed for build)
RUN pnpm install --frozen-lockfile

# Generate Prisma Client (needed for TypeScript build)
RUN pnpm prisma generate

# Copy source code and build configs
COPY src ./src
COPY tsconfig.json tsconfig.build.json nest-cli.json ./

# Build the NestJS application
RUN pnpm build

# ================================
# Stage 2: Runtime
# ================================
FROM node:22-alpine AS runtime

# Install system dependencies FIRST (critical for sharp and other native modules)
RUN apk add --no-cache libc6-compat

# Install pnpm globally
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files and Prisma schema
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

# Install ONLY production dependencies
RUN pnpm install --prod --frozen-lockfile

# Install prisma CLI temporarily for client generation
RUN pnpm add -D prisma

# CRITICAL: Regenerate Prisma Client for production node_modules
RUN pnpm prisma generate

# Remove prisma CLI to keep image lean (client is already generated)
RUN pnpm remove prisma

# Copy compiled application from builder
COPY --from=builder /app/dist ./dist

# Set environment to production
ENV NODE_ENV=production

# Expose API port
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"]
