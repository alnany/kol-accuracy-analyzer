"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  RefreshCw,
  Share2,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Filter,
} from "lucide-react";

interface MarketCall {
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

interface KOLReport {
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
  error?: string;
}

const REPORT_CACHE_TTL = 6 * 60 * 60 * 1000;

function AccuracyRing({
  accuracy,
  size = 120,
}: {
  accuracy: number;
  size?: number;
}) {
  const pct = Math.round(accuracy * 100);
  const r = 52;
  const circ = 2 * Math.PI * r;
  const fill = circ * accuracy;

  const color =
    pct >= 60 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444";
  const label =
    pct >= 70
      ? "Strong"
      : pct >= 55
      ? "Good"
      : pct >= 40
      ? "Mixed"
      : pct >= 25
      ? "Weak"
      : "Poor";

  return (
    <div
      className="relative animate-pulse-ring"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="10"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          style={{
            transition: "stroke-dasharray 1s ease-out",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mono text-3xl font-bold text-white">{pct}%</span>
        <span className="text-xs font-medium" style={{ color }}>
          {label}
        </span>
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="glass-card px-4 py-3 text-center">
      <div className={`mono text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-white/40 mt-0.5">{label}</div>
    </div>
  );
}

function CallCard({ call }: { call: MarketCall }) {
  const resultColor =
    call.result === "hit"
      ? "border-hit/30 bg-hit/5"
      : call.result === "miss"
      ? "border-miss/30 bg-miss/5"
      : "border-pending/20 bg-white/3";

  const resultIcon =
    call.result === "hit" ? (
      <CheckCircle2 className="w-4 h-4 text-hit" />
    ) : call.result === "miss" ? (
      <XCircle className="w-4 h-4 text-miss" />
    ) : (
      <Clock className="w-4 h-4 text-pending" />
    );

  const dirIcon =
    call.direction === "bullish" ? (
      <TrendingUp className="w-3.5 h-3.5 text-hit" />
    ) : (
      <TrendingDown className="w-3.5 h-3.5 text-miss" />
    );

  const fmtPrice = (p: number | null) =>
    p === null ? "—" : p < 0.01 ? p.toExponential(2) : `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const callDateFmt = new Date(call.callDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div
      className={`border rounded-xl p-4 transition-all hover:scale-[1.01] ${resultColor}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          {resultIcon}
          <span className="mono text-sm font-semibold text-white/90">
            {call.token}
          </span>
          {dirIcon}
          {call.scoredOn && (
            <span className="text-[10px] text-white/30 mono">
              scored@{call.scoredOn}
            </span>
          )}
        </div>
        <a
          href={call.tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/20 hover:text-accent transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <p className="text-sm text-white/50 line-clamp-2 mb-3 leading-relaxed">
        {call.tweetText}
      </p>

      <div className="flex items-center gap-4 text-xs text-white/30">
        <span>{callDateFmt}</span>
        <span>Entry: {fmtPrice(call.priceAtCall)}</span>
        {call.priceAfter7d !== null && (
          <span>7d: {fmtPrice(call.priceAfter7d)}</span>
        )}
      </div>
    </div>
  );
}

type FilterTab = "all" | "hit" | "miss" | "pending";

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const handle = (params.handle as string) || "";

  const [report, setReport] = useState<KOLReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");

  const loadReport = useCallback(
    (forceRefresh = false) => {
      if (!handle) return;

      if (!forceRefresh) {
        // Check localStorage cache FIRST
        try {
          const cacheKey = `kolol_report_${handle.toLowerCase()}`;
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const { data, ts } = JSON.parse(cached);
            if (
              Date.now() - ts < REPORT_CACHE_TTL &&
              data &&
              !data.error
            ) {
              setReport(data);
              setLoading(false);
              return; // Zero API call
            }
          }
        } catch {
          // ignore localStorage errors
        }
      }

      if (forceRefresh) setRefreshing(true);
      setLoading(true);
      setError(null);

      fetch(
        `/api/analyze?handle=${encodeURIComponent(handle)}${
          forceRefresh ? "&nocache=1" : ""
        }`
      )
        .then((r) => {
          if (!r.ok) return r.json().then((d) => Promise.reject(d));
          return r.json();
        })
        .then((result: KOLReport) => {
          setReport(result);
          setError(null);
          // Cache in localStorage
          try {
            localStorage.setItem(
              `kolol_report_${handle.toLowerCase()}`,
              JSON.stringify({ data: result, ts: Date.now() })
            );
          } catch {
            // ignore
          }
        })
        .catch((err) => {
          setError(
            err?.error || `Failed to analyze @${handle}. Please try again.`
          );
        })
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [handle]
  );

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const filteredCalls =
    report?.callHistory?.filter((c) =>
      filter === "all" ? true : c.result === filter
    ) || [];

  const shareToX = () => {
    if (!report) return;
    const pct = Math.round(report.overallAccuracy * 100);
    const text = encodeURIComponent(
      `@${report.handle} KOL Accuracy Score:\n` +
        `\u{1F3AF} ${pct}% accurate\n` +
        `\u2705 ${report.hits} hits / \u274C ${report.misses} misses / \u23F3 ${report.pending} pending\n` +
        `${report.biasNote}\n\n` +
        `Check any crypto KOL: https://kol-accuracy-analyzer.vercel.app/report/${report.handle}\n` +
        `#CryptoKOL #DYOR`
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
  };

  // Loading state
  if (loading && !report) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-accent/20 border-t-accent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/40 text-sm">
            Analyzing @{handle}&apos;s predictions...
          </p>
          <p className="text-white/20 text-xs mt-2">
            Fetching tweets, extracting calls, checking prices...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !report) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 rounded-full bg-miss/10 border border-miss/20 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-miss" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Analysis Failed
          </h2>
          <p className="text-white/40 text-sm mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white/60 hover:bg-white/10 transition-colors"
            >
              Go Home
            </button>
            <button
              onClick={() => loadReport(true)}
              className="px-4 py-2 bg-accent hover:bg-violet-500 rounded-lg text-sm text-white transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const pct = Math.round(report.overallAccuracy * 100);

  return (
    <div className="min-h-screen bg-bg">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-accent/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadReport(true)}
              disabled={refreshing}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
              title="Refresh analysis"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
              />
            </button>
            <button
              onClick={shareToX}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors text-sm"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          </div>
        </div>

        {/* Profile + Gauge */}
        <div className="text-center mb-8 animate-fade-up">
          <div className="w-16 h-16 rounded-full bg-accent/10 border-2 border-accent/30 flex items-center justify-center mx-auto mb-3">
            <span className="text-accent text-xl font-bold">@</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">
            @{report.handle}
          </h1>
          <p className="text-white/30 text-sm mono">{report.periodLabel}</p>
        </div>

        <div
          className="flex justify-center mb-8 animate-fade-up"
          style={{ animationDelay: "0.1s" }}
        >
          <AccuracyRing accuracy={report.overallAccuracy} size={160} />
        </div>

        {/* Stat pills */}
        <div
          className="grid grid-cols-3 gap-3 mb-8 animate-fade-up"
          style={{ animationDelay: "0.15s" }}
        >
          <StatPill label="Hits" value={report.hits} color="text-hit" />
          <StatPill label="Misses" value={report.misses} color="text-miss" />
          <StatPill
            label="Pending"
            value={report.pending}
            color="text-pending"
          />
        </div>

        {/* Verdict */}
        <div
          className="glass-card p-5 mb-6 animate-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
            Verdict
          </h3>
          <ul className="space-y-2">
            {report.verdictPoints.map((point, i) => (
              <li
                key={i}
                className="text-sm text-white/70 leading-relaxed pl-4 border-l-2 border-accent/30"
              >
                {point}
              </li>
            ))}
          </ul>
          {report.biasNote && report.biasNote !== "N/A" && (
            <p className="text-xs text-white/30 mt-3 italic">
              {report.biasNote}
            </p>
          )}
        </div>

        {/* Timeframe breakdown */}
        <div
          className="glass-card p-5 mb-6 animate-fade-up"
          style={{ animationDelay: "0.25s" }}
        >
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
            Accuracy by Timeframe
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {(["1d", "7d", "30d"] as const).map((tf) => {
              const val = Math.round(report.byTimeframe[tf] * 100);
              return (
                <div key={tf} className="text-center">
                  <div className="mono text-lg font-semibold text-white/80">
                    {val}%
                  </div>
                  <div className="text-xs text-white/30">{tf}</div>
                  <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-700"
                      style={{ width: `${val}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Token breakdown */}
        {Object.keys(report.byToken).length > 0 && (
          <div
            className="glass-card p-5 mb-6 animate-fade-up"
            style={{ animationDelay: "0.3s" }}
          >
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
              Accuracy by Token
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(report.byToken)
                .sort(([, a], [, b]) => b - a)
                .map(([token, acc]) => {
                  const tokenPct = Math.round(acc * 100);
                  const clr =
                    tokenPct >= 60
                      ? "text-hit bg-hit/10 border-hit/20"
                      : tokenPct >= 40
                      ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
                      : "text-miss bg-miss/10 border-miss/20";
                  return (
                    <span
                      key={token}
                      className={`mono text-xs px-2.5 py-1 rounded-lg border ${clr}`}
                    >
                      {token} {tokenPct}%
                    </span>
                  );
                })}
            </div>
          </div>
        )}

        {/* Call History */}
        <div
          className="animate-fade-up"
          style={{ animationDelay: "0.35s" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
                Call History
              </h3>
              <span className="mono text-xs text-white/20">
                ({filteredCalls.length})
              </span>
            </div>

            <div className="flex gap-1">
              {(
                [
                  { key: "all", label: "All", count: report.totalCalls },
                  { key: "hit", label: "Hits", count: report.hits },
                  { key: "miss", label: "Misses", count: report.misses },
                  { key: "pending", label: "Pending", count: report.pending },
                ] as const
              ).map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    filter === key
                      ? "bg-accent text-white"
                      : "bg-white/5 text-white/40 hover:bg-white/10"
                  }`}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {filteredCalls.length === 0 ? (
              <div className="glass-card p-8 text-center text-white/30 text-sm">
                No calls match this filter.
              </div>
            ) : (
              filteredCalls.map((call) => (
                <CallCard key={call.id + call.token} call={call} />
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 mb-8 text-white/20 text-xs">
          <p className="mono">
            Generated {new Date(report.generatedAt).toLocaleString()} ·{" "}
            {report.totalCalls} calls analyzed
          </p>
          <p className="mt-1">Not financial advice · DYOR</p>
        </div>
      </div>
    </div>
  );
}
