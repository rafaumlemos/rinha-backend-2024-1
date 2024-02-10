FROM node:20-alpine

COPY . .
RUN npm ci

CMD ["node", "index.js"]