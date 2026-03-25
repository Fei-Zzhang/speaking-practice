FROM node:20-alpine

WORKDIR /app

# Install server deps first for better layer caching
COPY server/package.json server/package-lock.json ./server/

RUN cd server && npm ci --omit=dev

# Copy server source
COPY server ./server/

EXPOSE 3003
ENV PORT=3003

CMD ["node", "server/server.js"]

