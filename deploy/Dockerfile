# syntax=docker/dockerfile:1
# One image for the shop server: API, worker, web and the migration job (different commands).
# Built on the shop PC by deploy/windows/install.ps1; no registry needed.
FROM node:22-bookworm AS build
ENV NEXT_TELEMETRY_DISABLED=1 CI=true
RUN corepack enable
WORKDIR /repo
COPY . .
# Mobile apps are excluded by .dockerignore; drop them from the workspace so the lockfile install
# only resolves server packages.
# Optional build secret "extra_ca": an extra CA certificate for networks behind a TLS-inspecting
# proxy. It is used only during this step and never stored in the image. Not needed on the shop PC.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi \
 && pnpm install --frozen-lockfile --filter "@erp/api..." --filter "@erp/worker..." --filter "@erp/web-erp..." \
 && pnpm turbo run build --filter=@erp/api --filter=@erp/worker --filter=@erp/web-erp

# Full Debian image (not -slim): it ships the openssl binary Prisma uses to pick its engine, so no
# package download is needed at build time.
FROM node:22-bookworm AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY --from=build --chown=node:node /repo /repo
USER node
# Default command; docker-compose.prod.yml sets one per service.
CMD ["node", "apps/api/dist/main.js"]
