import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { KOLReport } from "@/lib/types";
import { extractCalls } from "@/lib/extractor";
import { buildReport } from "@/lib/scorer";
import { addRecent } from "@/lib/recent";
import { scrapeNitterTimeline } from "@/lib/scraper";

const ARCHIVE_DIR = "/tmp/kol_v2";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

const memoryArchive = new Map<string, { data: unknown; ts: number }>();

function ensureDir() {
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
}

function archiveRead(handle: string): KOLReport | null {
  const key = handle.toLowerCase();

  // Memory first
  const mem = memoryArchive.get(key);
  if (mem && Date.now() - mem.ts < CACHE_TTL_MS) {
    return mem.data as KOLReport;
  }

  // File fallback
  ensureDir();
  const filePath = path.join(ARCHIVE_DIR, `${key}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts < CACHE_TTL_MS) {
        memoryArchive.set(key, { data, ts });
        return data as KOLReport;
      }
    }
  } catch {
    // Corrupt file — delete it
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  }

  return null;
}

function archiveWrite(handle: string, data: KOLReport): void {
  const key = handle.toLowerCase();
  const ts = Date.now();

  memoryArchive.set(key, { data, ts });

  ensureDir();
  const filePath = path.join(ARCHIVE_DIR, `${key}.json`);
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ data, ts }, null, 2));
  fs.renameSync(tmp, filePath);
}

interface TweetResult {
  id: string;
  text: string;
  created_at: string;
}

async function fetchTweetsV2(handle: string): Promise<TweetResult[]> {
  const bearer = process.env.TWITTER_BEARER_TOKEN;
  if (!bearer) throw new Error("TWITTER_BEARER_TOKEN not set");

  // Resolve user ID
  const userRes = await fetch(
    `https://api.twitter.com/2/users/by/username/${handle}`,
    { headers: { Authorization: `Bearer ${bearer}` } }
  );

  if (userRes.status === 401) {
    throw new Error("Twitter authentication failed");
  }

  if (userRes.status === 403) {
    return []; // Tier limit — trigger fallback
  }

  if (!userRes.ok) {
    console.warn(`Twitter user lookup failed: ${userRes.status}`);
    return [];
  }

  const userData = await userRes.json();
  const userId = userData?.data?.id;
  if (!userId) return [];

  const allTweets: TweetResult[] = [];
  let nextToken: string | undefined;
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({
      max_results: "100",
      "tweet.fields": "created_at,text",
      exclude: "retweets,replies",
      start_time: oneYearAgo.toISOString(),
    });
    if (nextToken) params.set("pagination_token", nextToken);

    const tweetsRes = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?${params}`,
      { headers: { Authorization: `Bearer ${bearer}` } }
    );

    if (tweetsRes.status === 403) return allTweets; // tier limit mid-pagination

    if (!tweetsRes.ok) break;

    const tweetsData = await tweetsRes.json();
    const tweets = tweetsData?.data;
    if (!Array.isArray(tweets) || tweets.length === 0) break;

    for (const t of tweets) {
      allTweets.push({
        id: t.id,
        text: t.text,
        created_at: t.created_at,
      });
    }

    nextToken = tweetsData?.meta?.next_token;
    if (!nextToken) break;
  }

  return allTweets;
}

async function fetchTweets(
  handle: string
): Promise<{ tweets: TweetResult[]; source: string }> {
  try {
    const tweets = await fetchTweetsV2(handle);
    if (tweets.length > 0) return { tweets, source: "twitter-v2" };
    // Empty = tier limit → fall through to guest API
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("authentication failed")) throw err; // 401 = no fallback
  }

  return {
    tweets: await scrapeNitterTimeline(handle, 3),
    source: "guest-api",
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get("handle")?.replace(/^@/, "").trim();
  const nocache = searchParams.get("nocache") === "1";

  if (!handle) {
    return NextResponse.json(
      { error: "Missing handle parameter" },
      { status: 400 }
    );
  }

  // Check cache (unless nocache)
  if (!nocache) {
    const cached = archiveRead(handle);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  try {
    // Fetch tweets
    const { tweets, source } = await fetchTweets(handle);

    if (tweets.length === 0) {
      return NextResponse.json(
        {
          error: `No tweets found for @${handle}. The account may be private, suspended, or have no recent tweets.`,
          handle,
          source,
        },
        { status: 404 }
      );
    }

    // Extract calls
    const calls = await extractCalls(tweets, handle);

    if (calls.length === 0) {
      return NextResponse.json(
        {
          error: `No crypto market calls found in @${handle}'s recent tweets.`,
          handle,
          tweetsAnalyzed: tweets.length,
          source,
        },
        { status: 404 }
      );
    }

    // Score and build report
    const report = await buildReport(handle, calls);

    // Archive
    archiveWrite(handle, report);
    addRecent(report);

    return NextResponse.json(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`Analysis failed for @${handle}:`, msg);
    return NextResponse.json(
      { error: `Analysis failed: ${msg}`, handle },
      { status: 500 }
    );
  }
}
