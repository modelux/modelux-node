# @modelux/sdk

TypeScript SDK for the Modelux LLM proxy. Wraps the OpenAI SDK with Modelux-specific extensions for routing, budgets, caching, and observability.

## Install

```bash
npm install @modelux/sdk openai
```

Requires Node 18+ (native `fetch`). `openai` is a peer dependency.

## Quick start

```typescript
import { Modelux } from "@modelux/sdk";

const client = new Modelux({ apiKey: "mlx_sk_..." });

const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});

console.log(response.choices[0].message.content);
console.log(response.modelux.provider_used);  // "openai"
console.log(response.modelux.cost_usd);
```

## Modelux extensions

Pass Modelux-specific parameters alongside standard OpenAI params:

```typescript
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],

  // Modelux extensions
  userId: "user_123",                    // end-user tracking
  tags: { tier: "premium", team: "ml" }, // routing & analytics tags
  traceId: "req-abc-123",               // distributed tracing
  noCache: true,                         // skip semantic cache
  dryRun: true,                          // routing evaluation only, no LLM call
});
```

These are mapped to `X-Modelux-*` request headers automatically.

## Response metadata

Every response includes a `.modelux` object with metadata extracted from response headers:

```typescript
response.modelux.request_id     // unique request ID
response.modelux.provider_used  // "openai", "anthropic", etc.
response.modelux.model_used     // actual model that served the request
response.modelux.cache_hit      // true if served from semantic cache
response.modelux.cache_similarity // cosine similarity (on cache hits)
response.modelux.ab_variant     // A/B test variant label
response.modelux.budget_name    // matching budget name
response.modelux.budget_remaining // USD remaining in budget period
response.modelux.budget_action  // "block", "downgrade", or "warn_only"
```

## Streaming

```typescript
const stream = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
  stream: true,
  userId: "user_123",
});

// Metadata available immediately from response headers
console.log(stream.modelux.provider_used);

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}
```

## Budget errors

When a request is blocked by budget enforcement, the SDK throws a typed `BudgetExceededError`:

```typescript
import { BudgetExceededError } from "@modelux/sdk";

try {
  await client.chat.completions.create({ ... });
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.log(err.budget.name);       // "team-ml"
    console.log(err.budget.spend_usd);  // 105.00
    console.log(err.budget.cap_usd);    // 100.00
    console.log(err.budget.period);     // "monthly"
    console.log(err.retryAfter);        // seconds until budget resets
  }
}
```

## Configuration

```typescript
const client = new Modelux({
  apiKey: "mlx_sk_...",                    // required
  baseURL: "https://api.modelux.ai/v1",  // default
  timeout: 60_000,                         // ms, default 60s
  maxRetries: 2,                           // retry on 429/5xx, default 2
  fetch: customFetch,                      // custom fetch for testing/edge runtimes
  defaultHeaders: { "X-Custom": "value" }, // extra headers on every request
});
```

## Routing configs

Use the `@config-name` selector to route through a named routing config:

```typescript
const response = await client.chat.completions.create({
  model: "@production",  // uses the "production" routing config
  messages: [{ role: "user", content: "Hello" }],
});
```

## Using with AI assistants

If you're using Claude (or another agent harness that supports Skills), install the official Modelux Skill so your assistant has built-in knowledge of our APIs, MCP tools, and routing config schema:

```bash
curl -fsSL https://modelux.ai/skill/install.sh | sh
```

## License

MIT — see [LICENSE](./LICENSE).
