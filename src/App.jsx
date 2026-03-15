import { useState, useRef, useEffect } from "react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const INK        = "#000000";
const MID        = "#4D4D4D";
const MUTED      = "#888888";
const RULE       = "#E8E8E8";
const RULEG      = "#F2F2F2";
const BG         = "#FFFFFF";
const BGOFF      = "#F7F7F7";
const GOLD_BRAND = "#FFC32C";
const GOLD_TEXT  = "#7a5c10";
const BLUE       = "#1851EB";
const POS        = "#16a34a";
const NEG        = "#dc2626";
const POSL       = "#dcfce7";
const NEGL       = "#fee2e2";
const HEAD       = "'Montserrat','Helvetica Neue',Arial,sans-serif";
const BODY       = "'Poppins','Helvetica Neue',Arial,sans-serif";
const MONO       = "'Courier New','Lucida Console',monospace";
const CAT_BG     = { FED:"#1851EB", CPI:"#6b2d1f", NFP:"#1a3528", GDP:"#1c1f38", SEC:"#38182c" };

// ── localStorage ──────────────────────────────────────────────────────────────
const LS_GH_TOKEN  = "sdm_mb_gh_token";
const getGhToken   = () => localStorage.getItem(LS_GH_TOKEN) || import.meta.env.VITE_GH_TOKEN || "";

// ── ETF tickers ───────────────────────────────────────────────────────────────
const ETF_BTC = ["IBIT","FBTC","BITB","ARKB","BTCO","EZBC","BRRR","HODL","BTCW","GBTC","BTC"];
const ETF_ETH = ["ETHA","FETH","ETHW","CETH","ETHV","QETH","EZET","ETHE","ETH"];
const ETF_SOL = ["GSOL","SOLZ","SOLT"];

const POLY = [
  { id:"sol",   label:"SOL ETF Approval (2025)",     slug:"will-the-sec-approve-a-spot-solana-etf-in-2025",          fb:72 },
  { id:"xrp",   label:"XRP ETF Approval (2025)",     slug:"will-the-sec-approve-a-spot-xrp-etf-in-2025",            fb:81 },
  { id:"multi", label:"Multi-Coin Index ETF (2025)", slug:"will-a-multi-coin-crypto-index-etf-be-approved-in-2025", fb:54 },
];

// ── Economic calendar ─────────────────────────────────────────────────────────
function firstFriday(year, month) {
  const d = new Date(year, month, 1);
  return new Date(year, month, 1 + ((5 - d.getDay() + 7) % 7));
}
function isoDate(d)   { return d.toISOString().slice(0, 10); }
function due(dateStr) { return Math.round((new Date(dateStr) - new Date(new Date().toDateString())) / 86400000); }

function buildEconCalendar() {
  const events = [];
  const MOS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  for (let m = 0; m < 12; m++)
    events.push({ date: isoDate(firstFriday(2026, m)), ev:`Non-Farm Payrolls — ${MOS[m]}`, cat:"NFP", time:"8:30 AM ET" });
  ["2026-01-28","2026-03-19","2026-05-06","2026-06-17","2026-07-29","2026-09-16","2026-10-28","2026-12-09"]
    .forEach(d => {
      events.push({ date:d, ev:"FOMC Rate Decision",         cat:"FED", time:"2:00 PM ET" });
      events.push({ date:d, ev:"Fed Chair Press Conference", cat:"FED", time:"2:30 PM ET" });
    });
  [["2026-01-15","Jan"],["2026-02-11","Feb"],["2026-03-11","Mar"],["2026-04-10","Apr"],
   ["2026-05-13","May"],["2026-06-10","Jun"],["2026-07-15","Jul"],["2026-08-12","Aug"],
   ["2026-09-09","Sep"],["2026-10-14","Oct"],["2026-11-12","Nov"],["2026-12-09","Dec"]]
    .forEach(([d,mo]) => events.push({ date:d, ev:`CPI YoY — ${mo}`, cat:"CPI", time:"8:30 AM ET" }));
  [["2026-01-30","Dec PCE"],["2026-02-27","Jan PCE"],["2026-03-27","Feb PCE"],
   ["2026-04-30","Mar PCE"],["2026-05-29","Apr PCE"],["2026-06-26","May PCE"],
   ["2026-07-31","Jun PCE"],["2026-08-28","Jul PCE"],["2026-09-25","Aug PCE"],
   ["2026-10-30","Sep PCE"],["2026-11-25","Oct PCE"],["2026-12-18","Nov PCE"]]
    .forEach(([d,label]) => events.push({ date:d, ev:`Core PCE — ${label}`, cat:"CPI", time:"8:30 AM ET" }));
  [["2026-01-29","Q4 2025 Adv."],["2026-04-30","Q1 2026 Adv."],
   ["2026-07-30","Q2 2026 Adv."],["2026-10-29","Q3 2026 Adv."]]
    .forEach(([d,label]) => events.push({ date:d, ev:`GDP Growth Rate ${label}`, cat:"GDP", time:"8:30 AM ET" }));
  events.push({ date:"2026-03-21", ev:"SEC ETF Deadline — XRP", cat:"SEC", time:"EOD" });
  events.push({ date:"2026-04-15", ev:"SEC ETF Deadline — SOL", cat:"SEC", time:"EOD" });
  return events;
}
const ECON = buildEconCalendar();

// ── Formatters ────────────────────────────────────────────────────────────────
const f   = (n, d=2) => (n==null||isNaN(n)) ? "—" : Number(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const pct = (n) => (n==null||isNaN(n)) ? "—" : (n>=0?"+":"")+f(n,2)+"%";
const fT  = (n) => n==null ? "—" : `$${f(n,2)}T`;
const fmtLong = (iso) => new Date(iso+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
const todayISO = () => new Date().toISOString().slice(0,10);

// ── Data fetchers ─────────────────────────────────────────────────────────────
const STABLE_IDS = new Set([
  "tether","usd-coin","binance-usd","dai","first-digital-usd","true-usd","paypal-usd",
  "pax-dollar","usdd","frax","crvusd","ethena-usde","mountain-protocol-usdm",
  "stasis-eurs","tether-eurt","usds","sky-usds","binance-peg-usd","usdc","usdp","tusd",
  "busd","gusd","susd","husd","eurs","xsgd","cadc","usd0","usual-usd0","aave-v3-usdc",
  "bridged-usdc","reserve-rights-token","fei-usd","magic-internet-money",
  "liquity-usd","alchemix-usd","dola-borrowing-right","usdk","usdn","usdb",
]);
// Exchange tokens, wrapped assets, tokenised real-world assets — not top-10 crypto
const SKIP_ASSET_IDS = new Set([
  "figure-heloc","whitebit","leo-token","cronos","okb","kucoin-shares",
  "huobi-token","gate","nexo","crypto-com-chain","bitget-token","bingx",
  "wbtc","wrapped-bitcoin","wrapped-ether","staked-ether","rocket-pool-eth",
  "coinbase-wrapped-staked-eth","mantle-staked-ether","lido-dao",
]);
const fmcap = (n) => n >= 1e12 ? `$${(n/1e12).toFixed(2)}T` : n >= 1e9 ? `$${(n/1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(0)}M` : "—";

const mockMkt = {
  coins:[
    {rank:1, name:"Bitcoin",   symbol:"BTC", price:83241,  change24h:-2.34, mcap:1.64e12},
    {rank:2, name:"Ethereum",  symbol:"ETH", price:1842,   change24h:-3.12, mcap:2.22e11},
    {rank:3, name:"BNB",       symbol:"BNB", price:598,    change24h:-1.1,  mcap:8.67e10},
    {rank:4, name:"Solana",    symbol:"SOL", price:131,    change24h:-4.2,  mcap:6.41e10},
    {rank:5, name:"XRP",       symbol:"XRP", price:0.509,  change24h:-1.8,  mcap:2.91e10},
    {rank:6, name:"Cardano",   symbol:"ADA", price:0.41,   change24h:-2.9,  mcap:1.45e10},
    {rank:7, name:"Avalanche", symbol:"AVAX",price:21.4,   change24h:-3.4,  mcap:8.79e9},
    {rank:8, name:"Dogecoin",  symbol:"DOGE",price:0.142,  change24h:-2.1,  mcap:2.07e10},
    {rank:9, name:"Chainlink", symbol:"LINK",price:13.8,   change24h:-2.7,  mcap:8.12e9},
    {rank:10,name:"Polkadot",  symbol:"DOT", price:6.21,   change24h:-3.0,  mcap:8.98e9},
  ],
  stables:[
    {rank:3,  name:"Tether",      symbol:"USDT", price:1.000, mcap:1.44e11, dev:0.00},
    {rank:5,  name:"USD Coin",    symbol:"USDC", price:1.000, mcap:5.78e10, dev:0.00},
    {rank:7,  name:"Dai",         symbol:"DAI",  price:1.000, mcap:5.12e9,  dev:0.00},
    {rank:9,  name:"First Digital",symbol:"FDUSD",price:1.000,mcap:2.29e9,  dev:0.00},
    {rank:11, name:"USDS",        symbol:"USDS", price:0.999, mcap:8.11e8,  dev:0.10},
  ],
  dominance:61.2,
  totalMarketCap:2.71,
};
const mockDrv = { btcFunding:0.0082, ethFunding:0.0061, cmeBasis:4.2, cmeAnnualized:6.8, btcOI:18.4, ethOI:5.2 };

async function fetchMarket() {
  const BASE = "https://api.coingecko.com/api/v3";
  const [markets, stableMarkets, global] = await Promise.all([
    fetch(`${BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h`).then(r=>r.json()),
    fetch(`${BASE}/coins/markets?vs_currency=usd&category=stablecoins&order=market_cap_desc&per_page=5&page=1&sparkline=false`).then(r=>r.json()),
    fetch(`${BASE}/global`).then(r=>r.json()),
  ]);
  const coins = markets
    .filter(c => {
      if (STABLE_IDS.has(c.id)) return false;
      if (SKIP_ASSET_IDS.has(c.id)) return false;
      // Catch any unlisted stablecoin by price proximity to $1
      if (c.current_price >= 0.96 && c.current_price <= 1.04) return false;
      return true;
    })
    .slice(0, 10)
    .map(c => ({
      rank: c.market_cap_rank,
      name: c.name,
      symbol: c.symbol.toUpperCase(),
      price: c.current_price,
      change24h: c.price_change_percentage_24h,
      mcap: c.market_cap,
    }));
  const stables = stableMarkets.slice(0, 5).map(c => ({
    rank: c.market_cap_rank,
    name: c.name,
    symbol: c.symbol.toUpperCase(),
    price: c.current_price,
    mcap: c.market_cap,
    dev: Math.abs((c.current_price - 1) * 100),
  }));
  return {
    coins,
    stables,
    dominance: global.data.market_cap_percentage.btc,
    totalMarketCap: global.data.total_market_cap.usd / 1e12,
    // keep legacy refs for derivatives / Claude prompt compatibility
    btc: coins[0] ? { price:coins[0].price, change24h:coins[0].change24h } : mockMkt.btc,
    eth: coins[1] ? { price:coins[1].price, change24h:coins[1].change24h } : mockMkt.eth,
  };
}

async function fetchDerivatives() {
  const r = await fetch("https://open-api.coinglass.com/public/v2/funding?symbol=BTC");
  const d = await r.json();
  const rate = d?.data?.[0]?.fundingRate;
  return { ...mockDrv, btcFunding: rate ? parseFloat(rate)*100 : mockDrv.btcFunding };
}

async function fetchPoly() {
  const out = {};
  await Promise.allSettled(POLY.map(async mk => {
    try {
      const r = await fetch(`https://gamma-api.polymarket.com/markets?slug=${mk.slug}`);
      const d = await r.json();
      out[mk.id] = d?.[0]?.outcomePrices ? Math.round(parseFloat(JSON.parse(d[0].outcomePrices)[0])*100) : mk.fb;
    } catch { out[mk.id] = mk.fb; }
  }));
  return out;
}

const timeout = (ms) => new Promise((_,rej) => setTimeout(()=>rej(new Error("timeout")), ms));

// ── Multi-source news ranking ─────────────────────────────────────────────────
const NEWS_FEEDS = [
  { url:"https://www.theblock.co/rss.xml",                           src:"The Block" },
  { url:"https://www.coindesk.com/arc/outboundfeeds/rss/",           src:"CoinDesk" },
  { url:"https://cointelegraph.com/rss",                             src:"Cointelegraph" },
  { url:"https://blockworks.co/feed",                                src:"Blockworks" },
  { url:"https://decrypt.co/feed",                                   src:"Decrypt" },
  { url:"https://cryptoslate.com/feed/",                             src:"CryptoSlate" },
];

function parseRSS(xmlStr, srcName) {
  try {
    const xml = new DOMParser().parseFromString(xmlStr || "", "text/xml");
    return [...xml.querySelectorAll("item")].slice(0, 12).map(el => ({
      title:       el.querySelector("title")?.textContent?.trim() || "",
      description: (el.querySelector("description")?.textContent || "").replace(/<[^>]*>/g,"").trim().slice(0,600),
      pubDate:     el.querySelector("pubDate")?.textContent || "",
      time: el.querySelector("pubDate")?.textContent
        ? new Date(el.querySelector("pubDate").textContent).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})+" ET"
        : "Today",
      src: srcName,
    })).filter(a => a.title.length > 10);
  } catch { return []; }
}

