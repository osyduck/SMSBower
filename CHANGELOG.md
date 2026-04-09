# Changelog

## 0.3.0 - 2026-04-09

### Compatibility fixes

- `getCountries` now tolerates malformed upstream entries (for example `id: null`) by skipping invalid items when valid entries exist.
- `getPrices` now accepts country-first quote payloads like `{ "6": { "ot": { "cost": 0.21, "count": 53097 } } }` and normalizes them to canonical SDK shape.
- `getPricesV2` now accepts live bucket payloads like `{ "6": { "ot": { "0.004": 90, "0.21": 919 } } }`.
- `getPricesV3` now accepts provider quote objects that use `price` (in addition to `cost`) from live API responses.
- Added coverage in `test/core/client-transport.test.ts` for these live-compat response shapes.

## 0.2.0 - 2026-04-09

### Migration notes

- `getServicesList` is now compatibility-safe for both upstream payload shapes: legacy map (`{ [code]: name }`) and wrapped payload (`{ status, services: [{ code, name }] }`).
- `getServicesList` continues to return the canonical map output (`Record<string, string>`), regardless of upstream input shape.
- Duplicate wrapped `services` entries use deterministic merge semantics: last `code` wins.
- Wrapped `services` items with invalid `code`/`name` are ignored when valid entries exist; if no valid entries remain, the SDK throws `SmsBowerParseError` code `MALFORMED_JSON`.
- The unsupported wallet endpoint has been removed from the SDK because the upstream action is invalid and returns `BAD_ACTION`; consumers should remove wallet endpoint calls during migration.
