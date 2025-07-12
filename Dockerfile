# Use official Node.js slim image
FROM node:23.11.0-slim

# Set working directory
WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies including devDependencies (needed for build)
RUN npm install

# Copy the rest of the application
COPY . .

# Build the NestJS app using local CLI
RUN npx nest build

# Expose the port used by Cloud Run
EXPOSE 8080

# Start the app
CMD ["node", "dist/main.js"]