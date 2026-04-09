# Changelog

## 0.2.0 - 2026-04-09

### Migration notes

- `getServicesList` is now compatibility-safe for both upstream payload shapes: legacy map (`{ [code]: name }`) and wrapped payload (`{ status, services: [{ code, name }] }`).
- `getServicesList` continues to return the canonical map output (`Record<string, string>`), regardless of upstream input shape.
- Duplicate wrapped `services` entries use deterministic merge semantics: last `code` wins.
- Malformed wrapped `services` items now fail fast with `SmsBowerParseError` code `MALFORMED_JSON`.
- The unsupported wallet endpoint has been removed from the SDK because the upstream action is invalid and returns `BAD_ACTION`; consumers should remove wallet endpoint calls during migration.
