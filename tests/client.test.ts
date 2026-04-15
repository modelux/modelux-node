import { describe, test, expect, vi } from "vitest";
import { Modelux, BudgetExceededError } from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function mockFetchForCompletion(
  completion: Record<string, unknown>,
  responseHeaders: Record<string, string> = {},
) {
  return vi.fn().mockResolvedValue(
    jsonResponse(completion, 200, responseHeaders),
  );
}

const SAMPLE_COMPLETION = {
  id: "chatcmpl-123",
  object: "chat.completion",
  created: 1700000000,
  model: "gpt-4o",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hello!" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

const SAMPLE_MODELUX_HEADERS: Record<string, string> = {
  "x-modelux-request-id": "req-abc-123",
  "x-modelux-provider-used": "openai",
  "x-modelux-model-used": "gpt-4o",
  "x-modelux-cache": "MISS",
};

function createClient(fetchFn: typeof fetch) {
  return new Modelux({
    apiKey: "mlx_sk_test",
    baseURL: "https://test.modelux.ai/v1",
    fetch: fetchFn,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Modelux client", () => {
  test("sends correct auth header", async () => {
    const fetchFn = mockFetchForCompletion(SAMPLE_COMPLETION, SAMPLE_MODELUX_HEADERS);
    const client = createClient(fetchFn);

    await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain("test.modelux.ai");
    expect(init.headers["authorization"]).toMatch(/^Bearer mlx_sk_test$/);
  });

  test("sends SDK version header", async () => {
    const fetchFn = mockFetchForCompletion(SAMPLE_COMPLETION, SAMPLE_MODELUX_HEADERS);
    const client = createClient(fetchFn);

    await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    });

    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers["x-modelux-sdk"]).toBe("typescript/0.1.0");
  });

  test("injects Modelux params as request headers", async () => {
    const fetchFn = mockFetchForCompletion(SAMPLE_COMPLETION, SAMPLE_MODELUX_HEADERS);
    const client = createClient(fetchFn);

    await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
      userId: "user_42",
      tags: { tier: "premium", cohort: "beta" },
      traceId: "trace-xyz",
      noCache: true,
      dryRun: true,
    });

    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers["x-modelux-user-id"]).toBe("user_42");
    expect(init.headers["x-modelux-user-tags"]).toBe("tier=premium,cohort=beta");
    expect(init.headers["x-modelux-trace-id"]).toBe("trace-xyz");
    expect(init.headers["cache-control"]).toBe("no-cache");
    expect(init.headers["x-modelux-dry-run"]).toBe("true");
  });

  test("does not inject Modelux params into request body", async () => {
    const fetchFn = mockFetchForCompletion(SAMPLE_COMPLETION, SAMPLE_MODELUX_HEADERS);
    const client = createClient(fetchFn);

    await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
      userId: "user_42",
      tags: { tier: "premium" },
    });

    const [, init] = fetchFn.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("tags");
    expect(body).toHaveProperty("model", "gpt-4o");
    expect(body).toHaveProperty("messages");
  });

  test("extracts Modelux metadata from response headers", async () => {
    const fetchFn = mockFetchForCompletion(SAMPLE_COMPLETION, SAMPLE_MODELUX_HEADERS);
    const client = createClient(fetchFn);

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(response.modelux.request_id).toBe("req-abc-123");
    expect(response.modelux.provider_used).toBe("openai");
    expect(response.modelux.model_used).toBe("gpt-4o");
    expect(response.modelux.cache_hit).toBe(false);
  });

  test("extracts cache hit metadata", async () => {
    const fetchFn = mockFetchForCompletion(SAMPLE_COMPLETION, {
      ...SAMPLE_MODELUX_HEADERS,
      "x-modelux-cache": "HIT",
      "x-modelux-cache-similarity": "0.9734",
    });
    const client = createClient(fetchFn);

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(response.modelux.cache_hit).toBe(true);
    expect(response.modelux.cache_similarity).toBeCloseTo(0.9734);
  });

  test("extracts A/B variant metadata", async () => {
    const fetchFn = mockFetchForCompletion(SAMPLE_COMPLETION, {
      ...SAMPLE_MODELUX_HEADERS,
      "x-modelux-ab-variant": "control",
    });
    const client = createClient(fetchFn);

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(response.modelux.ab_variant).toBe("control");
  });

  test("extracts budget metadata", async () => {
    const fetchFn = mockFetchForCompletion(SAMPLE_COMPLETION, {
      ...SAMPLE_MODELUX_HEADERS,
      "x-modelux-budget-name": "team-ml",
      "x-modelux-budget-remaining": "42.1500",
      "x-modelux-budget-action": "warn_only",
    });
    const client = createClient(fetchFn);

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(response.modelux.budget_name).toBe("team-ml");
    expect(response.modelux.budget_remaining).toBeCloseTo(42.15);
    expect(response.modelux.budget_action).toBe("warn_only");
  });

  test("preserves standard OpenAI response fields", async () => {
    const fetchFn = mockFetchForCompletion(SAMPLE_COMPLETION, SAMPLE_MODELUX_HEADERS);
    const client = createClient(fetchFn);

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(response.id).toBe("chatcmpl-123");
    expect(response.choices[0].message.content).toBe("Hello!");
    expect(response.model).toBe("gpt-4o");
  });
});

