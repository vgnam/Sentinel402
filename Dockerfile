FROM node:22.18.0-slim
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /app/data && chown node:node /app/data
USER node
# The service intentionally binds loopback. Run a TLS/auth proxy in the same
# network namespace; do not expose local demo mode to a public interface.
ENV PORT=4020
CMD ["node", "src/server.mjs"]
