# 0003 — The gateway serves the client and the API from one origin

**Status:** accepted

## Context

A conventional split — static hosting for the client, a separate API host — costs a
CORS policy, a cookie/credential story, a proxy or a rewritten base URL, and two
deployables that can be out of sync. Every one of those is a class of bug that
appears in production and never in development.

## Decision

One Node process serves the API under `/api` and the built web client from every
other path, including the SPA fallback so a deep link like `/apps/bitwarden-android`
returns the shell. The client calls relative `/api` paths only. In development the
Vite server proxies `/api` to the gateway, so the same single-origin shape holds
while developing.

CORS support exists but is off by default; it is for a client genuinely served
elsewhere.

## Consequences

- A deployment is `npm run start` or one container, on one port, with no reverse
  proxy to configure.
- The prefix is a hard rule: pages own `/`, resources own `/api`, and neither can
  shadow the other. Exactly one not-found handler exists, because two would
  silently shadow each other.
- The web client cannot be deployed to a dumb static host on its own; it needs the
  gateway next to it. That is the trade we accepted for removing a whole class of
  configuration bugs.
- Security headers (helmet) and the frame guard are configured once, for the origin
  that serves both.
