export interface MarketCall {
  id: string;
  tweetText: string;
  tweetUrl: string;
  callDate: string;
  token: string;
  direction: "bullish" | "bearish";
  priceTarget?: number | null;
  priceAtCall: number | null;
  priceAfter1d: number | null;
  priceAfter7d: number | null;
  priceAfter30d: number | null;
  result: "hit" | "miss" | "pending";
  scoredOn: "1d" | "7d" | "30d" | null;
}

export interface KOLReport {
  handle: string;
  periodLabel: string;
  totalCalls: number;
  hits: number;
  misses: number;
  pending: number;
  overallAccuracy: number;
  byTimeframe: { "1d": number; "7d": number; "30d": number };
  byToken: Record<string, number>;
  bullishPct: number;
  biasNote: string;
  verdictPoints: string[];
  callHistory: MarketCall[];
  generatedAt: string;
}

export interface RecentEntry {
  handle: string;
  accuracy: number;
  totalCalls: number;
  hits: number;
  misses: number;
  pending: number;
  searchedAt: string;
  biasNote?: string;
}
