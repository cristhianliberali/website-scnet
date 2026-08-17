# syntax=docker/dockerfile:1

# ---- Build stage --------------------------------------------------------
FROM oven/bun:1 AS build
WORKDIR /app

# VITE_* vars are inlined into the client bundle at build time, so they must
# be passed as build args (EasyPanel: set these under "Build Args", not just
# "Environment Variables"). Leave any you don't use yet blank.
ARG VITE_SITE_URL
ARG VITE_RECAPTCHA_SITE_KEY
ARG VITE_FACEBOOK_PIXEL_ID
ARG VITE_WHATSAPP_NUMBER
ENV VITE_SITE_URL=$VITE_SITE_URL \
    VITE_RECAPTCHA_SITE_KEY=$VITE_RECAPTCHA_SITE_KEY \
    VITE_FACEBOOK_PIXEL_ID=$VITE_FACEBOOK_PIXEL_ID \
    VITE_WHATSAPP_NUMBER=$VITE_WHATSAPP_NUMBER

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ---- Runtime stage --------------------------------------------------------
# Nitro's node-server preset bundles the whole server into .output/server —
# no node_modules or package.json needed at runtime, just plain Node.
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Server-only secrets (recaptcha, Facebook CAPI, webhooks, Supabase, Postgres)
# are read from process.env at runtime — set them as regular EasyPanel
# environment variables on the service, not build args. The Supabase vars have
# no VITE_ prefix on purpose: the browser never talks to Supabase, so nothing
# about it belongs in the client bundle.

COPY --from=build /app/.output ./.output

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