const NEWS_STOPWORDS = new Set([
  "the","a","an","is","are","of","in","on","at","to","for","and","or","as","by",
  "with","from","that","this","it","its","be","was","were","has","have","will",
  "says","said","report","reports","new","after","amid","over","under","back",
  "more","just","also","gets","what","when","how","why","who","their","they",
  "about","into","than","then","been","being","would","could","should","while",
]);

function extractKeywords(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3 && !NEWS_STOPWORDS.has(w));
}

function clusterAndRank(articles, n) {
  // Build clusters: articles sharing ≥2 keywords belong to same story
  const clusters = [];
  for (const article of articles) {
    const kw = new Set(extractKeywords(article.title));
    const match = clusters.find(c => {
      const repKw = extractKeywords(c[0].title);
      return repKw.filter(k => kw.has(k)).length >= 2;
    });
    if (match) match.push(article);
    else clusters.push([article]);
  }

  // Score each cluster
  const scored = clusters.map(cluster => {
    const uniqueSources = new Set(cluster.map(a => a.src)).size;
    const now = Date.now();
    const recencyBonus = cluster.filter(a => {
      const pd = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      return pd && (now - pd) < 2 * 60 * 60 * 1000;
    }).length * 3;
    const score = (uniqueSources * 10) + (cluster.length * 2) + recencyBonus;

    // Pick representative from highest-authority source
    const PRIORITY = ["The Block","CoinDesk","Cointelegraph","Blockworks","Decrypt","CryptoSlate"];
    const rep = cluster.slice().sort((a,b) => {
      const ai = PRIORITY.indexOf(a.src), bi = PRIORITY.indexOf(b.src);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })[0];

    return {
      ...rep,
      sources: [...new Set(cluster.map(a => a.src))],
      coverageCount: uniqueSources,
      score,
    };
  });

  // Shuffle within equal-score tiers for variety, then apply per-source cap
  const shuffled = scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Math.random() - 0.5;
  });
  const selected = [];
  const srcCounts = {};
  for (const article of shuffled) {
    if (selected.length >= n) break;
    const s = article.src;
    if ((srcCounts[s] || 0) < 2) {
      selected.push(article);
      srcCounts[s] = (srcCounts[s] || 0) + 1;
    }
  }
  return selected;
}

