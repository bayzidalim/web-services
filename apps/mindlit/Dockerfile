FROM node:18-alpine

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package files first to leverage Docker cache
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy application code
COPY . .

# Ensure the non-root user has ownership of the application directory
# This is crucial for SQLite to be able to create the database file
RUN chown -R node:node /app

# Set environment variable for the port
ENV PORT=8080

# Expose the application port
EXPOSE 8080

# Use non-root user for security
USER node

CMD ["npm", "start"]
