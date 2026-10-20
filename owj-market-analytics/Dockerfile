FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY dashboard ./dashboard
COPY public ./public
COPY schemas ./schemas
COPY scripts ./scripts
COPY src ./src

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production \
    ANALYTICS_HOST=0.0.0.0 \
    ANALYTICS_PORT=4567 \
    ANALYTICS_AUTO_CRAWL=true \
    ANALYTICS_HEADLESS=true

EXPOSE 4567

STOPSIGNAL SIGTERM

CMD ["npm", "start"]
