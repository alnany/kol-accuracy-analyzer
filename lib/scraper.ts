interface TweetResult {
  id: string;
  text: string;
  created_at: string;
}

// Guest API / Nitter fallback scraper
// Uses syndication API which doesn't require auth
export async function scrapeNitterTimeline(
  handle: string,
  pages: number = 3
): Promise<TweetResult[]> {
  const tweets: TweetResult[] = [];

  try {
    // Try Twitter syndication API (no auth required)
    const url = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) {
      console.warn(`Syndication API returned ${res.status} for @${handle}`);
      return [];
    }

    const html = await res.text();

    // Extract tweet data from embedded JSON in the HTML
    const tweetPattern =
      /data-tweet-id="(\d+)"[^>]*>[\s\S]*?<p[^>]*class="[^"]*tweet-text[^"]*"[^>]*>([\s\S]*?)<\/p>[\s\S]*?<time[^>]*datetime="([^"]*)"[^>]*>/g;

    let match;
    while ((match = tweetPattern.exec(html)) !== null && tweets.length < pages * 20) {
      tweets.push({
        id: match[1],
        text: match[2].replace(/<[^>]*>/g, "").trim(),
        created_at: match[3],
      });
    }

    // Alternative: try parsing JSON-LD or script data
    if (tweets.length === 0) {
      const scriptPattern =
        /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
      let scriptMatch;
      while ((scriptMatch = scriptPattern.exec(html)) !== null) {
        try {
          const data = JSON.parse(scriptMatch[1]);
          if (data?.props?.pageProps?.timeline?.entries) {
            for (const entry of data.props.pageProps.timeline.entries) {
              if (entry.content?.tweet) {
                const t = entry.content.tweet;
                tweets.push({
                  id: t.id_str || String(t.id),
                  text: t.full_text || t.text || "",
                  created_at: t.created_at || new Date().toISOString(),
                });
              }
            }
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    }
  } catch (err) {
    console.error(`Guest API scrape failed for @${handle}:`, err);
  }

  return tweets;
}
