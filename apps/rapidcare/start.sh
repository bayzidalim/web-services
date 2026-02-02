#!/bin/sh
set -e

# Run migrations
echo "Running database migrations..."
npm run migrate

# Start the application
echo "Starting application..."
exec npm start
