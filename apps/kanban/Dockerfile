FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN mkdir -p db
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
