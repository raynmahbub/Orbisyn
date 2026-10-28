# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) from `1.0.0`
onwards; pre-1.0 versions may change any public contract.

## [Unreleased]

### Added

- Provider engine for GitHub, GitLab, Codeberg, Forgejo, F-Droid and direct
  downloads, with ordered reference detection and per-provider capability sets.
- Canonical `AppRecord` model with weighted health scoring, tolerant version
  comparison, artifact classification and `osp://` identity derivation.
- OSP presence documents (`orbisyn.json`, spec `1.0`): discovery, validation and
  verification against an independently resolved record.
- Gateway HTTP API: health, providers, catalogue, resolve, search, apps, releases,
  OSP lookup, collections, sync and update checks — all validated in both
  directions.
- Typed client SDK with zod-validated responses and mapped error envelopes.
- React PWA: home, search, resolution trace, app details, updates, library,
  providers, protocol and settings, with offline library storage in IndexedDB.
- Self-hosting: single process serving API and client, container image and compose
  file, and a documented environment schema.
- CI: lint, typecheck, tests, coverage thresholds, builds, CodeQL, dependency
  review, container publishing and nightly verification.
