FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates \
    && python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p /app/data && chown -R node:node /app
USER node
CMD ["node", "src/index.js"]
