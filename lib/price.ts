const TOKEN_MAP: Record<string, { coinGeckoId: string; binanceSymbol?: string }> = {
  BTC: { coinGeckoId: "bitcoin", binanceSymbol: "BTCUSDT" },
  ETH: { coinGeckoId: "ethereum", binanceSymbol: "ETHUSDT" },
  SOL: { coinGeckoId: "solana", binanceSymbol: "SOLUSDT" },
  BNB: { coinGeckoId: "binancecoin", binanceSymbol: "BNBUSDT" },
  XRP: { coinGeckoId: "ripple", binanceSymbol: "XRPUSDT" },
  ADA: { coinGeckoId: "cardano", binanceSymbol: "ADAUSDT" },
  AVAX: { coinGeckoId: "avalanche-2", binanceSymbol: "AVAXUSDT" },
  MATIC: { coinGeckoId: "matic-network", binanceSymbol: "MATICUSDT" },
  DOT: { coinGeckoId: "polkadot", binanceSymbol: "DOTUSDT" },
  LINK: { coinGeckoId: "chainlink", binanceSymbol: "LINKUSDT" },
  LTC: { coinGeckoId: "litecoin", binanceSymbol: "LTCUSDT" },
  BCH: { coinGeckoId: "bitcoin-cash", binanceSymbol: "BCHUSDT" },
  DOGE: { coinGeckoId: "dogecoin", binanceSymbol: "DOGEUSDT" },
  SHIB: { coinGeckoId: "shiba-inu", binanceSymbol: "SHIBUSDT" },
  TON: { coinGeckoId: "the-open-network", binanceSymbol: "TONUSDT" },
  AR: { coinGeckoId: "arweave", binanceSymbol: "ARUSDT" },
  INJ: { coinGeckoId: "injective-protocol", binanceSymbol: "INJUSDT" },
  SUI: { coinGeckoId: "sui", binanceSymbol: "SUIUSDT" },
  APT: { coinGeckoId: "aptos", binanceSymbol: "APTUSDT" },
  OP: { coinGeckoId: "optimism", binanceSymbol: "OPUSDT" },
  ARB: { coinGeckoId: "arbitrum", binanceSymbol: "ARBUSDT" },
  XMR: { coinGeckoId: "monero", binanceSymbol: "XMRUSDT" },
  ZEC: { coinGeckoId: "zcash", binanceSymbol: "ZECUSDT" },
  DASH: { coinGeckoId: "dash", binanceSymbol: "DASHUSDT" },
  PEPE: { coinGeckoId: "pepe", binanceSymbol: "PEPEUSDT" },
  WIF: { coinGeckoId: "dogwifcoin", binanceSymbol: "WIFUSDT" },
  BONK: { coinGeckoId: "bonk", binanceSymbol: "BONKUSDT" },
  AAVE: { coinGeckoId: "aave", binanceSymbol: "AAVEUSDT" },
  CRV: { coinGeckoId: "curve-dao-token", binanceSymbol: "CRVUSDT" },
  MKR: { coinGeckoId: "maker", binanceSymbol: "MKRUSDT" },
  SNX: { coinGeckoId: "havven", binanceSymbol: "SNXUSDT" },
  COMP: { coinGeckoId: "compound-governance-token", binanceSymbol: "COMPUSDT" },
  YFI: { coinGeckoId: "yearn-finance", binanceSymbol: "YFIUSDT" },
  SUSHI: { coinGeckoId: "sushi", binanceSymbol: "SUSHIUSDT" },
  UNI: { coinGeckoId: "uniswap", binanceSymbol: "UNIUSDT" },
  RNDR: { coinGeckoId: "render-token", binanceSymbol: "RNDRUSDT" },
  FET: { coinGeckoId: "fetch-ai", binanceSymbol: "FETUSDT" },
  OCEAN: { coinGeckoId: "ocean-protocol", binanceSymbol: "OCEANUSDT" },
  GRT: { coinGeckoId: "the-graph", binanceSymbol: "GRTUSDT" },
  ICP: { coinGeckoId: "internet-computer", binanceSymbol: "ICPUSDT" },
  NEAR: { coinGeckoId: "near", binanceSymbol: "NEARUSDT" },
  FTM: { coinGeckoId: "fantom", binanceSymbol: "FTMUSDT" },
  HBAR: { coinGeckoId: "hedera-hashgraph", binanceSymbol: "HBARUSDT" },
  VET: { coinGeckoId: "vechain", binanceSymbol: "VETUSDT" },
  ALGO: { coinGeckoId: "algorand", binanceSymbol: "ALGOUSDT" },
  SEI: { coinGeckoId: "sei-network", binanceSymbol: "SEIUSDT" },
  TIA: { coinGeckoId: "celestia", binanceSymbol: "TIAUSDT" },
  PYTH: { coinGeckoId: "pyth-network", binanceSymbol: "PYTHUSDT" },
  JTO: { coinGeckoId: "jito-governance-token", binanceSymbol: "JTOUSDT" },
  // CoinGecko-only (DEX tokens)
  BRETT: { coinGeckoId: "based-brett" },
  DEGEN: { coinGeckoId: "degen-base" },
  TOSHI: { coinGeckoId: "toshi" },
  SCRT: { coinGeckoId: "secret" },
};

