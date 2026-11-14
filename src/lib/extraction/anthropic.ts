import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ExtractionError, type ExtractionInput, type ExtractionProvider } from "./provider";
import { SYSTEM_PROMPT, userInstruction } from "./prompt";
import { extractionSchema, type RawExtraction } from "./schema";

export class AnthropicExtractionProvider implements ExtractionProvider {
  readonly name = "anthropic";
  private client = new Anthropic();
  private model = process.env.CLEARGATE_EXTRACTION_MODEL?.trim() || "claude-opus-5-5";

  async extract(input: ExtractionInput): Promise<RawExtraction> {
    try {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(extractionSchema) },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: [{ type: "text", text: userInstruction(input.document, input.maskedText) }] }],
      });

      if (response.stop_reason === "refusal") {
        throw new ExtractionError("refused", "The model declined to read this document.");
      }
      if (!response.parsed_output) {
        throw new ExtractionError("providerFailed", `No structured output (stop_reason: ${response.stop_reason}).`);
      }
      return response.parsed_output;
    } catch (error) {
      if (error instanceof ExtractionError) throw error;
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        throw new ExtractionError("notConfigured", "The extraction provider rejected the configured credentials.");
      }
      if (error instanceof Anthropic.APIError) {
        throw new ExtractionError("providerFailed", `Provider error ${error.status ?? ""}`.trim());
      }
      throw new ExtractionError("providerFailed", "Extraction request failed.");
    }
  }
}