async function fetchNews() {
  const results = await Promise.allSettled(
    NEWS_FEEDS.map(f =>
      Promise.race([
        fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(f.url)}`),
        timeout(5000),
      ]).then(r => r.json()).then(d => parseRSS(d.contents, f.src))
    )
  );
  const all = results.flatMap(r => r.status === "fulfilled" ? r.value : []);
  return clusterAndRank(all, 7);
}

// ── Claude commentary generator ───────────────────────────────────────────────
// Returns: parsed JSON object on success, { _err: "no_key" | "api_error" | "parse_failed", msg? } on failure
async function generateCommentary({ date, mkt, drv, btcF, ethF, solF, polyD, news, customArticles=[] }) {

  const btcNet = ETF_BTC.reduce((s,k) => s+(parseFloat(btcF[k])||0), 0);
  const ethNet = ETF_ETH.reduce((s,k) => s+(parseFloat(ethF[k])||0), 0);
  const solNet = ETF_SOL.reduce((s,k) => s+(parseFloat(solF[k])||0), 0);
  const allNet = btcNet + ethNet + solNet;
  const upcoming = ECON.filter(e=>{ const d=due(e.date); return d>=0&&d<=14; })
    .sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,6);

  const prompt = `You are writing SDM MarketBeat, a premium institutional crypto daily brief for OTC derivatives desk clients. Tone: Goldman Sachs research note — precise, measured, data-driven. No markdown. No bullet points in prose fields.

Return ONLY a valid JSON object (no code fences, no extra text) with exactly this structure:
{
  "executive_summary": ["bullet 1 — tight, declarative, 15-20 words", "bullet 2", "bullet 3", "bullet 4", "bullet 5"],
  "market": { "intro": "2 sentences on price action and market structure" },
  "derivatives": { "intro": "2 sentences on funding regime and CME basis" },
  "etf": { "intro": "2 sentences on ETF flows and institutional demand signal" },
  "calendar": { "intro": "1 sentence on upcoming macro catalysts" },
  "news": { "intro": "1 sentence on dominant narrative theme" },
  "news_summaries": [
    { "headline": "topic-focused insight headline describing the market event or theme — never the source name", "summary": "1-2 sentences: content + implication", "source": "Primary source name (e.g. CoinDesk)" }
  ]
}

IMPORTANT: Every news_summaries headline must describe the market insight or event, not the source. Good: "Bitcoin open interest hits record as retail exits" — Bad: "CoinDesk reports on Bitcoin metrics"

DATA FOR ${date}:
TOP COINS: ${(mkt.coins||[]).map(c=>`${c.symbol} $${c.price>=1000?f(c.price,0):f(c.price,2)} (${pct(c.change24h)})`).join(" | ")}
BTC Dominance ${f(mkt.dominance,1)}% | Total Mkt Cap ${fT(mkt.totalMarketCap)}
STABLECOINS: ${(mkt.stables||[]).map(c=>`${c.symbol} $${f(c.price,4)} mcap ${fmcap(c.mcap)}`).join(" | ")}

DERIVATIVES:
BTC Funding ${f(drv.btcFunding,4)}% | ETH Funding ${f(drv.ethFunding,4)}% | CME Basis ${f(drv.cmeBasis,2)}% (${f(drv.cmeAnnualized,2)}% ann.) | BTC OI $${f(drv.btcOI,1)}B | ETH OI $${f(drv.ethOI,1)}B

ETF FLOWS ($M): BTC ${btcNet>=0?"+":""}${btcNet.toFixed(0)} | ETH ${ethNet>=0?"+":""}${ethNet.toFixed(0)} | SOL ${solNet>=0?"+":""}${solNet.toFixed(0)} | Combined ${allNet>=0?"+":""}${allNet.toFixed(0)}

ETF APPROVAL ODDS: ${POLY.map(p=>`${p.label}: ${polyD[p.id]||p.fb}%`).join(" | ")}

UPCOMING MACRO (14d): ${upcoming.length ? upcoming.map(e=>`${e.date} ${e.ev}`).join(" | ") : "None in window"}

NEWS TO SUMMARIZE (ranked by cross-source coverage — higher coverage = more breaking):
${news.map((n,i)=>`${i+1}. HEADLINE: ${n.title}\nCOVERAGE: ${(n.sources||[n.src]).join(", ")} (${(n.sources||[n.src]).length}/6 sources)\nDESCRIPTION: ${n.description||n.title}`).join("\n\n")}${customArticles.length?`

ADDITIONAL ARTICLES PROVIDED BY USER (summarize these alongside the news above — include each as its own entry in news_summaries):
${customArticles.map((a,i)=>`[CUSTOM ${i+1}] SOURCE: ${a.name}\n${a.text.slice(0,3000)}`).join("\n\n---\n\n")}`:""}`;

  let resp;
  try {
    resp = await Promise.race([
      fetch("/api/generate", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ prompt }),
      }),
      timeout(28000),
    ]);
  } catch(e) {
    return { _err:"api_error", msg:`Request failed: ${e.message}` };
  }

  let data;
  try { data = await resp.json(); }
  catch(e) { return { _err:"api_error", msg:`HTTP ${resp.status} — server returned non-JSON response` }; }

  if (data?.error) {
    console.error("Claude API error:", data.error);
    const errType = data.error?.type || "";
    const errMsg  = data.error?.message || JSON.stringify(data.error);
    return { _err:"api_error", msg: `${errType}: ${errMsg}` };
  }
  const text = data?.content?.[0]?.text || "";
  try { return JSON.parse(text.replace(/^```json\s*/,"").replace(/\s*```$/,"").trim()); }
  catch(e) {
    console.error("Claude JSON parse failed:", data?.stop_reason, data?.usage, text.slice(0,300));
    return { _err:"parse_failed", msg:`stop=${data?.stop_reason}` };
  }
}

// ── Export: HTML download ─────────────────────────────────────────────────────
function buildExportHTML(rootEl, date) {
  const clone = rootEl.cloneNode(true);
  clone.querySelectorAll(".noprint").forEach(el => el.remove());
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>SDM MarketBeat — ${fmtLong(date)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Poppins:wght@300;400;600&display=swap" rel="stylesheet"/>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{background:#fff;font-family:'Poppins',sans-serif;}</style>
</head><body>${clone.outerHTML}</body></html>`;
}

// ── Export: Shareable link (GitHub-backed) ────────────────────────────────────
async function createShareLink(html, date) {
  const token = getGhToken();
  if (!token) return null;
  const filename = `marketbeat-${date}.html`;
  const encoded = btoa(unescape(encodeURIComponent(html)));
  // Check if file exists first (to get SHA for update)
  let sha;
  try {
    const check = await fetch(`https://api.github.com/repos/jonah-sdm/sdm-reports/contents/${filename}`,
      { headers:{ Authorization:`token ${token}` } });
    if (check.ok) { const j = await check.json(); sha = j.sha; }
  } catch {}
  const resp = await fetch(`https://api.github.com/repos/jonah-sdm/sdm-reports/contents/${filename}`, {
    method:"PUT",
    headers:{ Authorization:`token ${token}`, "Content-Type":"application/json" },
    body: JSON.stringify({ message:`MarketBeat ${date}`, content:encoded, ...(sha?{sha}:{}) }),
  });
  if (!resp.ok) return null;
  return `https://htmlpreview.github.io/?https://raw.githubusercontent.com/jonah-sdm/sdm-reports/main/${filename}`;
}

// ── SDM Logo ──────────────────────────────────────────────────────────────────
function SDMLogo({ width = 170 }) {
  return (
    <div style={{display:"block",flexShrink:0,overflow:"visible",lineHeight:0}}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 245"
      width={width} overflow="visible" style={{display:"block"}}>
      <path fill={GOLD_BRAND} d="M69.38,81.61v-7.42c33.16-14.24,62.06-14.24,95.18,0v23.5l-9.22-3.66v-12.26c-21.14-8.77-45.06-12.1-66.81-3.46l75.87,30.17c-.2,3.5-.61,6.98-1.23,10.43l-93.8-37.3Z"/>
      <path fill={GOLD_BRAND} d="M114.54,166.32c-18.96-11.01-38.57-25.45-44.76-47.42l12.5,4.69c6.45,13.09,18.95,22.5,34.78,32.07,12.24-7.48,20.63-13.77,26.86-20.6l-74.37-29.54c-.21-3.28-.17-7.66-.17-11,6.98,2.83,86.09,34.19,90.19,35.95-9.28,16.75-25.99,28.02-42.52,37.13l-2.52-1.29Z"/>
      <g fill={INK}>
        <path d="M201.37,113.41l4.17-8.34c5.67,3.76,12.33,5.75,19.13,5.74,7.44,0,11.33-1.78,11.33-5.12s-2.38-4.16-11.81-4.99c-15.44-1.36-20.69-4.99-20.69-14.34s7.79-14.55,20.97-14.55c7.06-.23,14.01,1.71,19.94,5.54l-3.83,8.06c-4.68-3.02-10.14-4.59-15.71-4.52-6.63,0-10.54,1.85-10.54,4.99s2.39,4.17,11.81,4.99c15.44,1.37,20.69,4.99,20.69,14.35s-7.53,14.67-21.99,14.67c-9.32,0-16.9-2.11-23.47-6.48Z"/>
        <path d="M270.19,100.29h26.9v-9.14h-37.55v27.92h41.99v-9.16h-31.34v-9.62Z"/>
        <path d="M259.54,72.64v9.14h41.99v-9.14h-41.99Z"/>
        <path d="M314.77,96.06c0-15.06,10.17-24.25,26.15-24.25,6.01-.15,11.93,1.49,17,4.71l-3.13,8.62c-3.89-2.52-8.41-3.87-13.04-3.9-9.97,0-16.12,5.66-16.12,14.68s6.21,14.55,16.57,14.55c4.91.01,9.72-1.39,13.86-4.04l3.49,8.6c-4.52,3.21-10.86,4.85-18.07,4.85-16.81,0-26.7-9.01-26.7-23.83Z"/>
        <path d="M372.26,101.93v-29.29h10.65v27.58c0,7.03,3.77,10.32,11.69,10.32s11.67-3.28,11.67-10.32v-27.58h10.18v29.29c0,11.48-8,17.95-22.13,17.95s-22.07-6.48-22.07-17.95Z"/>
        <path d="M463.12,119.07l-11.54-17.08h-11.72v17.08h-10.65v-46.43h27.65c10.8,0,16.57,5.12,16.57,14.68,0,7.37-3.42,12.05-9.97,13.86l12.21,17.89h-12.56ZM439.86,92.85h15.81c4.71,0,6.9-1.78,6.9-5.53s-2.18-5.54-6.9-5.54h-15.81v11.07Z"/>
        <path d="M499.28,100.29h26.9v-9.14h-37.55v27.92h41.99v-9.16h-31.34v-9.62Z"/>
        <path d="M488.63,72.64v9.14h41.99v-9.14h-41.99Z"/>
        <text x="201.5" y="159" fontFamily="'Montserrat','Helvetica Neue',Arial,sans-serif"
          fontSize="13.5" fontWeight="600" letterSpacing="3.2" fill={INK}>DIGITAL MARKETS</text>
      </g>
    </svg>
    </div>
  );
}

// ── Settings modal ────────────────────────────────────────────────────────────
function SettingsModal({ onClose, onSave }) {
  const [gh, setGh] = useState(()=>localStorage.getItem(LS_GH_TOKEN)||"");
  const [showGh, setShowGh] = useState(false);
  const [saved, setSaved]   = useState(false);

  const handleSave = () => {
    gh.trim() ? localStorage.setItem(LS_GH_TOKEN, gh.trim()) : localStorage.removeItem(LS_GH_TOKEN);
    setSaved(true);
    setTimeout(()=>{ onSave(); onClose(); }, 600);
  };

  const mask = k => !k || k.length < 8 ? k : k.slice(0,8)+"•".repeat(Math.max(0,k.length-12))+k.slice(-4);
  const labelStyle = { fontFamily:BODY, fontSize:10, fontWeight:600, color:MUTED, letterSpacing:2, textTransform:"uppercase", marginBottom:4 };
  const descStyle  = { fontFamily:BODY, fontSize:11, color:MID, marginBottom:10 };
  const inputStyle = { flex:1, fontFamily:MONO, fontSize:12, color:INK, background:BGOFF,
    border:`1px solid ${RULE}`, borderRadius:2, padding:"9px 12px", outline:"none" };
  const btnSm = { fontFamily:BODY, fontSize:11, fontWeight:600, border:`1px solid ${RULE}`,
    borderRadius:2, padding:"7px 12px", cursor:"pointer", background:"none", color:MID };

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",
        alignItems:"center",justifyContent:"center",zIndex:1000,padding:24}}>
      <div style={{background:BG,maxWidth:520,width:"100%",boxShadow:"0 12px 60px rgba(0,0,0,0.18)"}}>
        <div style={{borderTop:`3px solid ${INK}`}}/>
        <div style={{borderTop:`2px solid ${GOLD_BRAND}`,marginTop:3}}/>
        <div style={{padding:"28px 32px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
            <div>
              <div style={{fontFamily:MONO,fontSize:10,color:MUTED,letterSpacing:3,textTransform:"uppercase",marginBottom:4}}>Configuration</div>
              <h2 style={{fontFamily:HEAD,fontSize:20,fontWeight:700,color:INK}}>Settings</h2>
            </div>
            <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontFamily:MONO,fontSize:18,color:MUTED}}>✕</button>
          </div>

          {/* GitHub token */}
          <div style={{padding:"18px 0", borderBottom:"none"}}>
            <div style={labelStyle}>GitHub Token <span style={{color:MUTED,fontWeight:400,letterSpacing:0}}>(optional)</span></div>
            <div style={descStyle}>For shareable links — saves reports to jonah-sdm/sdm-reports</div>
            <div style={{background:BGOFF,border:`1px solid ${RULE}`,borderRadius:2,padding:"12px 14px",marginBottom:12}}>
              <div style={{fontFamily:BODY,fontSize:11,fontWeight:600,color:INK,marginBottom:8}}>
                Must be created from the <span style={{fontFamily:MONO,color:BLUE}}>jonah-sdm</span> GitHub account:
              </div>
              {[
                ["1","Sign in to GitHub as jonah-sdm"],
                ["2","Go to Settings → Developer settings → Personal access tokens → Tokens (classic)"],
                ["3","Generate new token → select repo scope → copy and paste below"],
              ].map(([n,t])=>(
                <div key={n} style={{display:"flex",gap:8,marginBottom:6}}>
                  <span style={{fontFamily:MONO,fontSize:10,color:GOLD_BRAND,fontWeight:"bold",flexShrink:0}}>{n}.</span>
                  <span style={{fontFamily:BODY,fontSize:11,color:MID,lineHeight:1.5}}>{t}</span>
                </div>
              ))}
              <a href="https://github.com/login?return_to=%2Fsettings%2Ftokens%2Fnew%3Fscopes%3Drepo" target="_blank" rel="noreferrer"
                style={{fontFamily:BODY,fontSize:11,color:BLUE,display:"inline-block",marginTop:4}}>
                Open GitHub token page (log in as jonah-sdm first) ↗
              </a>
            </div>
            <div style={{display:"flex",gap:8}}>
              <input type={showGh?"text":"password"} value={gh} onChange={e=>setGh(e.target.value)}
                placeholder="ghp_..." autoComplete="off" style={inputStyle}/>
              <button onClick={()=>setShowGh(v=>!v)} style={btnSm}>{showGh?"Hide":"Show"}</button>
            </div>
            {!showGh&&gh.trim().length>10&&<div style={{fontFamily:MONO,fontSize:10,color:MUTED,marginTop:6}}>Saved: {mask(gh)}</div>}
          </div>
        </div>
        <div style={{padding:"14px 32px 20px",display:"flex",justifyContent:"flex-end",gap:10,borderTop:`0.5px solid ${RULE}`}}>
          <button onClick={onClose} style={{fontFamily:BODY,fontSize:11,fontWeight:600,background:"none",
            color:MUTED,border:`1px solid ${RULE}`,borderRadius:2,padding:"7px 18px",cursor:"pointer"}}>Cancel</button>
          <button onClick={handleSave} style={{fontFamily:BODY,fontSize:11,fontWeight:600,
            background:saved?POSL:INK,color:saved?POS:BG,border:"none",
            borderRadius:2,padding:"7px 18px",cursor:"pointer",transition:"all 0.2s"}}>
            {saved?"Saved ✓":"Save & Close"}
          </button>
        </div>
        <div style={{borderTop:`3px solid ${INK}`}}/>
        <div style={{borderTop:`2px solid ${GOLD_BRAND}`,marginTop:3}}/>
      </div>
    </div>
  );
}

