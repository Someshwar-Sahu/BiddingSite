FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install build dependencies for better-sqlite3 and native modules
RUN apk add --no-cache python3 make g++

# Copy package definitions
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy full application source
COPY . .

# Build both TypeScript backend and compiled Vite frontend bundles
RUN npm run build:all

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start NexTrade Auctions Engine
CMD ["node", "dist/index.js"]

