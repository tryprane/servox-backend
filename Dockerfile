# Stage 1: Build the TypeScript app
FROM node:22 AS builder

WORKDIR /app

# Copy package files first (better caching)
COPY package*.json tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Compile TypeScript to JavaScript
RUN npm run build

# Stage 2: Run the app
FROM node:22

WORKDIR /app

COPY package*.json ./
RUN npm install

# Copy built JS files from builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/app.js"]