// ── Tweet fetcher ─────────────────────────────────────────────────────────────
async function fetchTweet(rawUrl) {
  const url = rawUrl.trim().replace(/^https?:\/\/(www\.)?(x\.com)/, "https://twitter.com");

  // 1. oEmbed for author + tweet text (public API, no auth)
  let author = "";
  let tweetText = "";
  try {
    const oe = await Promise.race([
      fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`).then(r=>r.json()),
      timeout(8000),
    ]);
    author = oe.author_name || "";
    // Strip HTML tags from embed HTML to get plain text
    const tmp = oe.html || "";
    tweetText = tmp.replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();
  } catch { /* fall through */ }

  // 2. allorigins proxy for og:image + og:description fallback
  let imageUrl = null;
  try {
    const proxy = await Promise.race([
      fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`).then(r=>r.json()),
      timeout(8000),
    ]);
    const html = proxy.contents || "";
    const imgM = html.match(/property="og:image"\s+content="([^"]+)"/i)
                || html.match(/content="([^"]+)"\s+property="og:image"/i);
    if (imgM) imageUrl = imgM[1].replace(/&amp;/g,"&");

    if (!tweetText) {
      const descM = html.match(/property="og:description"\s+content="([^"]+)"/i)
                  || html.match(/content="([^"]+)"\s+property="og:description"/i);
      if (descM) tweetText = descM[1].replace(/&amp;/g,"&").replace(/&#39;/g,"'");
      const titleM = html.match(/property="og:title"\s+content="([^"]+)"/i)
                   || html.match(/content="([^"]+)"\s+property="og:title"/i);
      if (!author && titleM) author = (titleM[1].split(" on X:")?.[0] || "").trim();
    }
  } catch { /* no image */ }

  return {
    type: "tweet",
    name: `@${author || "tweet"} — ${tweetText.slice(0,60).trim()}…`,
    author: author || "Unknown",
    text: tweetText || url,
    imageUrl,
    sourceUrl: url,
  };
}

// ── ETF auto-fetch from GitHub data branch ────────────────────────────────────
const ETF_DATA_URL =
  "https://raw.githubusercontent.com/jonah-sdm/sdm-marketbeat/data/etf-data.json";

