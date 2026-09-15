import type { ProviderSettings } from "./settings.js";

/**
 * Browser-side LLM client for the "preview an agent on your repo" feature.
 *
 * The user's key is used directly from settings (never stored server-side —
 * there IS no server). Providers are called from the browser; Anthropic
 * requires the anthropic-dangerous-direct-browser-access header, and Google's
 * generative API allows CORS. OpenAI-compatible endpoints (including
 * OpenRouter and self-hosted gateways) work when the endpoint allows CORS.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCallResult {
  text: string;
  warnings: string[];
}

function openAiCompatibleBase(provider: ProviderSettings): string | null {
  switch (provider.provider) {
    case "openai":
      return "https://api.openai.com/v1";
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "custom":
      return (provider.baseUrl ?? "").replace(/\/$/, "") || null;
    default:
      return null;
  }
}

export async function callModel(provider: ProviderSettings, messages: ChatMessage[], maxTokens = 2048): Promise<LlmCallResult> {
  if (!provider.apiKey) {
    throw new Error("No API key configured. Open Settings and add your provider key.");
  }
  const warnings: string[] = [];

  // --- OpenAI-compatible (openai, openrouter, custom) -----------------------
  const base = openAiCompatibleBase(provider);
  if (base) {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({ model: provider.model, messages, max_tokens: maxTokens }),
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 0 || res.type === "opaque") {
        throw new Error("The endpoint blocked the browser request (CORS). Use a provider with CORS support or route through a gateway that allows it.");
      }
      throw new Error(`model call failed: HTTP ${res.status} ${body.slice(0, 300)}`);
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content ?? "";
    if (!text) warnings.push("Model returned an empty completion.");
    return { text, warnings };
  }

  // --- Anthropic -------------------------------------------------------------
  if (provider.provider === "anthropic") {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = messages.filter((m) => m.role !== "system");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": provider.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: rest.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`model call failed: HTTP ${res.status} ${body.slice(0, 300)}`);
    }
    const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    if (!text) warnings.push("Model returned an empty completion.");
    return { text, warnings };
  }

  // --- Google ------------------------------------------------------------------
  if (provider.provider === "google") {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents,
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`model call failed: HTTP ${res.status} ${body.slice(0, 300)}`);
    }
    const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    if (!text) warnings.push("Model returned an empty completion.");
    return { text, warnings };
  }

  throw new Error(`Unsupported provider: ${provider.provider as string}`);
}
