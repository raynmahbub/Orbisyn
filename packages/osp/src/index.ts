/**
 * @orbisyn/osp — the Open Source Presence protocol.
 *
 * Three responsibilities, all of them portable:
 *
 * 1. **Identity** — canonicalisation of `osp://` URIs (re-exported from the
 *    contracts package, which owns the wire format).
 * 2. **Presence** — discovering, parsing and validating `orbisyn.json`.
 * 3. **Verification** — cross-checking a published document against an
 *    independently resolved record.
 */

export type { OspDocument, OspResolution, OspSource } from '@orbisyn/contracts';
export {
  OSP_DOCUMENT_FILENAME,
  OSP_SPEC_VERSION,
  OSP_URI_SCHEME,
  OspDocumentSchema,
  OspResolutionSchema,
  OspSourceSchema,
  ospUriForId,
} from '@orbisyn/contracts';
// Identity rules come from the domain, so `osp://github.com/a/b` and
// `osp://a-b` canonicalise to exactly the same URI everywhere in Orbisyn.
export { canonicalOspUri, isOspUri, ospIdFromUri } from '@orbisyn/core';
export * from './document.js';
export * from './raw.js';
