# Stage 1 — install production dependencies (needs build tools for native modules)
FROM node:24-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2 — runtime
FROM node:24-slim AS production

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5000

# Tell uv to install a musl-compatible Python for Alpine
ENV UV_PYTHON_PREFERENCE=only-managed
ENV UV_PYTHON=3.12

# Install Python + dependencies into a venv at a known location
COPY pyproject.toml uv.lock ./
RUN uv python install && \
    uv sync --frozen --no-dev

# Make the venv's binaries and packages available
ENV PATH="/app/.venv/bin:$PATH"
ENV VIRTUAL_ENV="/app/.venv"

# Copy Python service
COPY python_service ./python_service

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

CMD ["node", "dist/index.cjs"]