async function fetchCachedETF() {
  try {
    const r = await Promise.race([
      fetch(`${ETF_DATA_URL}?_=${Date.now()}`),
      new Promise((_,rej) => setTimeout(()=>rej(new Error("timeout")), 6000)),
    ]);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ── Home Screen ───────────────────────────────────────────────────────────────
function HomeScreen({ onGenerate }) {
  const [date, setDate]         = useState(todayISO());
  const [showFlows, setShowFlows]         = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [btcF, setBtcF] = useState(()=>Object.fromEntries(ETF_BTC.map(k=>[k,""])));
  const [ethF, setEthF] = useState(()=>Object.fromEntries(ETF_ETH.map(k=>[k,""])));
  const [solF, setSolF] = useState(()=>Object.fromEntries(ETF_SOL.map(k=>[k,""])));
  const [etfStatus, setEtfStatus] = useState("loading"); // "loading"|"ok"|"stale"|"unavailable"
  const [customArticles, setCustomArticles] = useState([]);

  // Auto-populate ETF flows from nightly-scraped data
  useEffect(() => {
    fetchCachedETF().then(d => {
      if (!d) { setEtfStatus("unavailable"); return; }
      const merge = (tickers, fetched, setter) =>
        setter(prev => {
          const next = { ...prev };
          tickers.forEach(k => {
            const v = fetched?.[k];
            if (v !== null && v !== undefined && prev[k] === "") next[k] = String(v);
          });
          return next;
        });
      merge(ETF_BTC, d.btc, setBtcF);
      merge(ETF_ETH, d.eth, setEthF);
      merge(ETF_SOL, d.sol, setSolF);
      const diffDays = (Date.now() - new Date(d.date+"T12:00:00").getTime()) / 86400000;
      setEtfStatus(diffDays > 2 ? "stale" : "ok");
    });
  }, []);
  const [pasteText, setPasteText]   = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const processFile = (file) => {
    const reader = new FileReader();
    if (file.name.endsWith(".pdf")) {
      // Best-effort text extraction from PDF binary without a library
      reader.readAsText(file, "latin1");
      reader.onload = () => {
        const raw = reader.result;
        // Pull visible ASCII text from PDF binary stream
        const chunks = raw.match(/\(([^\)]{4,300})\)/g) || [];
        const text = chunks.map(c=>c.slice(1,-1).replace(/\\[rnt\\()]/g," ")).join(" ").replace(/\s+/g," ").trim();
        setCustomArticles(p=>[...p,{ name:file.name, text: text.slice(0,8000)||"(PDF text extraction limited — paste key content manually)" }]);
      };
    } else {
      reader.readAsText(file);
      reader.onload = () => setCustomArticles(p=>[...p,{ name:file.name, text: String(reader.result).slice(0,8000) }]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    Array.from(e.dataTransfer.files).forEach(processFile);
  };

  const handlePasteAdd = () => {
    const t = pasteText.trim();
    if (!t) return;
    setCustomArticles(p=>[...p,{ name:`Pasted article ${p.length+1}`, text:t.slice(0,8000) }]);
    setPasteText("");
  };

  const inputStyle = { fontFamily:MONO, fontSize:12, color:INK, background:BG,
    border:`1px solid ${RULE}`, borderRadius:2, padding:"6px 10px", outline:"none",
    width:90, textAlign:"right" };

  const FlowTable = ({ tickers, flows, setFlows, label }) => (
    <div style={{flex:1,minWidth:160}}>
      <div style={{fontFamily:MONO,fontSize:10,color:MUTED,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>{label}</div>
      {tickers.map(k=>(
        <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"5px 0",borderBottom:`0.5px solid ${RULEG}`}}>
          <span style={{fontFamily:MONO,fontSize:12,color:INK}}>{k}</span>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontFamily:MONO,fontSize:11,color:MUTED}}>$</span>
            <input type="number" step="any" placeholder="—" value={flows[k]}
              onChange={e=>setFlows(p=>({...p,[k]:e.target.value}))}
              style={inputStyle}/>
            <span style={{fontFamily:MONO,fontSize:10,color:MUTED}}>M</span>
          </div>
        </div>
      ))}
      <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderTop:`1px solid ${INK}`}}>
        <span style={{fontFamily:BODY,fontSize:11,fontWeight:600,color:INK}}>Net Total</span>
        <span style={{fontFamily:MONO,fontSize:12,fontWeight:"bold",
          color:tickers.reduce((s,k)=>s+(parseFloat(flows[k])||0),0)>=0?POS:NEG}}>
          {(net=>( (net>=0?"+$":"-$") + Math.abs(net).toLocaleString("en-US",{maximumFractionDigits:0}) + "M" ))(tickers.reduce((s,k)=>s+(parseFloat(flows[k])||0),0))}
        </span>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:BGOFF,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",padding:32}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Poppins:wght@300;400;600&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:${BGOFF};}input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}`}</style>

      <div style={{width:"100%",maxWidth:680,background:BG,boxShadow:"0 2px 24px rgba(0,0,0,0.08)"}}>
        {/* Header rule */}
        <div style={{borderTop:`3px solid ${INK}`}}/>
        <div style={{borderTop:`2px solid ${GOLD_BRAND}`,marginTop:3}}/>

        <div style={{padding:"40px 48px"}}>
          {/* Logo */}
          <div style={{marginBottom:36}}>
            <SDMLogo width={140}/>
          </div>

          {/* Headline */}
          <div style={{fontFamily:MONO,fontSize:10,color:MUTED,letterSpacing:3,textTransform:"uppercase",marginBottom:10}}>
            MarketBeat
          </div>
          <h1 style={{fontFamily:HEAD,fontSize:32,fontWeight:700,color:INK,letterSpacing:-0.5,lineHeight:1.1,marginBottom:8}}>
            Daily Market Brief
          </h1>
          <p style={{fontFamily:BODY,fontSize:14,color:MID,lineHeight:1.6,marginBottom:32}}>
            Generates a full institutional crypto brief with live market data, AI-written analysis,
            ETF flows, derivatives, and news summaries — formatted as a client-ready newsletter.
          </p>

          {/* Date picker */}
          <div style={{marginBottom:28}}>
            <label style={{display:"block",fontFamily:BODY,fontSize:11,fontWeight:600,
              color:MUTED,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>
              Report Date
            </label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{fontFamily:MONO,fontSize:14,color:INK,background:BG,
                border:`1px solid ${RULE}`,borderRadius:2,padding:"10px 14px",outline:"none",
                cursor:"pointer"}}/>
            {date !== todayISO() && (
              <div style={{fontFamily:BODY,fontSize:11,color:GOLD_TEXT,marginTop:6}}>
                Note: market data will be fetched live — back-dated reports use current prices.
              </div>
            )}
          </div>


          {/* Customize accordion */}
          <div style={{marginBottom:32}}>
            <button onClick={()=>setShowCustomize(v=>!v)}
              style={{display:"flex",alignItems:"center",gap:8,fontFamily:BODY,fontSize:12,
                fontWeight:600,color:INK,background:"none",border:`1px solid ${RULE}`,
                borderRadius:2,padding:"10px 16px",cursor:"pointer",width:"100%",textAlign:"left"}}>
              <span style={{fontFamily:MONO,fontSize:11,color:MUTED}}>{showCustomize?"▼":"▶"}</span>
              Customize
              <span style={{fontFamily:BODY,fontSize:11,color:MUTED,fontWeight:400,marginLeft:"auto"}}>
                Optional · add articles, docs &amp; PDFs
              </span>
              {customArticles.length > 0 && (
                <span style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:GOLD_TEXT,
                  background:GOLD_BRAND+"22",border:`1px solid ${GOLD_BRAND}55`,
                  borderRadius:10,padding:"1px 7px",marginLeft:4}}>
                  {customArticles.length}
                </span>
              )}
            </button>

            {showCustomize && (
              <div style={{border:`1px solid ${RULE}`,borderTop:"none",padding:"20px 16px"}}>
                <div style={{fontFamily:BODY,fontSize:11,color:MUTED,marginBottom:16,lineHeight:1.6}}>
                  Upload articles, research notes, or documents to include in the News &amp; Context section.
                  Claude will summarize each one alongside live news.
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={e=>{e.preventDefault();setIsDragging(true)}}
                  onDragLeave={()=>setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={()=>fileInputRef.current?.click()}
                  style={{
                    border:`2px dashed ${isDragging?GOLD_BRAND:RULE}`,
                    borderRadius:4,padding:"22px 16px",textAlign:"center",
                    background:isDragging?GOLD_BRAND+"0a":BGOFF,
                    cursor:"pointer",marginBottom:14,transition:"all 0.15s",
                  }}>
                  <div style={{fontFamily:MONO,fontSize:18,color:isDragging?GOLD_BRAND:RULE,marginBottom:6}}>↑</div>
                  <div style={{fontFamily:BODY,fontSize:12,color:isDragging?GOLD_TEXT:MUTED}}>
                    Drop files here or <span style={{color:BLUE,textDecoration:"underline"}}>browse</span>
                  </div>
                  <div style={{fontFamily:MONO,fontSize:10,color:MUTED,marginTop:4,letterSpacing:1}}>
                    .TXT · .MD · .PDF
                  </div>
                  <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.pdf,.csv"
                    style={{display:"none"}}
                    onChange={e=>{Array.from(e.target.files).forEach(processFile);e.target.value="";}}/>
                </div>

                {/* Paste text area */}
                <div style={{marginBottom:14}}>
                  <div style={{fontFamily:MONO,fontSize:9,color:MUTED,letterSpacing:2,
                    textTransform:"uppercase",marginBottom:6}}>Or paste article text</div>
                  <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)}
                    placeholder="Paste an article, excerpt, or research note here…"
                    rows={4}
                    style={{width:"100%",fontFamily:BODY,fontSize:12,color:INK,background:BG,
                      border:`1px solid ${RULE}`,borderRadius:2,padding:"10px 12px",
                      outline:"none",resize:"vertical",lineHeight:1.6}}/>
                  <button onClick={handlePasteAdd} disabled={!pasteText.trim()}
                    style={{marginTop:6,fontFamily:BODY,fontSize:11,fontWeight:600,
                      color:pasteText.trim()?BG:MUTED,
                      background:pasteText.trim()?INK:RULE,
                      border:"none",borderRadius:2,padding:"7px 16px",cursor:pasteText.trim()?"pointer":"default"}}>
                    Add Article
                  </button>
                </div>

                {/* Added articles list */}
                {customArticles.length > 0 && (
                  <div>
                    <div style={{fontFamily:MONO,fontSize:9,color:MUTED,letterSpacing:2,
                      textTransform:"uppercase",marginBottom:8}}>Added ({customArticles.length})</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {customArticles.map((a,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:10,
                          background:BGOFF,border:`1px solid ${RULE}`,borderRadius:3,
                          padding:"8px 12px"}}>
                          <span style={{fontFamily:MONO,fontSize:11,color:GOLD_TEXT}}>◆</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontFamily:BODY,fontSize:11,fontWeight:600,color:INK,
                              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {a.name}
                            </div>
                            <div style={{fontFamily:MONO,fontSize:10,color:MUTED,marginTop:1}}>
                              {a.text.slice(0,80).trim()}…
                            </div>
                          </div>
                          <button onClick={()=>setCustomArticles(p=>p.filter((_,j)=>j!==i))}
                            style={{fontFamily:MONO,fontSize:12,color:MUTED,background:"none",
                              border:"none",cursor:"pointer",padding:"2px 6px",flexShrink:0}}
                            title="Remove">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Generate button */}
          <button onClick={()=>onGenerate({date,btcF,ethF,solF,customArticles})}
            style={{width:"100%",fontFamily:HEAD,fontSize:15,fontWeight:700,color:BG,
              background:INK,border:"none",borderRadius:2,padding:"16px 24px",
              cursor:"pointer",letterSpacing:0.5,transition:"opacity 0.2s"}}
            onMouseEnter={e=>e.target.style.opacity=0.85}
            onMouseLeave={e=>e.target.style.opacity=1}>
            Generate Report →
          </button>
        </div>

        <div style={{borderTop:`3px solid ${INK}`}}/>
        <div style={{borderTop:`2px solid ${GOLD_BRAND}`,marginTop:3}}/>
      </div>
    </div>
  );
}

// ── Generating screen ─────────────────────────────────────────────────────────
function GeneratingScreen({ steps }) {
  return (
    <div style={{minHeight:"100vh",background:BGOFF,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",padding:32}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Poppins:wght@300;400;600&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:${BGOFF};}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
      <div style={{width:"100%",maxWidth:480,background:BG,boxShadow:"0 2px 24px rgba(0,0,0,0.08)"}}>
        <div style={{borderTop:`3px solid ${INK}`}}/>
        <div style={{borderTop:`2px solid ${GOLD_BRAND}`,marginTop:3}}/>
        <div style={{padding:"40px 48px"}}>
          <SDMLogo width={120}/>
          <div style={{fontFamily:HEAD,fontSize:22,fontWeight:700,color:INK,marginTop:24,marginBottom:8}}>
            Generating your brief
          </div>
          <div style={{fontFamily:BODY,fontSize:13,color:MUTED,marginBottom:32}}>This takes about 15–20 seconds</div>
          {steps.map((step,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",
              borderBottom:i<steps.length-1?`0.5px solid ${RULEG}`:"none"}}>
              <span style={{fontFamily:MONO,fontSize:14,width:20,textAlign:"center",
                animation:step.status==="loading"?"pulse 1.2s ease-in-out infinite":"none"}}>
                {step.status==="done" ? "✓" : step.status==="loading" ? "…" : "○"}
              </span>
              <span style={{fontFamily:BODY,fontSize:13,
                color:step.status==="done"?POS:step.status==="loading"?INK:MUTED}}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
        <div style={{borderTop:`3px solid ${INK}`}}/>
        <div style={{borderTop:`2px solid ${GOLD_BRAND}`,marginTop:3}}/>
      </div>
    </div>
  );
}

// ── Rich-text editing block ────────────────────────────────────────────────────
const RTBTN_S = {
  background:"none", border:"none", color:"rgba(255,255,255,0.88)",
  fontFamily:HEAD, fontSize:11, fontWeight:600,
  padding:"3px 7px", cursor:"pointer", borderRadius:3, lineHeight:1.2,
};
function RichTextBlock({ children, style, blockStyle }) {
  const [active, setActive] = useState(false);
  const ref = useRef(null);
  const exec = (cmd, val=null) => { ref.current?.focus(); document.execCommand(cmd, false, val); };
  const Sep = () => <div style={{width:1,height:14,background:"rgba(255,255,255,0.2)",margin:"0 2px",flexShrink:0}}/>;
  const Btn = ({ cmd, val, title, label, extraStyle }) => (
    <button title={title} style={{...RTBTN_S,...extraStyle}}
      onMouseDown={e=>{e.preventDefault();exec(cmd,val)}}>{label}</button>
  );
  return (
    <div style={{position:"relative",...blockStyle}}
      onMouseEnter={()=>setActive(true)}
      onMouseLeave={()=>{ if(!ref.current?.contains(document.activeElement)) setActive(false); }}>
      {/* Floating toolbar */}
      <div className="noprint" style={{
        position:"absolute", top:-40, left:0, zIndex:500,
        background:INK, borderRadius:5, padding:"5px 8px",
        display:"flex", gap:1, alignItems:"center",
        boxShadow:"0 4px 24px rgba(0,0,0,0.55)",
        opacity:active?1:0, pointerEvents:active?"auto":"none",
        transition:"opacity 0.15s ease", whiteSpace:"nowrap",
        border:"1px solid rgba(255,255,255,0.08)",
      }}>
        <Btn cmd="bold"          label="B"  title="Bold"        extraStyle={{fontWeight:700}}/>
        <Btn cmd="italic"        label="I"  title="Italic"      extraStyle={{fontStyle:"italic"}}/>
        <Btn cmd="underline"     label="U"  title="Underline"   extraStyle={{textDecoration:"underline"}}/>
        <Btn cmd="strikeThrough" label="S"  title="Strikethrough" extraStyle={{textDecoration:"line-through",color:"rgba(255,255,255,0.45)"}}/>
        <Sep/>
        <Btn cmd="fontSize" val="2" label="A−" title="Smaller"/>
        <Btn cmd="fontSize" val="5" label="A+" title="Larger"/>
        <Sep/>
        <Btn cmd="justifyLeft"   label="⬤≡" title="Align left"/>
        <Btn cmd="justifyCenter" label="≡"   title="Center"      extraStyle={{letterSpacing:2}}/>
        <Btn cmd="justifyRight"  label="≡⬤" title="Align right"/>
        <Sep/>
        <Btn cmd="removeFormat"  label="✕" title="Clear formatting" extraStyle={{color:"rgba(255,255,255,0.35)",fontSize:10}}/>
      </div>
      {/* Editable content */}
      <div ref={ref} contentEditable suppressContentEditableWarning
        onFocus={()=>setActive(true)}
        onBlur={()=>setActive(false)}
        style={{...style, outline:"none", cursor:"text", borderRadius:3,
          transition:"box-shadow 0.15s",
          boxShadow:active?`0 0 0 1.5px ${GOLD_BRAND}55`:"none",
        }}>
        {children}
      </div>
    </div>
  );
}

// ── Report: reusable components ───────────────────────────────────────────────
function ReportSection({ number, title, intro, outro, children }) {
  const W = "0 64px";
  return (
    <div style={{marginBottom:0}}>
      <div style={{padding:W,paddingTop:32,paddingBottom:0}}>
        <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:10}}>
          <span style={{fontFamily:MONO,fontSize:10,color:MUTED,letterSpacing:2}}>{"0"+number}</span>
          <span style={{fontFamily:HEAD,fontSize:15,fontWeight:700,color:INK,letterSpacing:0.3,textTransform:"uppercase"}}>
            {title}
          </span>
        </div>
        <div style={{height:2,background:GOLD_BRAND,marginBottom:16}}/>
        {intro && (
          <RichTextBlock style={{fontFamily:BODY,fontSize:13,color:INK,lineHeight:1.75,marginBottom:20}}>
            {intro}
          </RichTextBlock>
        )}
      </div>
      <div style={{padding:W}}>{children}</div>
      {outro && (
        <div style={{padding:W,paddingTop:16,paddingBottom:4}}>
          <RichTextBlock blockStyle={{borderLeft:`3px solid ${GOLD_BRAND}`,paddingLeft:12}}
            style={{fontFamily:BODY,fontSize:12,color:MID,lineHeight:1.7,fontStyle:"italic"}}>
            {outro}
          </RichTextBlock>
        </div>
      )}
    </div>
  );
}

function DataTable({ headers, rows, footer }) {
  const thStyle = { fontFamily:HEAD, fontSize:10, fontWeight:700, color:BG, letterSpacing:1.2,
    textTransform:"uppercase", padding:"9px 14px", textAlign:"left", background:INK,
    whiteSpace:"nowrap" };
  const tdStyle = { fontFamily:BODY, fontSize:12.5, fontWeight:400, color:INK, padding:"9px 14px",
    borderBottom:`0.5px solid ${RULEG}` };
  const tdNum  = { ...tdStyle, textAlign:"right" };
  return (
    <div style={{overflowX:"auto",marginBottom:4}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead>
          <tr>{headers.map((h,i)=><th key={i} style={{...thStyle,textAlign:i>0?"right":"left"}}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row,i)=>(
            <tr key={i} style={{background:i%2===0?BG:BGOFF}}>
              {row.map((cell,j)=>(
                <td key={j} style={j===0?tdStyle:{...tdNum,...(cell?.style||{})}}>
                  {cell?.value ?? cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr style={{background:BGOFF,borderTop:`1px solid ${INK}`}}>
              {footer.map((cell,j)=>(
                <td key={j} style={{...tdStyle,fontWeight:"bold",textAlign:j===0?"left":"right"}}>
                  {cell?.value ?? cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ── Article item with per-article delete ──────────────────────────────────────
function ArticleItem({ item, index, onDelete }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
      style={{position:"relative", marginBottom:20, paddingBottom:20,
        borderBottom:`0.5px solid ${RULEG}`,
        background:hovered?`${GOLD_BRAND}06`:"transparent",
        borderRadius:4, transition:"background 0.15s",
      }}>
      <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
        <span style={{fontFamily:MONO,fontSize:10,color:MUTED,marginTop:3,flexShrink:0}}>
          {String(index+1).padStart(2,"0")}
        </span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:6}}>
            <RichTextBlock style={{fontFamily:HEAD,fontSize:13,fontWeight:600,color:INK,
              lineHeight:1.4,flex:1,minWidth:0}}>
              {item.headline}
            </RichTextBlock>
            <button className="noprint" onClick={onDelete}
              style={{
                flexShrink:0,
                background:"none", border:`1px solid ${NEG}44`,
                color:NEG, fontFamily:BODY, fontSize:10, fontWeight:600,
                padding:"2px 9px", borderRadius:3, cursor:"pointer",
                opacity:hovered?1:0, transition:"opacity 0.12s",
                lineHeight:1.6, marginTop:1,
              }}>
              ✕ Remove
            </button>
          </div>
          {item.source && (
            <div style={{fontFamily:MONO,fontSize:10,color:MUTED,marginBottom:5,letterSpacing:"0.03em"}}>
              {item.source}
            </div>
          )}
          <RichTextBlock style={{fontFamily:BODY,fontSize:12,color:MID,lineHeight:1.7}}>
            {item.summary}
          </RichTextBlock>
        </div>
      </div>
    </div>
  );
}

// ── Report Screen ─────────────────────────────────────────────────────────────
function ReportScreen({ data, onBack }) {
  const { date, mkt, drv, btcF, ethF, solF, polyD, news, commentary } = data;
  const rootRef = useRef(null);
  const [shareMsg, setShareMsg] = useState("");
  const [exporting, setExporting] = useState(false);
  const [hiddenSections, setHiddenSections] = useState(new Set());
  const hideSection = n => setHiddenSections(s => new Set([...s, n]));
  const [hiddenArticles, setHiddenArticles] = useState(new Set());
  const hideArticle = i => setHiddenArticles(s => new Set([...s, i]));

  const btcNet = ETF_BTC.reduce((s,k)=>s+(parseFloat(btcF[k])||0),0);
  const ethNet = ETF_ETH.reduce((s,k)=>s+(parseFloat(ethF[k])||0),0);
  const solNet = ETF_SOL.reduce((s,k)=>s+(parseFloat(solF[k])||0),0);
  const allNet = btcNet+ethNet+solNet;
  const upcoming = ECON.filter(e=>{const d=due(e.date);return d>=0&&d<=30;})
    .sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,8);

  const handleExportHTML = () => {
    if(!rootRef.current) return;
    const html = buildExportHTML(rootRef.current, date);
    const blob = new Blob([html],{type:"text/html;charset=utf-8"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href=url; a.download=`sdm-marketbeat-${date}.html`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if(!rootRef.current) return;
    setExporting(true); setShareMsg("Creating link…");
    const html  = buildExportHTML(rootRef.current, date);
    const url   = await createShareLink(html, date);
    setExporting(false);
    if(url) {
      await navigator.clipboard.writeText(url).catch(()=>{});
      setShareMsg("Link copied to clipboard ✓");
    } else {
      setShareMsg("Add GitHub token in Settings to enable sharing");
    }
    setTimeout(()=>setShareMsg(""), 4000);
  };

  const netColor = n => n >= 0 ? POS : NEG;
  const fFlowVal = v => (v>=0?"+$":"-$") + Math.abs(v).toLocaleString("en-US",{maximumFractionDigits:0});
  const fFlow = n => { const v=parseFloat(n); return isNaN(v) ? "—" : fFlowVal(v); };

  // ETF rows helper
  const etfRows = (tickers, flows) => tickers.map(k => {
    const v = parseFloat(flows[k]);
    return [k, isNaN(v) ? "—" : { value:fFlowVal(v), style:{color:netColor(v)} }];
  });

  const btcNetRow = ["Net Total", { value:fFlowVal(btcNet)+"M", style:{color:netColor(btcNet),fontWeight:"bold"} }];
  const ethNetRow = ["Net Total", { value:fFlowVal(ethNet)+"M", style:{color:netColor(ethNet),fontWeight:"bold"} }];
  const solNetRow = ["Net Total", { value:fFlowVal(solNet)+"M", style:{color:netColor(solNet),fontWeight:"bold"} }];

  const W = "0 64px";
  const divider = <div style={{height:"0.5px",background:RULE,margin:"28px 64px 0"}}/>;

  return (
    <div style={{background:BGOFF,minHeight:"100vh"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Poppins:wght@300;400;600&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{background:${BGOFF};}@media print{.noprint{display:none!important;}body{background:#fff!important;}}`}</style>

      {/* ── Non-printing action bar ── */}
      <div className="noprint" style={{position:"sticky",top:0,zIndex:100,background:INK,
        padding:"10px 32px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <button onClick={onBack} style={{fontFamily:BODY,fontSize:12,color:BG,background:"none",
          border:`1px solid rgba(255,255,255,0.2)`,borderRadius:2,padding:"6px 14px",cursor:"pointer"}}>
          ← New Report
        </button>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {shareMsg && <span style={{fontFamily:BODY,fontSize:11,color:GOLD_BRAND}}>{shareMsg}</span>}
          <button onClick={handleShare} disabled={exporting}
            style={{fontFamily:BODY,fontSize:12,color:INK,background:GOLD_BRAND,border:"none",
              borderRadius:2,padding:"7px 16px",cursor:"pointer",fontWeight:600}}>
            Share Link
          </button>
          <button onClick={handleExportHTML}
            style={{fontFamily:BODY,fontSize:12,color:BG,background:"none",
              border:`1px solid rgba(255,255,255,0.35)`,borderRadius:2,padding:"7px 16px",cursor:"pointer"}}>
            Export HTML
          </button>
          <button onClick={()=>window.print()}
            style={{fontFamily:BODY,fontSize:12,color:BG,background:"none",
              border:`1px solid rgba(255,255,255,0.35)`,borderRadius:2,padding:"7px 16px",cursor:"pointer"}}>
            Export PDF
          </button>
        </div>
      </div>

      {/* ── Printable report ── */}
      <div ref={rootRef} id="report-root"
        style={{maxWidth:860,margin:"0 auto",background:BG,boxShadow:"0 2px 40px rgba(0,0,0,0.08)",
          paddingBottom:48}}>

        {/* Masthead */}
        <div style={{padding:"40px 64px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
            <SDMLogo width={150}/>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:MONO,fontSize:10,color:MUTED,letterSpacing:3,textTransform:"uppercase",marginBottom:4}}>
                MarketBeat
              </div>
              <div style={{fontFamily:HEAD,fontSize:13,fontWeight:600,color:INK}}>{fmtLong(date)}</div>
            </div>
          </div>
          <div style={{borderTop:`3px solid ${INK}`}}/>
          <div style={{borderTop:`2px solid ${GOLD_BRAND}`,marginTop:3,marginBottom:20}}/>
          <h1 style={{fontFamily:HEAD,fontSize:28,fontWeight:700,color:INK,letterSpacing:-0.3,marginBottom:4}}>
            Daily Market Brief
          </h1>
          <div style={{fontFamily:BODY,fontSize:12,color:MUTED,marginBottom:24}}>
            Secure Digital Markets · Institutional Research · For internal distribution only
          </div>
        </div>

        {/* Executive Summary */}
        <div style={{padding:W,paddingBottom:0}}>
          <div style={{marginBottom:24}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <div style={{width:3,height:18,background:GOLD_BRAND,borderRadius:2,flexShrink:0}}/>
              <span style={{fontFamily:MONO,fontSize:9,fontWeight:700,color:MUTED,letterSpacing:3,textTransform:"uppercase"}}>
                Executive Summary
              </span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {commentary?._err && (
                <div style={{background:NEGL, border:`1px solid ${NEG}`, borderRadius:4,
                  padding:"14px 18px"}}>
                  <div style={{fontFamily:BODY,fontSize:13,fontWeight:600,color:INK,marginBottom:4}}>
                    AI commentary failed
                  </div>
                  <div style={{fontFamily:BODY,fontSize:12,color:MID,lineHeight:1.5}}>
                    {commentary._err === "api_error"
                      ? `API error: ${commentary.msg}`
                      : commentary._err === "parse_failed"
                        ? `Response parse error — ${commentary.msg}`
                        : `Error: ${commentary.msg || commentary._err}`}
                  </div>
                </div>
              )}
              {(Array.isArray(commentary?.executive_summary) ? commentary.executive_summary : []).map((bullet, i) => {
                const icons = ["◆","◆","◆","◆","◆"];
                return (
                  <div key={i} style={{
                    display:"flex",alignItems:"flex-start",gap:12,
                    background:i===0?GOLD_BRAND+"14":BGOFF,
                    border:`1px solid ${i===0?GOLD_BRAND+"55":RULE}`,
                    borderRadius:6,padding:"11px 14px",
                  }}>
                    <span style={{
                      fontFamily:MONO,fontSize:9,fontWeight:700,
                      color:i===0?GOLD_TEXT:MUTED,
                      marginTop:2,flexShrink:0,letterSpacing:1,
                    }}>{icons[i]}</span>
                    <RichTextBlock style={{fontFamily:BODY,fontSize:12.5,color:INK,lineHeight:1.65,fontWeight:i===0?600:400}}>
                      {bullet}
                    </RichTextBlock>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {divider}

        {/* 01 — Market Snapshot */}
        {!hiddenSections.has(1) && <ReportSection number={1} title="Market Snapshot"
          intro={commentary?.market?.intro}
          outro={commentary?.market?.outro}
          onDelete={()=>hideSection(1)}>

          {/* Table 1: Top 10 cryptos */}
          <div style={{fontFamily:BODY,fontSize:11,fontWeight:600,color:MID,
            letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>
            Top 10 by Market Cap
          </div>
          <DataTable
            headers={["#","Asset","Price (USD)","24h Change","Market Cap"]}
            rows={(mkt.coins||[]).map(c=>[
              {value:String(c.rank), style:{color:MUTED}},
              `${c.name} (${c.symbol})`,
              `$${c.price >= 1000 ? f(c.price,0) : c.price >= 1 ? f(c.price,2) : f(c.price,4)}`,
              { value:pct(c.change24h), style:{color:c.change24h>=0?POS:NEG, fontWeight:600} },
              fmcap(c.mcap),
            ])}
            footer={["","Total Market Cap", fT(mkt.totalMarketCap), "—", "—"]}
          />

          <div style={{height:20}}/>

          {/* Table 2: Top 5 stablecoins */}
          <div style={{fontFamily:BODY,fontSize:11,fontWeight:600,color:MID,
            letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>
            Stablecoins — Top 5 by Market Cap
          </div>
          <DataTable
            headers={["#","Asset","Price (USD)","Market Cap","Peg Dev."]}
            rows={(mkt.stables||[]).map(c=>[
              {value:String(c.rank), style:{color:MUTED}},
              `${c.name} (${c.symbol})`,
              {value:`$${f(c.price,4)}`, style:{color: c.dev > 0.05 ? NEG : INK}},
              fmcap(c.mcap),
              {value: c.dev < 0.01 ? "—" : `${c.dev.toFixed(2)}%`,
               style:{color: c.dev > 0.1 ? NEG : c.dev > 0.05 ? GOLD_TEXT : MUTED}},
            ])}
          />
        </ReportSection>}

        {divider}

        {/* 02 — Derivatives */}
        {!hiddenSections.has(2) && <ReportSection number={2} title="Derivatives — Funding, CME Basis & Open Interest"
          intro={commentary?.derivatives?.intro}
          outro={commentary?.derivatives?.outro}
          onDelete={()=>hideSection(2)}>
          <DataTable
            headers={["Metric","Value","Context"]}
            rows={[
              ["BTC Perp Funding (8h)", `${f(drv.btcFunding,4)}%`,
                drv.btcFunding>0.01?"Elevated — longs paying premium":drv.btcFunding<0?"Negative — shorts paying":"Neutral"],
              ["ETH Perp Funding (8h)", `${f(drv.ethFunding,4)}%`,
                drv.ethFunding>0.01?"Elevated":drv.ethFunding<0?"Negative":"Neutral"],
              ["CME Front-Month Basis",  `${f(drv.cmeBasis,2)}%`, "vs. spot"],
              ["CME Annualised Premium", `${f(drv.cmeAnnualized,2)}%`, "carry equivalent"],
              ["BTC Open Interest", `$${f(drv.btcOI,1)}B`, "perpetual + futures"],
              ["ETH Open Interest", `$${f(drv.ethOI,1)}B`, "perpetual + futures"],
            ]}
          />
        </ReportSection>}

        {divider}

        {/* 03 — ETF Flows */}
        {!hiddenSections.has(3) && <ReportSection number={3} title="ETF Flows & Approval Odds"
          intro={commentary?.etf?.intro}
          outro={commentary?.etf?.outro}
          onDelete={()=>hideSection(3)}>

          <div style={{marginBottom:20}}>
            <div style={{fontFamily:BODY,fontSize:11,fontWeight:600,color:MID,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>
              Combined Net Flow Today
            </div>
            <span style={{fontFamily:HEAD,fontSize:26,fontWeight:700,color:netColor(allNet)}}>
              {fFlowVal(allNet)}M
            </span>
            <span style={{fontFamily:BODY,fontSize:12,color:MUTED,marginLeft:8}}>USD · BTC + ETH + SOL</span>
          </div>

          <div style={{display:"flex",gap:20,flexWrap:"wrap",marginBottom:20}}>
            {[
              {label:"BTC Spot ETFs", tickers:ETF_BTC, flows:btcF, net:btcNet},
              {label:"ETH Spot ETFs", tickers:ETF_ETH, flows:ethF, net:ethNet},
              {label:"SOL Spot ETFs", tickers:ETF_SOL, flows:solF, net:solNet},
            ].map(({label,tickers,flows,net})=>(
              <div key={label} style={{flex:"1 1 180px"}}>
                <DataTable
                  headers={[label, "Flow ($M)"]}
                  rows={etfRows(tickers, flows)}
                  footer={["Net Total", { value:fFlowVal(net)+"M", style:{color:netColor(net)} }]}
                />
              </div>
            ))}
          </div>

          {/* Polymarket odds */}
          <div style={{marginTop:8}}>
            <div style={{fontFamily:BODY,fontSize:11,fontWeight:600,color:MID,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>
              Polymarket — ETF Approval Probability
            </div>
            <DataTable
              headers={["Market","Approval Odds","Source"]}
              rows={POLY.map(p=>[
                p.label,
                { value:`${polyD[p.id]||p.fb}%`, style:{
                  color: (polyD[p.id]||p.fb) >= 75 ? POS : (polyD[p.id]||p.fb) >= 50 ? GOLD_TEXT : NEG,
                  fontWeight:"bold"
                }},
                "Polymarket",
              ])}
            />
          </div>
        </ReportSection>}

        {divider}

        {/* 04 — Economic Calendar */}
        {!hiddenSections.has(4) && <ReportSection number={4} title="Economic Calendar"
          intro={commentary?.calendar?.intro}
          outro={commentary?.calendar?.outro}
          onDelete={()=>hideSection(4)}>
          <DataTable
            headers={["Date","Event","Category","Time","Days Away"]}
            rows={upcoming.map(e=>[
              new Date(e.date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}),
              e.ev,
              { value:e.cat, style:{
                color:BG, background:CAT_BG[e.cat]||"#333",
                padding:"2px 8px", borderRadius:2, fontSize:9,
                fontFamily:MONO, letterSpacing:1
              }},
              e.time,
              { value: due(e.date)===0?"Today":`${due(e.date)}d`, style:{
                color:due(e.date)<=3?NEG:due(e.date)<=7?GOLD_TEXT:MID,
                fontWeight:due(e.date)<=3?"bold":"normal"
              }},
            ])}
          />
          <div style={{fontFamily:MONO,fontSize:9,color:MUTED,marginTop:8}}>
            Source: Federal Reserve · BLS · BEA · SEC.gov · Dates computed from official published schedules
          </div>
        </ReportSection>}

        {divider}

        {/* 05 — Market News */}
        {!hiddenSections.has(5) && <ReportSection number={5} title="Market News — Key Takeaways"
          intro={commentary?.news?.intro}>
          {(commentary?.news_summaries?.length ? commentary.news_summaries : news.map(n=>({headline:n.title,summary:n.description,source:n.src})))
            .map((item, i) => hiddenArticles.has(i) ? null : (
              <ArticleItem key={i} item={item} index={i} onDelete={()=>hideArticle(i)}/>
            ))
          }
          <div style={{fontFamily:MONO,fontSize:9,color:MUTED,marginTop:16}}>
            Source: CoinDesk RSS · Summarized by Claude (Anthropic) · For internal research use only
          </div>
        </ReportSection>}

        {/* Footer */}
        <div style={{margin:"32px 64px 0"}}>
          <div style={{borderTop:`3px solid ${INK}`}}/>
          <div style={{borderTop:`2px solid ${GOLD_BRAND}`,marginTop:3}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:16}}>
            <SDMLogo width={80}/>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:BODY,fontSize:10,color:MUTED}}>
                {fmtLong(date)} · Institutional Research
              </div>
              <div style={{fontFamily:MONO,fontSize:9,color:MUTED,marginTop:3}}>
                Not investment advice · For internal distribution only
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]           = useState("home"); // home | generating | report
  const [reportData, setReportData] = useState(null);
  const [steps, setSteps]         = useState([]);

  const setStep = (i, status) => setSteps(s => s.map((st,idx) => idx===i ? {...st,status} : st));

  const handleGenerate = async ({ date, btcF, ethF, solF, customArticles=[] }) => {
    const STEPS = [
      { label:"Fetching live market data",       status:"pending" },
      { label:"Generating AI analysis (Claude)", status:"pending" },
    ];
    setSteps(STEPS);
    setView("generating");

    const mockNewsFallback = [
      { title:"Bitcoin consolidates near key support as macro uncertainty weighs", description:"Bitcoin traded sideways near critical support levels as investors assessed Federal Reserve policy signals and broader risk-off sentiment in traditional markets.", time:"Today", src:"CoinDesk" },
      { title:"Ethereum ETF inflows pick up pace amid renewed institutional interest", description:"Spot Ethereum ETFs recorded their strongest week of inflows in over a month, suggesting a broadening of institutional crypto allocation beyond Bitcoin.", time:"Today", src:"CoinDesk" },
      { title:"CME Bitcoin futures open interest climbs to multi-month high", description:"Open interest in CME Bitcoin futures reached its highest level in several months, indicating growing participation from regulated institutional participants.", time:"Today", src:"The Block" },
      { title:"SEC review timeline for altcoin ETF applications under scrutiny", description:"Market participants are monitoring the SEC's review cadence for pending spot ETF applications covering XRP, SOL, and other digital assets after several deadline extensions.", time:"Today", src:"The Block" },
      { title:"Stablecoin supply expands as on-chain activity rebounds", description:"Total stablecoin supply across major networks expanded this week, a signal analysts associate with dry powder accumulation ahead of potential spot market deployment.", time:"Today", src:"CoinDesk" },
    ];

    // Step 0: all data sources in parallel
    setStep(0,"loading");
    const [mkt, drv, polyD, rawNews] = await Promise.all([
      fetchMarket().catch(()=>mockMkt),
      fetchDerivatives().catch(()=>mockDrv),
      fetchPoly().catch(()=>({})),
      fetchNews().catch(()=>mockNewsFallback),
    ]);
    const news = rawNews.slice(0, Math.max(0, 5 - customArticles.length));
    setStep(0,"done");

    // Step 1: Claude — .catch() guarantees we ALWAYS reach setView("report")
    setStep(1,"loading");
    const commentary = await generateCommentary({ date, mkt, drv, btcF, ethF, solF, polyD:polyD||{}, news, customArticles })
      .catch(err => ({ _err:"exception", msg:err.message }));
    setStep(1,"done");

    setReportData({ date, mkt, drv, btcF, ethF, solF, polyD:polyD||{}, news, commentary, customArticles });
    setView("report");
  };

  return (
    <>
      {view === "home" && (
        <HomeScreen
          onGenerate={handleGenerate}
        />
      )}
      {view === "generating" && <GeneratingScreen steps={steps}/>}
      {view === "report" && (
        <ReportScreen data={reportData} onBack={()=>setView("home")}/>
      )}
    </>
  );
}
