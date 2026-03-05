"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, TrendingUp, Clock, ArrowRight, Zap, Target, BarChart3 } from "lucide-react";

interface RecentEntry {
  handle: string;
  accuracy: number;
  totalCalls: number;
  hits: number;
  misses: number;
  pending: number;
  searchedAt: string;
  biasNote?: string;
}

const LS_KEY = "kolol_feed_v2";

function loadLocalFeed(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalFeed(entries: RecentEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

function mergeFeed(local: RecentEntry[], remote: RecentEntry[]): RecentEntry[] {
  const map = new Map<string, RecentEntry>();
  for (const e of local) map.set(e.handle.toLowerCase(), e);
  for (const e of remote) {
    const key = e.handle.toLowerCase();
    const existing = map.get(key);
    if (!existing || new Date(e.searchedAt) > new Date(existing.searchedAt)) {
      map.set(key, e);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.searchedAt).getTime() - new Date(a.searchedAt).getTime()
  );
}

function AccuracyBadge({ accuracy, size = "sm" }: { accuracy: number; size?: "sm" | "md" }) {
  const pct = Math.round(accuracy * 100);
  const color =
    pct >= 60 ? "text-hit" : pct >= 40 ? "text-yellow-400" : "text-miss";
  const bg =
    pct >= 60
      ? "bg-hit/10 border-hit/20"
      : pct >= 40
      ? "bg-yellow-400/10 border-yellow-400/20"
      : "bg-miss/10 border-miss/20";

  return (
    <span
      className={`mono font-semibold ${color} ${bg} border rounded-md inline-flex items-center ${
        size === "md" ? "px-3 py-1 text-base" : "px-2 py-0.5 text-sm"
      }`}
    >
      {pct}%
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [feed, setFeed] = useState<RecentEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load localStorage immediately
    const local = loadLocalFeed();
    setFeed(local);

    // Fetch remote and merge
    fetch("/api/recent")
      .then((r) => r.json())
      .then((remote: RecentEntry[]) => {
        const merged = mergeFeed(local, remote);
        setFeed(merged);
        saveLocalFeed(merged);
      })
      .catch(() => {
        // offline: localStorage is already loaded
      });
  }, []);

  const handleSearch = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const handle = query.trim().replace(/^@/, "");
      if (!handle) return;
      setLoading(true);
      router.push(`/report/${handle}`);
    },
    [query, router]
  );

  const activityFeed = feed.slice(0, 8);
  const ladder = feed
    .filter((e) => e.hits + e.misses > 0)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 10);

  return (
    <div className="min-h-screen bg-bg">
      {/* Ambient gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-accent/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-violet-800/3 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8 md:py-16">
        {/* Hero */}
        <div className="text-center mb-12 animate-fade-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-medium mb-6 tracking-wider uppercase">
            <Zap className="w-3 h-3" />
            KOL Accuracy Analyzer
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
            <span className="text-white">KOL</span>
            <span className="text-accent">OL</span>
          </h1>
          <p className="text-white/40 text-lg md:text-xl max-w-lg mx-auto leading-relaxed">
            Does your crypto influencer actually know what they&apos;re talking
            about?
          </p>
        </div>

        {/* Search */}
        <div
          className="animate-fade-up max-w-xl mx-auto mb-16"
          style={{ animationDelay: "0.1s" }}
        >
          <form onSubmit={handleSearch} className="relative group">
            <div className="absolute -inset-1 bg-accent/20 rounded-2xl blur-lg opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
            <div className="relative flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden group-focus-within:border-accent/40 transition-colors">
              <span className="pl-4 text-white/30">
                <Search className="w-5 h-5" />
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter @handle to analyze..."
                className="flex-1 bg-transparent text-white placeholder-white/30 px-3 py-4 text-lg outline-none"
                autoFocus
              />
              <button
                type="submit"
                disabled={!query.trim() || loading}
                className="px-6 py-4 bg-accent hover:bg-violet-500 text-white font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Analyze
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Activity Feed */}
          <div
            className="animate-fade-up"
            style={{ animationDelay: "0.2s" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
                Recent Activity
              </h2>
            </div>

            {activityFeed.length === 0 ? (
              <div className="glass-card p-8 text-center text-white/30">
                <Target className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p>No analyses yet. Be the first!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activityFeed.map((entry, i) => (
                  <button
                    key={`${entry.handle}-${i}`}
                    onClick={() => router.push(`/report/${entry.handle}`)}
                    className="glass-card w-full p-3 flex items-center justify-between text-left transition-all hover:translate-x-1"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                        <span className="text-accent text-xs font-bold">
                          @
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="mono text-sm text-white/80 truncate block">
                          @{entry.handle}
                        </span>
                        <span className="text-xs text-white/30">
                          {entry.totalCalls} calls · {timeAgo(entry.searchedAt)}
                        </span>
                      </div>
                    </div>
                    <AccuracyBadge accuracy={entry.accuracy} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Accuracy Ladder */}
          <div
            className="animate-fade-up"
            style={{ animationDelay: "0.3s" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-hit" />
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
                Accuracy Ladder
              </h2>
            </div>

            {ladder.length === 0 ? (
              <div className="glass-card p-8 text-center text-white/30">
                <BarChart3 className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p>No scored predictions yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {ladder.map((entry, i) => (
                  <button
                    key={`ladder-${entry.handle}-${i}`}
                    onClick={() => router.push(`/report/${entry.handle}`)}
                    className="glass-card w-full p-3 flex items-center justify-between text-left transition-all hover:translate-x-1"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`mono text-sm w-6 text-right ${
                          i === 0
                            ? "text-yellow-400 font-bold"
                            : i === 1
                            ? "text-white/50"
                            : i === 2
                            ? "text-amber-600"
                            : "text-white/20"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="mono text-sm text-white/80">
                        @{entry.handle}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-white/30">
                        {entry.hits}W-{entry.misses}L
                      </span>
                      <AccuracyBadge accuracy={entry.accuracy} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-white/20 text-xs">
          KOLOL — Crypto KOL Accuracy Tracker · Not financial advice · DYOR
        </div>
      </div>
    </div>
  );
}