describe("BudgetExceededError", () => {
  test("throws BudgetExceededError on 402 with budget info", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            type: "budget_exceeded",
            message: 'budget "team-ml" exceeded ($105.00 / $100.00)',
            code: 402,
            budget: {
              name: "team-ml",
              spend_usd: 105.0,
              cap_usd: 100.0,
              period: "monthly",
              period_resets_at: "2026-05-01T00:00:00Z",
            },
          },
        },
        402,
        {
          "retry-after": "3600",
          "x-modelux-budget-name": "team-ml",
          "x-modelux-budget-action": "block",
          "x-modelux-budget-reset": "2026-05-01T00:00:00Z",
        },
      ),
    );

    const client = createClient(fetchFn);

    try {
      await client.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BudgetExceededError);
      const budgetErr = err as InstanceType<typeof BudgetExceededError>;
      expect(budgetErr.budget.name).toBe("team-ml");
      expect(budgetErr.budget.spend_usd).toBe(105.0);
      expect(budgetErr.budget.cap_usd).toBe(100.0);
      expect(budgetErr.budget.period).toBe("monthly");
      expect(budgetErr.retryAfter).toBe(3600);
    }
  });
});

describe("streaming", () => {
  test("returns ModeluxStream with metadata from headers", async () => {
    const chunks = [
      { id: "chatcmpl-1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "Hi" }, finish_reason: null }] },
      { id: "chatcmpl-1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "!" }, finish_reason: "stop" }] },
    ];

    const sseBody = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";

    const fetchFn = vi.fn().mockResolvedValue(
      new Response(sseBody, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-modelux-request-id": "req-stream-1",
          "x-modelux-provider-used": "anthropic",
          "x-modelux-model-used": "claude-sonnet-4-20250514",
          "x-modelux-cache": "MISS",
        },
      }),
    );

    const client = createClient(fetchFn);

    const stream = await client.chat.completions.create({
      model: "claude-sonnet-4-20250514",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    // Metadata available immediately from response headers
    expect(stream.modelux.request_id).toBe("req-stream-1");
    expect(stream.modelux.provider_used).toBe("anthropic");
    expect(stream.modelux.model_used).toBe("claude-sonnet-4-20250514");
    expect(stream.modelux.cache_hit).toBe(false);

    // Can iterate chunks
    const contents: string[] = [];
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) contents.push(delta);
    }
    expect(contents).toEqual(["Hi", "!"]);
  });
});
