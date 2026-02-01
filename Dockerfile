# Use Node.js LTS as base image
FROM node:18-alpine

# Install pnpm
RUN npm install -g pnpm@latest

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy application source
COPY . .

# Build the application
RUN pnpm run build

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Expose port
EXPOSE 7788

# Set environment variables
ENV PORT=7788
ENV NODE_ENV=production

# Start the application
CMD ["pnpm", "start"]