// In-memory price cache: key = "TOKEN:YYYY-MM-DD"
const priceCache = new Map<string, number>();

// In-flight deduplication
const inflightRequests = new Map<string, Promise<number | null>>();

function isFutureDate(dateStr: string): boolean {
  const now = new Date();
  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const parts = dateStr.split("-");
  const target = Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return target > nowUTC;
}

async function fetchBinancePrice(symbol: string, dateStr: string): Promise<number | null> {
  const parts = dateStr.split("-");
  const epochMs = Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${epochMs}&limit=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data[0] || !data[0][4]) return null;
    return parseFloat(data[0][4]);
  } catch {
    return null;
  }
}

async function fetchCoinGeckoPrice(coinId: string, dateStr: string): Promise<number | null> {
  // CoinGecko date format: DD-MM-YYYY
  const parts = dateStr.split("-");
  const cgDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${cgDate}&localization=false`;
  try {
    const res = await fetch(url);
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      const retry = await fetch(url);
      if (!retry.ok) return null;
      const data = await retry.json();
      return data?.market_data?.current_price?.usd ?? null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    return data?.market_data?.current_price?.usd ?? null;
  } catch {
    return null;
  }
}

async function fetchPriceInternal(token: string, dateStr: string): Promise<number | null> {
  const info = TOKEN_MAP[token.toUpperCase()];
  if (!info) return null;
  if (isFutureDate(dateStr)) return null;

  // Try Binance first
  if (info.binanceSymbol) {
    const price = await fetchBinancePrice(info.binanceSymbol, dateStr);
    if (price !== null) return price;
  }

  // CoinGecko fallback
  return await fetchCoinGeckoPrice(info.coinGeckoId, dateStr);
}

export async function fetchPrice(token: string, dateStr: string): Promise<number | null> {
  const key = `${token.toUpperCase()}:${dateStr}`;

  // Check cache
  if (priceCache.has(key)) {
    return priceCache.get(key)!;
  }

  // Check in-flight dedup
  if (inflightRequests.has(key)) {
    return inflightRequests.get(key)!;
  }

  // Create new request
  const promise = fetchPriceInternal(token, dateStr).then((price) => {
    inflightRequests.delete(key);
    // CRITICAL: Never cache null on failure
    if (price !== null) {
      priceCache.set(key, price);
    }
    return price;
  });

  inflightRequests.set(key, promise);
  return promise;
}

export function addDays(isoStr: string, n: number): string {
  const d = new Date(isoStr);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const result = new Date(Date.UTC(y, m, day) + n * 86400000);
  const ry = result.getUTCFullYear();
  const rm = String(result.getUTCMonth() + 1).padStart(2, "0");
  const rd = String(result.getUTCDate()).padStart(2, "0");
  return `${ry}-${rm}-${rd}`;
}
