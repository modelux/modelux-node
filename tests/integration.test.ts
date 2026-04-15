/**
 * Integration tests — hit a real Modelux proxy.
 *
 * Required env vars:
 *   - MODELUX_API_KEY    Modelux API key (e.g. mlx_sk_...)
 *   - MODELUX_INTEGRATION=1   set to enable these tests
 *
 * Optional:
 *   - MODELUX_BASE_URL   defaults to https://api.modelux.ai/v1
 *   - MODELUX_MODEL      defaults to "@default"
 *
 * Run:
 *   MODELUX_INTEGRATION=1 MODELUX_API_KEY=mlx_sk_... npx vitest run tests/integration.test.ts
 */

import { describe, test, expect, beforeAll } from "vitest";
import { Modelux } from "../src/index";

const SKIP = !process.env.MODELUX_INTEGRATION;

describe.skipIf(SKIP)("integration", () => {
  let client: Modelux;
  let model: string;

  beforeAll(() => {
    const apiKey = process.env.MODELUX_API_KEY;
    model = process.env.MODELUX_MODEL || "@default";
    if (!apiKey) throw new Error("MODELUX_API_KEY not set");
    client = new Modelux({
      apiKey,
      baseURL: process.env.MODELUX_BASE_URL || "https://api.modelux.ai/v1",
    });
  });

  test("non-streaming completion returns content and metadata", async () => {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Say hello in exactly 3 words" }],
      max_tokens: 20,
    });

    expect(response.choices.length).toBeGreaterThan(0);
    expect(response.choices[0].message.content).toBeTruthy();
    expect(response.modelux.request_id).toBeTruthy();
    expect(response.modelux.provider_used).toBeTruthy();
    expect(response.modelux.model_used).toBeTruthy();
    expect(typeof response.modelux.cache_hit).toBe("boolean");
  }, 30_000);

  test("streaming completion delivers chunks and metadata", async () => {
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Count from 1 to 3" }],
      max_tokens: 30,
      stream: true,
    });

    // Metadata available immediately from response headers
    expect(stream.modelux.request_id).toBeTruthy();
    expect(stream.modelux.provider_used).toBeTruthy();
    expect(stream.modelux.model_used).toBeTruthy();

    const chunks: string[] = [];
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) chunks.push(delta);
    }

    expect(chunks.length).toBeGreaterThan(0);
    const text = chunks.join("");
    expect(text.length).toBeGreaterThan(0);
  }, 30_000);

  test("Modelux params are accepted without error", async () => {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Say ok" }],
      max_tokens: 5,
      userId: "integration-test-user",
      tags: { source: "integration_test", tier: "test" },
      traceId: "integration-trace-001",
      noCache: true,
    });

    expect(response.choices[0].message.content).toBeTruthy();
    expect(response.modelux.cache_hit).toBe(false); // noCache=true
  }, 30_000);

  test("routing config selector works", async () => {
    const response = await client.chat.completions.create({
      model: "@default",
      messages: [{ role: "user", content: "Say yes" }],
      max_tokens: 5,
    });

    expect(response.choices[0].message.content).toBeTruthy();
    expect(response.modelux.provider_used).toBeTruthy();
  }, 30_000);

  test("invalid API key returns auth error", async () => {
    const badClient = new Modelux({
      apiKey: "mlx_sk_invalid",
      baseURL: process.env.MODELUX_BASE_URL || "https://api.modelux.ai/v1",
    });

    await expect(
      badClient.chat.completions.create({
        model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      })
    ).rejects.toThrow();
  }, 10_000);
});
