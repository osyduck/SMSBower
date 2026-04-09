# smsbower

TypeScript SDK for the SMSBower handler API, scoped to **Node.js 18+**.

## Runtime scope

This package is for Node.js only. Browser runtimes are not supported.

## Install

```bash
npm install smsbower
```

## Configuration

`createSmsBowerClient` accepts:

- `apiKey` (required)
- `baseUrl` (optional, defaults to the SMSBower handler endpoint)
- `timeoutMs` (optional)
- `userAgent` (optional)

## Initialize client

```ts
import { createSmsBowerClient } from "smsbower";

const client = createSmsBowerClient({
  apiKey: process.env.SMSBOWER_API_KEY!,
  timeoutMs: 15_000,
});
```

## Core endpoint usage

```ts
import { createSmsBowerClient } from "smsbower";

const client = createSmsBowerClient({ apiKey: process.env.SMSBOWER_API_KEY! });

const balance = await client.getBalance();
const services = await client.getServicesList();
const countries = await client.getCountries();

const prices = await client.getPrices({ service: "ot", country: 6 });
const pricesV2 = await client.getPricesV2({ service: "ot", country: 6 });
const pricesV3 = await client.getPricesV3({ country: 6, service: "ot", providerIds: [2295, 3027] });

console.log(balance.token, Object.keys(services.value).length);
console.log(Object.keys(countries.value).length, prices.value, pricesV2.value, pricesV3.value);
```

## Activation endpoint usage

```ts
import { createSmsBowerActivationEndpoints, createSmsBowerClient } from "smsbower";

const client = createSmsBowerClient({ apiKey: process.env.SMSBOWER_API_KEY! });
const activation = createSmsBowerActivationEndpoints(client);

const number = await activation.getNumber({ service: "ot", country: 6, providerIds: [2295, 3027] });
const status = await activation.getStatus({ activationId: number.activationId });
const lifecycle = await activation.setStatus({ activationId: number.activationId, status: 1 });

console.log(number.phoneNumber, status.token, lifecycle.token);
```

## Error handling

```ts
import {
  SmsBowerApiError,
  SmsBowerParseError,
  SmsBowerTransportError,
  createSmsBowerClient,
} from "smsbower";

const client = createSmsBowerClient({ apiKey: process.env.SMSBOWER_API_KEY! });

try {
  await client.getBalance();
} catch (error) {
  if (error instanceof SmsBowerApiError) {
    console.error("API rejected the request", { code: error.code, token: error.token });
  } else if (error instanceof SmsBowerParseError) {
    console.error("Response could not be parsed", { code: error.code, token: error.token });
  } else if (error instanceof SmsBowerTransportError) {
    console.error("Transport failed", { code: error.code, status: error.status });
  } else {
    throw error;
  }
}
```

## Migration notes (0.2.0)

- `getServicesList` now accepts both response input shapes:
  - legacy map: `{ [code]: name }`
  - wrapped payload: `{ status, services: [{ code, name }] }`
- The SDK always normalizes `getServicesList` output to the canonical map shape (`Record<string, string>`) in `services.value`.
- For wrapped payload duplicates, the last item for a given `code` wins.
- Wrapped `services` items with invalid `code`/`name` are ignored when valid entries exist; if no valid entries remain, the SDK throws `SmsBowerParseError` with code `MALFORMED_JSON`.
- The unsupported wallet endpoint was removed because the upstream action is invalid (`BAD_ACTION`); migrate by removing wallet endpoint usage from consumer code.

## Compatibility notes (0.3.0)

- `getCountries` skips malformed upstream entries when valid country rows still exist.
- `getPrices` supports country-first quote payloads from live API and normalizes to canonical SDK output.
- `getPricesV2` supports live bucket-map payloads (`price -> count`).
- `getPricesV3` accepts provider quote objects using `price` as well as `cost`.

## Local quality gates

```bash
npm run lint
npm run typecheck
npm run typecheck:contracts
npm test
npm run build
npm run pack:check
```

Integration tests are opt-in and env-gated:

```bash
npm run test:integration
```

Set these vars when you want live integration checks:

- `SMSBOWER_API_KEY`
- `SMSBOWER_SERVICE`
- `SMSBOWER_COUNTRY`
- `SMSBOWER_PROVIDER_IDS`

## License

MIT
