# 0006 — Validate the response on the way out, not only the request on the way in

**Status:** accepted

## Context

Validating inbound requests is conventional. The interesting failures are upstream:
a forge changes a field, a field becomes `null`, a numeric id becomes a string. An
unvalidated payload flows into the store, then into a client that crashes rendering
it — sometimes days later, and on a device the developer does not own.

## Decision

`packages/contracts` holds one Zod schema per wire type, and both directions are
validated:

- **inbound**: bodies and query strings are parsed before use, producing
  `400 bad-request` with the offending path in `details`;
- **outbound**: responses are parsed with `parseOutbound(...)` before
  serialisation, producing `502 upstream-unavailable` with a readable message when
  a provider's mapper produced something the contract does not allow.

Types are inferred from the schemas (`z.infer`), so a validator and its type cannot
drift apart, and a conformance test renders every schema to JSON Schema to catch
schemas that cannot be represented.

## Consequences

- A provider bug becomes a clear failure at the edge, attributed to the provider
  that answered, instead of corrupt data at the client.
- Both directions cost CPU per request; the schemas are small and the alternative
  (trusting upstream) is the failure mode this record exists to prevent.
- Every new field means touching the schema first, which is a deliberate speed
  bump: it is the moment to ask whether the field belongs in the canonical model
  at all.
