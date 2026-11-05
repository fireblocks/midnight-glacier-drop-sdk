FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Build TypeScript code
RUN npm run build

# Inside a container the server must listen on all interfaces for the published port
# to work. Exposure is restricted on the host side instead (127.0.0.1:8000:8000).
ENV HOST=0.0.0.0

# Expose API port
EXPOSE 8000

# Start the application
CMD ["node", "dist/app.js"]