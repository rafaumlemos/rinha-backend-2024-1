FROM node:20-alpine

RUN corepack enable
RUN corepack prepare pnpm@latest --activate

COPY . .
RUN pnpm install

CMD ["node", "index.js"]