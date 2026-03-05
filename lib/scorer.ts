import Anthropic from "@anthropic-ai/sdk";
import { MarketCall, KOLReport } from "./types";
import { fetchPrice, addDays } from "./price";

function sanitizeJson(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```json")) s = s.slice(7);
  else if (s.startsWith("```")) s = s.slice(3);
  if (s.endsWith("```")) s = s.slice(0, -3);
  return s.trim();
}

export async function scoreCalls(calls: MarketCall[]): Promise<MarketCall[]> {
  const scored = await Promise.all(
    calls.map(async (call) => {
      const dateStr = addDays(call.callDate, 0); // normalize to YYYY-MM-DD
      const p0 = await fetchPrice(call.token, dateStr);
      call.priceAtCall = p0;

      if (!p0) {
        call.result = "pending";
        call.scoredOn = null;
        return call;
      }

      // Try 7d first, then 1d, then 30d
      const p7d = await fetchPrice(call.token, addDays(call.callDate, 7));
      const p1d = await fetchPrice(call.token, addDays(call.callDate, 1));
      const p30d = await fetchPrice(call.token, addDays(call.callDate, 30));

      call.priceAfter1d = p1d;
      call.priceAfter7d = p7d;
      call.priceAfter30d = p30d;

      // Pick best available future price: prefer 7d, then 1d, then 30d
      let futurePrice: number | null = null;
      let timeframe: "1d" | "7d" | "30d" | null = null;

      if (p7d !== null) {
        futurePrice = p7d;
        timeframe = "7d";
      } else if (p1d !== null) {
        futurePrice = p1d;
        timeframe = "1d";
      } else if (p30d !== null) {
        futurePrice = p30d;
        timeframe = "30d";
      }

      if (futurePrice === null) {
        call.result = "pending";
        call.scoredOn = null;
        return call;
      }

      const isHit =
        call.direction === "bullish"
          ? futurePrice > p0
          : futurePrice < p0;

      call.result = isHit ? "hit" : "miss";
      call.scoredOn = timeframe;
      return call;
    })
  );

  return scored;
}

function getPeriodLabel(calls: MarketCall[]): string {
  if (!calls.length) return "N/A";
  const dates = calls
    .map((c) => new Date(c.callDate))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (!dates.length) return "N/A";

  const fmt = (d: Date) => {
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  };

  const first = fmt(dates[0]);
  const last = fmt(dates[dates.length - 1]);
  return first === last ? first : `${first} – ${last}`;
}

async function generateVerdict(
  handle: string,
  report: Omit<KOLReport, "verdictPoints" | "biasNote" | "generatedAt">
): Promise<{ verdict: string[]; biasNote: string }> {
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20250929",
      max_tokens: 1024,
      system:
        "You are a crypto analyst writing a brief verdict about a KOL's prediction accuracy. Be direct and data-driven. Return JSON: { \"verdict\": [\"point1\", \"point2\", \"point3\"], \"biasNote\": \"one-line bias summary\" }. Return ONLY valid JSON.",
      messages: [
        {
          role: "user",
          content: `Analyze @${handle}'s prediction track record:
- Overall accuracy: ${(report.overallAccuracy * 100).toFixed(1)}%
- ${report.hits} hits, ${report.misses} misses, ${report.pending} pending out of ${report.totalCalls} calls
- Bullish calls: ${(report.bullishPct * 100).toFixed(0)}%
- Top tokens: ${Object.entries(report.byToken)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([t, acc]) => `${t}: ${(acc * 100).toFixed(0)}%`)
            .join(", ")}
- Period: ${report.periodLabel}

Generate 3-4 verdict points and a one-line bias note.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text")
      return { verdict: ["Insufficient data for verdict."], biasNote: "N/A" };

    const cleaned = sanitizeJson(textBlock.text);
    const parsed = JSON.parse(cleaned);

    // CRITICAL: Always normalize to string[]
    const verdict = Array.isArray(parsed.verdict)
      ? parsed.verdict.map((v: unknown) =>
          typeof v === "string" ? v : JSON.stringify(v)
        )
      : ["Insufficient data for verdict."];

    const biasNote =
      typeof parsed.biasNote === "string"
        ? parsed.biasNote
        : String(parsed.biasNote ?? "N/A");

    return { verdict, biasNote };
  } catch (err) {
    console.error("Verdict generation error:", err);
    return { verdict: ["Unable to generate verdict."], biasNote: "N/A" };
  }
}

export async function buildReport(
  handle: string,
  calls: MarketCall[]
): Promise<KOLReport> {
  const scored = await scoreCalls(calls);

  const hits = scored.filter((c) => c.result === "hit").length;
  const misses = scored.filter((c) => c.result === "miss").length;
  const pending = scored.filter((c) => c.result === "pending").length;
  const overallAccuracy = hits + misses > 0 ? hits / (hits + misses) : 0;

  // byTimeframe derived from result + scoredOn fields ONLY
  const byTimeframe = { "1d": 0, "7d": 0, "30d": 0 };
  const byTimeframeTotal = { "1d": 0, "7d": 0, "30d": 0 };
  for (const c of scored) {
    if (c.scoredOn && (c.result === "hit" || c.result === "miss")) {
      byTimeframeTotal[c.scoredOn]++;
      if (c.result === "hit") byTimeframe[c.scoredOn]++;
    }
  }
  const byTimeframePct = {
    "1d":
      byTimeframeTotal["1d"] > 0
        ? byTimeframe["1d"] / byTimeframeTotal["1d"]
        : 0,
    "7d":
      byTimeframeTotal["7d"] > 0
        ? byTimeframe["7d"] / byTimeframeTotal["7d"]
        : 0,
    "30d":
      byTimeframeTotal["30d"] > 0
        ? byTimeframe["30d"] / byTimeframeTotal["30d"]
        : 0,
  };

  // byToken
  const tokenHits: Record<string, number> = {};
  const tokenTotal: Record<string, number> = {};
  for (const c of scored) {
    if (c.result === "hit" || c.result === "miss") {
      tokenTotal[c.token] = (tokenTotal[c.token] || 0) + 1;
      if (c.result === "hit") tokenHits[c.token] = (tokenHits[c.token] || 0) + 1;
    }
  }
  const byToken: Record<string, number> = {};
  for (const t of Object.keys(tokenTotal)) {
    byToken[t] = tokenTotal[t] > 0 ? (tokenHits[t] || 0) / tokenTotal[t] : 0;
  }

  const bullishCount = scored.filter((c) => c.direction === "bullish").length;
  const bullishPct = scored.length > 0 ? bullishCount / scored.length : 0;

  const partialReport = {
    handle,
    periodLabel: getPeriodLabel(scored),
    totalCalls: scored.length,
    hits,
    misses,
    pending,
    overallAccuracy,
    byTimeframe: byTimeframePct,
    byToken,
    bullishPct,
    callHistory: scored,
  };

  const { verdict, biasNote } = await generateVerdict(handle, partialReport);

  return {
    ...partialReport,
    verdictPoints: verdict,
    biasNote,
    generatedAt: new Date().toISOString(),
  };
}
