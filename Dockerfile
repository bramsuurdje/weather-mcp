# Serves the MCP server on :5230 at /mcp. The widget is bundled from src/ when the server starts.
FROM oven/bun:1.4.4-alpine

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY tsconfig.json ./
COPY src ./src

USER bun
EXPOSE 5230
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO /dev/null http://127.0.0.1:5230/ || exit 1
CMD ["bun", "src/server.ts"]
