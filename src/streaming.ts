import type OpenAI from "openai";
import type { Stream } from "openai/streaming";
import type { ModeluxMetadata } from "./types.js";

/**
 * Wraps an OpenAI streaming response, exposing Modelux metadata
 * extracted from the initial response headers.
 *
 * Implements AsyncIterable so it can be used in `for await...of` loops.
 */
export class ModeluxStream
  implements AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
{
  /** Modelux metadata extracted from response headers. Available immediately. */
  readonly modelux: ModeluxMetadata;

  private stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>;

  constructor(
    stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>,
    metadata: ModeluxMetadata,
  ) {
    this.stream = stream;
    this.modelux = metadata;
  }

  [Symbol.asyncIterator](): AsyncIterator<OpenAI.Chat.Completions.ChatCompletionChunk> {
    return this.stream[Symbol.asyncIterator]();
  }

  /**
   * Abort the streaming response.
   */
  abort(): void {
    this.stream.controller.abort();
  }
}
