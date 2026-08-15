# Use a lightweight Node.js base image
FROM node:20-slim

# Set working directory inside the container
WORKDIR /app

# Copy backend package files first (better layer caching)
COPY backend/package*.json ./backend/

# Install backend dependencies
WORKDIR /app/backend
RUN npm install --production

# Copy the rest of the project (backend + frontend)
WORKDIR /app
COPY backend ./backend
COPY frontend ./frontend

# Render sets the PORT env var automatically; server.js already reads it
EXPOSE 3000

WORKDIR /app/backend
CMD ["node", "server.js"]