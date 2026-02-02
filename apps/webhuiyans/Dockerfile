# Use the official Node.js 20 image (LTS)
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy package definition files
COPY package*.json ./

# Install production dependencies
# "npm ci" is faster and more reliable for CI/CD environments
RUN npm ci --omit=dev

# Copy the rest of the application code
COPY . .

# Expose the port (Fly.io usually defaults to 8080 or sets PORT env var)
# We expose 3000 as a fall back documentation, but the app uses process.env.PORT
EXPOSE 8080

# Define the command to run the app
CMD [ "npm", "start" ]
