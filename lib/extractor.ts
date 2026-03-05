import Anthropic from "@anthropic-ai/sdk";
import { MarketCall } from "./types";

const SYSTEM_PROMPT = `You are a financial analyst extracting crypto market calls from tweets.
A market call = any tweet expressing a directional price opinion on a crypto asset.

BULLISH: "going to", "will pump", "LFG", "🚀", "$TICKER with excitement", explicit price target above current
BEARISH: "shorting", "bearish", "will dump", "exit", lower price target

Rules:
- $TICKER with positive sentiment = bullish call on that token
- Standalone USD price with no token = bullish BTC call
- Multiple tokens in one tweet = multiple calls (one per token)
- Non-market content / retweets without commentary = extract nothing

Return JSON array: [{ "id", "tweetText", "tweetUrl", "callDate", "token", "direction", "priceTarget" }]
Return [] if no calls. Return ONLY valid JSON — nothing else.`;

function sanitizeJson(raw: string): string {
  let s = raw.trim();
  // Strip markdown fences
  if (s.startsWith("```json")) s = s.slice(7);
  else if (s.startsWith("```")) s = s.slice(3);
  if (s.endsWith("```")) s = s.slice(0, -3);
  return s.trim();
}

interface TweetInput {
  id: string;
  text: string;
  created_at: string;
}

export async function extractCalls(
  tweets: TweetInput[],
  handle: string
): Promise<MarketCall[]> {
  if (!tweets.length) return [];

  const client = new Anthropic();
  const batched = tweets.slice(0, 50);

  const tweetBlock = batched
    .map(
      (t) =>
        `[${t.id}] (${t.created_at}) ${t.text}\nURL: https://twitter.com/${handle}/status/${t.id}`
    )
    .join("\n---\n");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20250929",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Extract all crypto market calls from these tweets by @${handle}:\n\n${tweetBlock}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return [];

    const cleaned = sanitizeJson(textBlock.text);
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return [];

    return parsed.map(
      (c: {
        id: string;
        tweetText: string;
        tweetUrl: string;
        callDate: string;
        token: string;
        direction: string;
        priceTarget?: number | null;
      }) => ({
        id: c.id || "",
        tweetText: c.tweetText || "",
        tweetUrl:
          c.tweetUrl || `https://twitter.com/${handle}/status/${c.id}`,
        callDate: c.callDate || "",
        token: (c.token || "").toUpperCase(),
        direction:
          c.direction === "bearish" ? ("bearish" as const) : ("bullish" as const),
        priceTarget: c.priceTarget ?? null,
        priceAtCall: null,
        priceAfter1d: null,
        priceAfter7d: null,
        priceAfter30d: null,
        result: "pending" as const,
        scoredOn: null,
      })
    );
  } catch (err) {
    console.error("Extractor error:", err);
    return [];
  }
}
