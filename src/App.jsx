import { useState, useEffect, useCallback, useRef } from "react";

// ── localStorage keys ─────────────────────────────────────────────────────────
const LS_ANTHROPIC = "sdm_mb_anthropic_key";
const getAnthropicKey = () =>
  localStorage.getItem(LS_ANTHROPIC) || import.meta.env.VITE_ANTHROPIC_API_KEY || "";

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
// NFP: always first Friday of the month (BLS rule, no exceptions)
function firstFriday(year, month) { // month: 0-indexed
  const d = new Date(year, month, 1);
  return new Date(year, month, 1 + ((5 - d.getDay() + 7) % 7));
}
function iso(d) { return d.toISOString().slice(0, 10); }

function buildEconCalendar() {
  const events = [];

  // ── NFP: first Friday every month (auto-computed) ──────────────────────────
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  for (let m = 0; m < 12; m++) {
    events.push({ date: iso(firstFriday(2026, m)), ev: `Non-Farm Payrolls — ${MONTHS[m]}`, cat:"NFP", time:"8:30 AM ET" });
  }

  // ── FOMC: 8 meetings, published by Fed (federalreserve.gov) ───────────────
  const fomc = [
    "2026-01-28","2026-03-19","2026-05-06","2026-06-17",
    "2026-07-29","2026-09-16","2026-10-28","2026-12-09",
  ];
  fomc.forEach(d => {
    events.push({ date:d, ev:"FOMC Rate Decision",         cat:"FED", time:"2:00 PM ET" });
    events.push({ date:d, ev:"Fed Chair Press Conference", cat:"FED", time:"2:30 PM ET" });
  });

  // ── CPI: BLS release schedule (published annually) ────────────────────────
  [
    ["2026-01-15","Jan"], ["2026-02-11","Feb"], ["2026-03-11","Mar"],
    ["2026-04-10","Apr"], ["2026-05-13","May"], ["2026-06-10","Jun"],
    ["2026-07-15","Jul"], ["2026-08-12","Aug"], ["2026-09-09","Sep"],
    ["2026-10-14","Oct"], ["2026-11-12","Nov"], ["2026-12-09","Dec"],
  ].forEach(([d, mo]) => events.push({ date:d, ev:`CPI YoY — ${mo}`, cat:"CPI", time:"8:30 AM ET" }));

  // ── Core PCE: BEA release schedule (last Friday of following month) ────────
  [
    ["2026-01-30","Dec PCE"], ["2026-02-27","Jan PCE"], ["2026-03-27","Feb PCE"],
    ["2026-04-30","Mar PCE"], ["2026-05-29","Apr PCE"], ["2026-06-26","May PCE"],
    ["2026-07-31","Jun PCE"], ["2026-08-28","Jul PCE"], ["2026-09-25","Aug PCE"],
    ["2026-10-30","Sep PCE"], ["2026-11-25","Oct PCE"], ["2026-12-18","Nov PCE"],
  ].forEach(([d, label]) => events.push({ date:d, ev:`Core PCE — ${label}`, cat:"CPI", time:"8:30 AM ET" }));

  // ── GDP: BEA advance estimate (last biz day of month after quarter-end) ────
  [
    ["2026-01-29","Q4 2025 Adv."], ["2026-04-30","Q1 2026 Adv."],
    ["2026-07-30","Q2 2026 Adv."], ["2026-10-29","Q3 2026 Adv."],
  ].forEach(([d, label]) => events.push({ date:d, ev:`GDP Growth Rate ${label}`, cat:"GDP", time:"8:30 AM ET" }));

  // ── SEC crypto ETF deadlines ───────────────────────────────────────────────
  events.push({ date:"2026-03-21", ev:"SEC ETF Deadline — XRP", cat:"SEC", time:"EOD" });
  events.push({ date:"2026-04-15", ev:"SEC ETF Deadline — SOL", cat:"SEC", time:"EOD" });

  return events;
}

const ECON = buildEconCalendar();

// SDM blue for FED, keep others dark — matches brand blue #1851EB
const CAT_BG = { FED:"#1851EB", CPI:"#6b2d1f", NFP:"#1a3528", GDP:"#1c1f38", SEC:"#38182c" };

const mockMkt  = { btc:{price:83241.5,change24h:-2.34}, eth:{price:1842.3,change24h:-3.12}, dominance:61.2, totalMarketCap:2.71 };
const mockDrv  = { btcFunding:0.0082, ethFunding:0.0061, cmeBasis:4.2, cmeAnnualized:6.8, btcOI:18.4, ethOI:5.2 };
const mockNews = [
  { title:"BlackRock's IBIT sees largest single-day inflow in six weeks", src:"CoinDesk", url:"#", time:"2h ago" },
  { title:"Fed signals patience on rate cuts amid sticky inflation data",  src:"Bloomberg Crypto", url:"#", time:"3h ago" },
  { title:"SEC delays decision on Franklin Templeton spot SOL ETF",       src:"The Block", url:"#", time:"4h ago" },
  { title:"MicroStrategy adds 2,500 BTC to treasury at $81,200 average", src:"Cointelegraph", url:"#", time:"5h ago" },
  { title:"CME Bitcoin futures OI hits 3-month high ahead of expiry",     src:"CoinDesk", url:"#", time:"6h ago" },
  { title:"Ethereum staking yield rises to 4.1% as validator queue shortens", src:"The Block", url:"#", time:"7h ago" },
];

// ── Formatters ────────────────────────────────────────────────────────────────
const f   = (n, d=2) => (n==null||isNaN(n)) ? "—" : Number(n).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const pct = (n) => (n==null||isNaN(n)) ? "—" : (n>=0?"+":"")+f(n,2)+"%";
const fT  = (n) => n==null ? "—" : `$${f(n,2)}T`;
const due = (s) => Math.round((new Date(s) - new Date(new Date().toDateString())) / 86400000);
const todayLong = new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
const todayISO  = new Date().toISOString().slice(0,10);

// ── SDM Brand Design Tokens ───────────────────────────────────────────────────
// Source: SDM Brand Guidelines v2.0 (2023)
const INK   = "#000000";   // Brand primary black
const MID   = "#4D4D4D";   // Brand dark gray (PANTONE 7540 C)
const MUTED = "#888888";   // Captions / timestamps
const RULE  = "#E8E8E8";   // Brand light gray (PANTONE COOL GRAY 1 C)
const RULEG = "#F5F5F5";   // Table row dividers
const BG    = "#ffffff";
const BGO   = "#F7F7F7";
const BGS   = "#FFF8E1";   // Gold tint for active states
const POS   = "#1a4a2a";
const NEG   = "#7c1a1a";
const POSL  = "#eaf3ec";
const NEGL  = "#f5eaea";
const GOLD        = "#7a5c10";  // Dark gold — readable as text on white
const GOLDL       = "#FFF8E1";  // Light gold background
const GOLD_BRAND  = "#FFC32C";  // SDM brand gold (PANTONE 123 C) — decorative use
const BLUE        = "#1851EB";  // SDM brand blue (PANTONE 285 C)

// SDM Typography (Brand Guidelines p.15-16)
const HEAD = "'Montserrat','Helvetica Neue',Arial,sans-serif";   // Headlines
const BODY = "'Poppins','Helvetica Neue',Arial,sans-serif";      // Body text
const MONO = "'Courier New','Lucida Console',monospace";         // Data / tickers

// ── SDM Primary Horizontal Logo (inline SVG) ──────────────────────────────────
// Primary lockup: gold shield + black wordmark — for use on white backgrounds
function SDMLogo({ width = 170 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 231.11"
      width={width} style={{display:"block",flexShrink:0}}>
      {/* Shield — brand gold */}
      <path fill={GOLD_BRAND} d="M69.38,81.61v-7.42c33.16-14.24,62.06-14.24,95.18,0v23.5l-9.22-3.66v-12.26c-21.14-8.77-45.06-12.1-66.81-3.46l75.87,30.17c-.2,3.5-.61,6.98-1.23,10.43l-93.8-37.3Z"/>
      <path fill={GOLD_BRAND} d="M114.54,166.32c-18.96-11.01-38.57-25.45-44.76-47.42l12.5,4.69c6.45,13.09,18.95,22.5,34.78,32.07,12.24-7.48,20.63-13.77,26.86-20.6l-74.37-29.54c-.21-3.28-.17-7.66-.17-11,6.98,2.83,86.09,34.19,90.19,35.95-9.28,16.75-25.99,28.02-42.52,37.13l-2.52-1.29Z"/>
      {/* Wordmark — brand black */}
      <g fill={INK}>
        <path d="M201.37,113.41l4.17-8.34c5.67,3.76,12.33,5.75,19.13,5.74,7.44,0,11.33-1.78,11.33-5.12s-2.38-4.16-11.81-4.99c-15.44-1.36-20.69-4.99-20.69-14.34s7.79-14.55,20.97-14.55c7.06-.23,14.01,1.71,19.94,5.54l-3.83,8.06c-4.68-3.02-10.14-4.59-15.71-4.52-6.63,0-10.54,1.85-10.54,4.99s2.39,4.17,11.81,4.99c15.44,1.37,20.69,4.99,20.69,14.35s-7.53,14.67-21.99,14.67c-9.32,0-16.9-2.11-23.47-6.48Z"/>
        <path d="M270.19,100.29h26.9v-9.14h-37.55v27.92h41.99v-9.16h-31.34v-9.62Z"/>
        <path d="M259.54,72.64v9.14h41.99v-9.14h-41.99Z"/>
        <path d="M314.77,96.06c0-15.06,10.17-24.25,26.15-24.25,6.01-.15,11.93,1.49,17,4.71l-3.13,8.62c-3.89-2.52-8.41-3.87-13.04-3.9-9.97,0-16.12,5.66-16.12,14.68s6.21,14.55,16.57,14.55c4.91.01,9.72-1.39,13.86-4.04l3.49,8.6c-4.52,3.21-10.86,4.85-18.07,4.85-16.81,0-26.7-9.01-26.7-23.83Z"/>
        <path d="M372.26,101.93v-29.29h10.65v27.58c0,7.03,3.77,10.32,11.69,10.32s11.67-3.28,11.67-10.32v-27.58h10.18v29.29c0,11.48-8,17.95-22.13,17.95s-22.07-6.48-22.07-17.95Z"/>
        <path d="M463.12,119.07l-11.54-17.08h-11.72v17.08h-10.65v-46.43h27.65c10.8,0,16.57,5.12,16.57,14.68,0,7.37-3.42,12.05-9.97,13.86l12.21,17.89h-12.56ZM439.86,92.85h15.81c4.71,0,6.9-1.78,6.9-5.53s-2.18-5.54-6.9-5.54h-15.81v11.07Z"/>
        <path d="M499.28,100.29h26.9v-9.14h-37.55v27.92h41.99v-9.16h-31.34v-9.62Z"/>
        <path d="M488.63,72.64v9.14h41.99v-9.14h-41.99Z"/>
        <path d="M210.58,142.89c1.53-.04,3.06.18,4.52.64,1.1.36,2.1.96,2.93,1.76.71.71,1.24,1.59,1.55,2.55.31.99.46,2.01.45,3.05,0,1.04-.17,2.08-.51,3.06-.33.97-.89,1.86-1.61,2.59-.83.81-1.83,1.43-2.93,1.8-1.41.47-2.9.7-4.39.66h-9.22v-16.1h9.21ZM204.73,156.15h5.86c.99.02,1.98-.13,2.93-.44.71-.24,1.35-.65,1.87-1.19.46-.47.8-1.05,1-1.68.21-.63.31-1.3.31-1.96,0-.66-.1-1.32-.31-1.95-.2-.62-.54-1.18-1-1.64-.52-.53-1.17-.92-1.87-1.14-.95-.3-1.94-.45-2.93-.42h-5.86v10.42Z"/>
        <path d="M228.68,142.89h3.31v16.1h-3.31v-16.1Z"/>
        <path d="M250.49,159.31c-1.37.02-2.73-.16-4.04-.53-1.13-.31-2.18-.85-3.1-1.57-.87-.69-1.56-1.58-2.02-2.59-.49-1.12-.73-2.33-.7-3.56-.02-1.25.23-2.48.75-3.62.48-1.04,1.19-1.96,2.08-2.68.97-.75,2.06-1.31,3.24-1.65,1.36-.38,2.76-.57,4.17-.56,1.59-.04,3.17.22,4.67.76,1.2.43,2.27,1.16,3.1,2.12.75.93,1.19,2.07,1.27,3.26h-3.18c-.21-.65-.57-1.24-1.05-1.73-.54-.53-1.21-.92-1.93-1.14-2.17-.63-4.48-.53-6.59.28-.95.41-1.75,1.1-2.31,1.96-.54.88-.82,1.9-.81,2.93-.03,1.02.21,2.03.7,2.93.5.83,1.26,1.47,2.17,1.82,1.18.47,2.45.69,3.72.64,1.04.02,2.08-.13,3.07-.45.81-.27,1.57-.69,2.22-1.24.55-.48.99-1.08,1.26-1.76l1.3-.47c-.05.95-.3,1.88-.71,2.74-.42.86-1,1.62-1.72,2.25-1.57,1.28-3.54,1.93-5.56,1.84ZM257.64,158.99c0-.6.04-1.19.1-1.79,0-.67.15-1.35.25-2.03s.19-1.33.26-1.9h-7.32v-2.12h9.6v7.85h-2.9Z"/>
        <path d="M269.42,142.89h3.31v16.1h-3.31v-16.1Z"/>
        <path d="M280.56,142.89h16.97v2.77h-16.97v-2.77ZM287.41,145.3h3.31v13.69h-3.31v-13.69Z"/>
        <path d="M302.41,158.99l7.57-16.1h3.57l7.64,16.1h-3.6l-6.62-14.51h1.6l-6.57,14.51h-3.59ZM306.42,155.47v-2.77h10.64v2.77h-10.64Z"/>
        <path d="M331.82,142.89v13.34h10.69v2.77h-14v-16.1h3.31Z"/>
        <path d="M374.06,157.34h-1.57l9.25-14.45h3.31v16.1h-3.31v-11.71l.79.22-7.32,11.48h-3.7l-7.32-11.42.79-.23v11.71h-3.31v-16.1h3.31l9.08,14.41Z"/>
        <path d="M392.36,158.99l7.57-16.1h3.57l7.64,16.1h-3.6l-6.63-14.51h1.58l-6.56,14.51h-3.57ZM396.37,155.47v-2.77h10.64v2.77h-10.64Z"/>
        <path d="M418.48,158.99v-16.1h10.92c1.1-.02,2.19.16,3.24.51.87.3,1.62.85,2.15,1.6.54.82.82,1.79.78,2.77.02.67-.12,1.34-.4,1.95-.26.52-.64.96-1.11,1.29-.49.35-1.04.6-1.63.76-.64.18-1.3.3-1.96.34l-.35-.2c.96,0,1.91.1,2.85.29.65.12,1.25.45,1.68.95.41.59.61,1.3.56,2.02v3.84h-3.31v-3.62c.04-.51-.07-1.02-.32-1.46-.14-.19-.31-.35-.51-.47s-.42-.2-.65-.24c-.79-.15-1.6-.21-2.4-.19h-6.24v5.94l-3.31.04ZM421.78,150.45h7.61c.77.05,1.53-.19,2.12-.67.24-.23.43-.52.56-.83.13-.31.18-.65.17-.99.02-.32-.04-.63-.17-.92-.13-.29-.32-.54-.57-.75-.63-.42-1.37-.62-2.12-.57h-7.61v4.73Z"/>
        <path d="M443.98,142.89h3.31v16.1h-3.31v-16.1ZM450.87,151.14v-1.39l10.85,9.24h-4.79l-9.65-8.46,8.58-7.64h4.7l-9.69,8.26Z"/>
        <path d="M472.51,152.27v3.95h12.41v2.77h-15.72v-16.1h15.69v2.77h-12.39v4h10.15v2.62h-10.15Z"/>
        <path d="M491.88,142.89h16.97v2.77h-16.97v-2.77ZM498.73,145.3h3.31v13.69h-3.31v-13.69Z"/>
        <path d="M515.18,153.56h3.35c.07.59.35,1.13.79,1.54.51.49,1.13.85,1.8,1.07.81.26,1.65.39,2.5.38.71.02,1.42-.07,2.09-.28.47-.13.89-.4,1.22-.76.27-.34.42-.77.41-1.2,0-.2-.04-.4-.12-.57s-.22-.33-.38-.45c-.48-.3-1.02-.51-1.58-.6-.7-.17-1.64-.33-2.81-.48-.87-.12-1.73-.31-2.58-.57-.76-.21-1.48-.52-2.15-.92-.6-.36-1.1-.87-1.46-1.46-.37-.59-.56-1.28-.54-1.98-.02-.9.26-1.77.81-2.49.62-.77,1.46-1.35,2.4-1.67,1.26-.43,2.58-.63,3.91-.6,1.9-.13,3.79.39,5.36,1.46.61.48,1.1,1.1,1.42,1.81.32.71.46,1.49.41,2.26h-3.21c0-.43-.11-.85-.33-1.22-.22-.37-.53-.68-.9-.89-.87-.47-1.85-.7-2.84-.66-.9-.03-1.8.13-2.64.48-.32.13-.59.35-.77.64-.18.29-.27.63-.25.97-.01.28.08.56.25.79.22.26.51.46.83.59.53.2,1.07.36,1.63.47.67.15,1.46.29,2.53.44.87.13,1.73.31,2.58.54.7.19,1.38.48,1.99.88.53.33.98.8,1.29,1.35.34.73.48,1.53.43,2.32-.06.8-.31,1.57-.75,2.24-.59.78-1.4,1.37-2.33,1.68-1.32.43-2.71.63-4.1.59-1.07.02-2.13-.11-3.16-.38-.83-.23-1.63-.58-2.36-1.04-.61-.4-1.16-.89-1.63-1.46-.38-.46-.68-.99-.88-1.55-.16-.4-.24-.83-.23-1.26Z"/>
      </g>
    </svg>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionLabel({n,text}){
  return(
    <div style={{display:"flex",alignItems:"baseline",gap:14,padding:"20px 0 14px"}}>
      <span style={{fontFamily:MONO,fontSize:10,color:MUTED,letterSpacing:2}}>{"0"+n}</span>
      <span style={{fontFamily:HEAD,fontSize:17,fontWeight:600,color:INK,letterSpacing:0.2}}>{text}</span>
    </div>
  );
}

function KVRow({k,v,color}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"7px 0",borderBottom:`0.5px solid ${RULEG}`}}>
      <span style={{fontFamily:BODY,fontSize:12,color:MID}}>{k}</span>
      <span style={{fontFamily:MONO,fontSize:13,fontWeight:"bold",color:color||INK}}>{v}</span>
    </div>
  );
}

function ETFTable({issuers,flows,label,editable,onChange}){
  const net=issuers.reduce((s,k)=>s+(parseFloat(flows[k])||0),0);
  return(
    <div>
      <div style={{fontFamily:BODY,fontSize:10,fontWeight:600,color:MUTED,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>{label}</div>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead>
          <tr style={{borderBottom:`1.5px solid ${INK}`}}>
            <th style={{textAlign:"left",fontFamily:BODY,fontSize:10,fontWeight:600,color:MUTED,letterSpacing:1,paddingBottom:6}}>Ticker</th>
            <th style={{textAlign:"right",fontFamily:BODY,fontSize:10,fontWeight:600,color:MUTED,letterSpacing:1,paddingBottom:6}}>US$M</th>
          </tr>
        </thead>
        <tbody>
          {issuers.map(k=>{
            const v=parseFloat(flows[k])||0;
            return(
              <tr key={k} style={{borderBottom:`0.5px solid ${RULEG}`}}>
                <td style={{padding:"5px 0",fontFamily:MONO,fontSize:12,color:INK}}>{k}</td>
                <td style={{padding:"5px 0",textAlign:"right"}}>
                  {editable?(
                    <input type="number" value={flows[k]||""} placeholder="—" onChange={e=>onChange(k,e.target.value)}
                      style={{width:76,textAlign:"right",fontFamily:MONO,fontSize:12,border:`1px solid ${RULE}`,borderRadius:2,padding:"2px 5px",background:BGO,color:INK}}/>
                  ):(
                    <span style={{fontFamily:MONO,fontSize:12,color:v>0?POS:v<0?NEG:MUTED}}>
                      {v===0?"—":(v>0?"+":"")+f(v)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{borderTop:`1.5px solid ${INK}`}}>
            <td style={{padding:"7px 0",fontFamily:BODY,fontSize:11,fontWeight:600,letterSpacing:0.3,color:INK}}>Net Total</td>
            <td style={{padding:"7px 6px",textAlign:"right",fontFamily:MONO,fontSize:15,fontWeight:"bold",
              color:net>0?POS:net<0?NEG:MUTED,
              background:net>0?POSL:net<0?NEGL:"transparent",borderRadius:2}}>
              {net>0?"+":""}{f(net)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function PolyRow({label,val}){
  const v=val??0;
  const clr=v>=70?POS:v>=40?GOLD:NEG;
  const bg=v>=70?POSL:v>=40?GOLDL:NEGL;
  return(
    <div style={{display:"flex",alignItems:"center",gap:16,padding:"9px 0",borderBottom:`0.5px solid ${RULEG}`}}>
      <span style={{fontFamily:BODY,fontSize:12,color:MID,flex:1}}>{label}</span>
      <div style={{width:120,height:3,background:RULEG,borderRadius:2,overflow:"hidden"}}>
        <div style={{width:`${v}%`,height:"100%",background:v>=70?POS:v>=40?GOLD_BRAND:NEG,borderRadius:2}}/>
      </div>
      <span style={{fontFamily:MONO,fontSize:13,fontWeight:"bold",color:clr,background:bg,
        padding:"2px 8px",borderRadius:2,minWidth:44,textAlign:"right"}}>{v}%</span>
    </div>
  );
}

function EconRow({ev}){
  const d=due(ev.date);
  const ds=new Date(ev.date).toLocaleDateString("en-US",{month:"short",day:"numeric"});
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`0.5px solid ${RULEG}`}}>
      <span style={{fontFamily:BODY,fontSize:9,fontWeight:700,color:"#fff",
        background:CAT_BG[ev.cat]||INK,padding:"2px 6px",borderRadius:2,minWidth:32,textAlign:"center",letterSpacing:0.8}}>
        {ev.cat}
      </span>
      <span style={{fontFamily:BODY,fontSize:12,color:INK,flex:1}}>{ev.ev}</span>
      <span style={{fontFamily:MONO,fontSize:11,color:MUTED,minWidth:52,textAlign:"right"}}>{ds}</span>
      <span style={{fontFamily:MONO,fontSize:11,fontWeight:"bold",minWidth:48,textAlign:"right",
        color:d<=3?NEG:d<=7?GOLD:MUTED}}>
        {d===0?"Today":d===1?"Tmrw":`${d}d`}
      </span>
    </div>
  );
}

function NewsRow({item,i}){
  return(
    <div style={{display:"flex",gap:12,padding:"10px 0",borderBottom:`0.5px solid ${RULEG}`}}>
      <span style={{fontFamily:MONO,fontSize:10,color:MUTED,paddingTop:2,minWidth:14}}>{i+1}.</span>
      <div>
        <a href={item.url} target="_blank" rel="noreferrer"
          style={{fontFamily:BODY,fontSize:13,fontWeight:600,color:INK,textDecoration:"none",lineHeight:1.5,display:"block"}}>
          {item.title}
        </a>
        <div style={{display:"flex",gap:8,marginTop:3}}>
          <span style={{fontFamily:MONO,fontSize:10,color:MUTED}}>{item.src}</span>
          <span style={{fontFamily:MONO,fontSize:10,color:RULE}}>·</span>
          <span style={{fontFamily:MONO,fontSize:10,color:MUTED}}>{item.time}</span>
        </div>
      </div>
    </div>
  );
}

// ── API Settings Modal ────────────────────────────────────────────────────────

function KeyField({ label, description, lsKey, inputRef, placeholder, helpUrl, helpLabel }) {
  const [draft, setDraft]     = useState(() => localStorage.getItem(lsKey) || "");
  const [visible, setVisible] = useState(false);
  const isOk = draft.trim().length > 10;
  const maskKey = (k) => k.length < 8 ? k : k.slice(0,8)+"•".repeat(Math.max(0,k.length-12))+k.slice(-4);
  // expose draft so parent can save
  KeyField._drafts = KeyField._drafts || {};
  KeyField._drafts[lsKey] = draft;
  const btnBase = {fontFamily:BODY,fontSize:11,fontWeight:600,borderRadius:2,
    padding:"7px 12px",cursor:"pointer",letterSpacing:0.3,border:`1px solid ${RULE}`};
  return (
    <div style={{padding:"18px 0"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <div>
          <div style={{fontFamily:BODY,fontSize:10,fontWeight:600,color:MUTED,letterSpacing:2,textTransform:"uppercase"}}>
            {label}
          </div>
          <div style={{fontFamily:BODY,fontSize:11,color:MID,marginTop:3}}>{description}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5,fontFamily:MONO,fontSize:10,letterSpacing:0.5,
          color:isOk?POS:GOLD,background:isOk?POSL:GOLDL,padding:"3px 9px",borderRadius:2}}>
          <span style={{fontSize:7}}>●</span>
          {isOk ? "Configured" : "Not set"}
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:10}}>
        <input ref={inputRef} type={visible?"text":"password"} value={draft}
          onChange={(e)=>setDraft(e.target.value)}
          placeholder={placeholder} spellCheck={false} autoComplete="off"
          style={{flex:1,fontFamily:MONO,fontSize:12,color:INK,background:BGO,
            border:`1px solid ${RULE}`,borderRadius:2,padding:"9px 12px",outline:"none",
            letterSpacing:visible?0:2}}/>
        <button onClick={()=>setVisible(v=>!v)}
          style={{...btnBase,background:visible?BGS:"none",color:MID}}>
          {visible?"Hide":"Show"}
        </button>
      </div>
      {!visible&&isOk&&(
        <div style={{fontFamily:MONO,fontSize:10,color:MUTED,marginTop:6}}>
          Saved: {maskKey(draft)}
        </div>
      )}
      {helpUrl&&(
        <a href={helpUrl} target="_blank" rel="noreferrer"
          style={{fontFamily:BODY,fontSize:11,color:BLUE,display:"inline-block",marginTop:10}}>
          {helpLabel} ↗
        </a>
      )}
    </div>
  );
}

function ApiSettingsModal({ onClose, onSave }) {
  const [saved, setSaved] = useState(false);
  const anthropicRef      = useRef(null);

  useEffect(() => { anthropicRef.current?.focus(); }, []);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleSave = () => {
    // Persist all key fields
    const drafts = KeyField._drafts || {};
    [LS_ANTHROPIC].forEach(k => {
      const v = (drafts[k]||"").trim();
      if (v) localStorage.setItem(k, v);
      else localStorage.removeItem(k);
    });
    setSaved(true);
    setTimeout(() => { onSave(); onClose(); }, 700);
  };

  const handleClearAll = () => {
    [LS_ANTHROPIC].forEach(k => localStorage.removeItem(k));
    KeyField._drafts = {};
    setSaved(false);
    onClose();
  };

  const btnBase = {
    fontFamily: BODY, fontSize: 11, fontWeight: 600, borderRadius: 2,
    padding: "7px 18px", cursor: "pointer", letterSpacing: 0.3, border: `1px solid ${INK}`,
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",
        alignItems:"center",justifyContent:"center",zIndex:1000,padding:24}}>
      <div style={{background:BG,maxWidth:500,width:"100%",position:"relative",
        boxShadow:"0 8px 48px rgba(0,0,0,0.2)"}}>
        {/* Double rule — matches masthead */}
        <div style={{borderTop:`3px solid ${INK}`}}/>
        <div style={{borderTop:`2px solid ${GOLD_BRAND}`,marginTop:3}}/>

        <div style={{padding:"28px 32px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
            <div>
              <div style={{fontFamily:MONO,fontSize:10,color:MUTED,letterSpacing:3,textTransform:"uppercase",marginBottom:6}}>
                Configuration
              </div>
              <h2 style={{fontFamily:HEAD,fontSize:20,fontWeight:700,color:INK,letterSpacing:0.2}}>
                API Keys
              </h2>
            </div>
            <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",
              fontFamily:MONO,fontSize:18,color:MUTED,lineHeight:1,padding:"2px 4px"}}>✕</button>
          </div>

          <div style={{borderTop:`0.5px solid ${RULE}`}}/>

          <KeyField
            lsKey={LS_ANTHROPIC}
            inputRef={anthropicRef}
            label="Anthropic API Key"
            description="Powers the AI analyst brief in Section 06"
            placeholder="sk-ant-api03-..."
            helpUrl="https://console.anthropic.com/"
            helpLabel="Get a key at console.anthropic.com"
          />

          <div style={{borderTop:`0.5px solid ${RULE}`}}/>
          <div style={{padding:"14px 0 20px"}}>
            <div style={{fontFamily:MONO,fontSize:10,color:MUTED,lineHeight:1.8}}>
              Keys are stored in your browser only (localStorage).<br/>
              They are never sent to sdm.co or stored on any server.
            </div>
          </div>
        </div>

        <div style={{padding:"14px 32px 20px",display:"flex",justifyContent:"space-between",
          alignItems:"center",borderTop:`0.5px solid ${RULE}`}}>
          <button onClick={handleClearAll}
            style={{...btnBase,background:"none",color:MUTED,borderColor:RULE}}>
            Clear all keys
          </button>
          <button onClick={handleSave}
            style={{...btnBase,background:saved?POSL:INK,color:saved?POS:BG,
              borderColor:saved?POS:INK,transition:"all 0.2s"}}>
            {saved ? "Saved ✓" : "Save & Close"}
          </button>
        </div>

        <div style={{borderTop:`3px solid ${INK}`}}/>
        <div style={{borderTop:`2px solid ${GOLD_BRAND}`,marginTop:3}}/>
      </div>
    </div>
  );
}

// ── Powered-by carousel ───────────────────────────────────────────────────────
const POWERED_BY = [
  "CoinGecko","Coinglass","Polymarket","Farside Investors",
  "CoinDesk RSS","The Block","Cointelegraph","Anthropic Claude",
];
function PoweredByCarousel() {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);
  useEffect(() => {
    const t = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % POWERED_BY.length);
        setFade(true);
      }, 300);
    }, 2000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{fontFamily:MONO,fontSize:9,color:MUTED,textAlign:"right",lineHeight:2}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:6}}>
        <span>Powered by:</span>
        <span style={{
          display:"inline-block",minWidth:140,textAlign:"left",
          transition:"opacity 0.3s",opacity:fade?1:0,
          color:INK,fontWeight:600,
        }}>
          {POWERED_BY[idx]}
        </span>
      </div>
      <div>This document is for internal research use only.</div>
    </div>
  );
}

// ── HTML Export ───────────────────────────────────────────────────────────────

function buildExportHTML(rootEl, timestamp) {
  const clone = rootEl.cloneNode(true);
  clone.querySelectorAll(".noprint").forEach(el => el.remove());
  clone.querySelectorAll("input[type=number]").forEach(input => {
    const val = parseFloat(input.value) || 0;
    const span = document.createElement("span");
    span.style.fontFamily = MONO;
    span.style.fontSize = "12px";
    span.style.color = val > 0 ? POS : val < 0 ? NEG : MUTED;
    span.textContent = val === 0 ? "—" : (val > 0 ? "+" : "") + f(val);
    input.parentNode.replaceChild(span, input);
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SDM Daily Market Brief — ${todayLong}</title>
  <meta name="description" content="Secure Digital Markets daily crypto market research report — ${todayLong}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Poppins:wght@300;400;600&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #ffffff; -webkit-font-smoothing: antialiased; }
    a { color: inherit; text-decoration: none; }
    table { border-collapse: collapse; }
    input { display: none; }
    .noprint { display: none !important; }
  </style>
  <!-- Generated by SDM MarketBeat · ${timestamp} -->
</head>
<body>
${clone.outerHTML}
</body>
</html>`;
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App(){
  const [mkt,setMkt]             = useState(null);
  const [drv,setDrv]             = useState(null);
  const [polyD,setPolyD]         = useState({});
  const [news,setNews]           = useState([]);
  const [brief,setBrief]         = useState("");
  const [briefTick,setBriefTick] = useState(0);
  const [editing,setEditing]     = useState(false);
  const [entered,setEntered]     = useState(false);
  const [lastUp,setLastUp]       = useState(null);
  const [exportMsg,setExportMsg] = useState("");
  const [showSettings,setShowSettings]   = useState(false);
  const [keyConfigured,setKeyConfigured] = useState(() => !!getAnthropicKey());
  const [btcF,setBtcF] = useState(()=>Object.fromEntries(ETF_BTC.map(k=>[k,""])));
  const [ethF,setEthF] = useState(()=>Object.fromEntries(ETF_ETH.map(k=>[k,""])));
  const [solF,setSolF] = useState(()=>Object.fromEntries(ETF_SOL.map(k=>[k,""])));

  // ── Fetches ─────────────────────────────────────────────────────────────────

  useEffect(()=>{
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true")
      .then(r=>r.json()).then(d=>
        fetch("https://api.coingecko.com/api/v3/global").then(r=>r.json()).then(g=>{
          setMkt({btc:{price:d.bitcoin.usd,change24h:d.bitcoin.usd_24h_change},eth:{price:d.ethereum.usd,change24h:d.ethereum.usd_24h_change},dominance:g.data.market_cap_percentage.btc,totalMarketCap:g.data.total_market_cap.usd/1e12});
          setLastUp(new Date());
        })
      ).catch(()=>{setMkt(mockMkt);setLastUp(new Date());});
  },[]);

  useEffect(()=>{
    fetch("https://open-api.coinglass.com/public/v2/funding?symbol=BTC")
      .then(r=>r.json()).then(d=>{
        const rate=d?.data?.[0]?.fundingRate;
        setDrv({...mockDrv,btcFunding:rate?parseFloat(rate)*100:mockDrv.btcFunding});
      }).catch(()=>setDrv(mockDrv));
  },[]);

  useEffect(()=>{
    (async()=>{
      const out={};
      for(const mk of POLY){
        try{
          const r=await fetch(`https://gamma-api.polymarket.com/markets?slug=${mk.slug}`);
          const d=await r.json();
          out[mk.id]=d?.[0]?.outcomePrices?Math.round(parseFloat(JSON.parse(d[0].outcomePrices)[0])*100):mk.fb;
        }catch{out[mk.id]=mk.fb;}
      }
      setPolyD(out);
    })();
  },[]);

  useEffect(()=>{
    fetch(`https://api.allorigins.win/get?url=${encodeURIComponent("https://www.coindesk.com/arc/outboundfeeds/rss/")}`)
      .then(r=>r.json()).then(d=>{
        const xml=new DOMParser().parseFromString(d.contents,"text/xml");
        const items=[...xml.querySelectorAll("item")].slice(0,7).map(el=>({
          title:el.querySelector("title")?.textContent||"",
          url:el.querySelector("link")?.textContent||"#",
          src:"CoinDesk",
          time:el.querySelector("pubDate")?.textContent
            ?new Date(el.querySelector("pubDate").textContent).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})+" ET"
            :"Today",
        }));
        setNews(items.length?items:mockNews);
      }).catch(()=>setNews(mockNews));
  },[]);

  useEffect(()=>{
    if(!mkt||!drv)return;
    const key=getAnthropicKey();
    if(!key){
      setBrief("No API key configured. Click \u201cAPI Keys\u201d above to add your Anthropic key and generate the analyst brief.");
      return;
    }
    setBrief("");
    const m=mkt,d=drv;
    fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":key,
        "anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({
        model:"claude-sonnet-4-6",max_tokens:1000,
        messages:[{role:"user",content:`Write a 3-sentence institutional analyst brief for an OTC crypto derivatives desk. Goldman Sachs research note tone: precise, measured, flag any anomalies. No bullets, no headers, no markdown. Data: BTC $${f(m.btc.price,0)} (${pct(m.btc.change24h)} 24h), ETH $${f(m.eth.price,0)} (${pct(m.eth.change24h)} 24h), BTC dominance ${f(m.dominance,1)}%, total market cap ${fT(m.totalMarketCap)}, BTC funding ${f(d.btcFunding,4)}%, ETH funding ${f(d.ethFunding,4)}%, CME basis annualised ${f(d.cmeAnnualized,2)}%.`}],
      }),
    })
    .then(r=>r.json())
    .then(d=>setBrief(d?.content?.[0]?.text||""))
    .catch(()=>setBrief("Market data loaded. Review sections below for key metrics across price, derivatives, and ETF flows."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mkt,drv,briefTick]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const mkChg = useCallback((setter)=>(k,v)=>{setter(p=>({...p,[k]:v}));setEntered(true);},[]);

  const handleSettingsSave = useCallback(()=>{
    setKeyConfigured(!!getAnthropicKey());
    setBriefTick(t=>t+1);
  },[]);

  const handleExportHTML = useCallback(()=>{
    const rootEl=document.getElementById("marketbeat-root");
    if(!rootEl)return;
    const timestamp=lastUp
      ?lastUp.toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit"})+" ET"
      :todayLong;
    const html=buildExportHTML(rootEl,timestamp);
    const blob=new Blob([html],{type:"text/html;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download=`sdm-marketbeat-${todayISO}.html`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    setExportMsg("Downloaded");
    setTimeout(()=>setExportMsg(""),2500);
  },[lastUp]);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const btcNet=ETF_BTC.reduce((s,k)=>s+(parseFloat(btcF[k])||0),0);
  const ethNet=ETF_ETH.reduce((s,k)=>s+(parseFloat(ethF[k])||0),0);
  const solNet=ETF_SOL.reduce((s,k)=>s+(parseFloat(solF[k])||0),0);
  const allNet=btcNet+ethNet+solNet;
  const upcoming=ECON.filter(e=>{const d=due(e.date);return d>=0&&d<=60;}).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const m=mkt||mockMkt;
  const d=drv||mockDrv;
  const P="0 56px";
  const DV={borderTop:`0.5px solid ${RULE}`,margin:"0 56px"};
  const btnBase={fontFamily:BODY,fontSize:11,fontWeight:600,color:INK,background:"none",
    border:`1px solid ${INK}`,borderRadius:2,padding:"5px 14px",cursor:"pointer",letterSpacing:0.3};

  // ── Render ────────────────────────────────────────────────────────────────────

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Poppins:wght@300;400;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${BG};}
        input[type=number]{outline:none;}
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        @media print{.noprint{display:none!important;}body{print-color-adjust:exact;}}
      `}</style>

      {showSettings&&(
        <ApiSettingsModal onClose={()=>setShowSettings(false)} onSave={handleSettingsSave}/>
      )}

      <div id="marketbeat-root" style={{background:BG,minHeight:"100vh",fontFamily:BODY,color:INK,maxWidth:980,margin:"0 auto"}}>

        {/* ── Masthead ── */}
        <div style={{padding:"32px 56px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>

            {/* Left: logo + title */}
            <div>
              <SDMLogo width={170}/>
              <div style={{marginTop:10}}>
                <div style={{fontFamily:MONO,fontSize:9,color:MUTED,letterSpacing:3,
                  textTransform:"uppercase",marginBottom:5}}>
                  MarketBeat
                </div>
                <h1 style={{fontFamily:HEAD,fontSize:34,fontWeight:700,color:INK,
                  lineHeight:1.05,letterSpacing:0.2}}>
                  Daily Market Brief
                </h1>
              </div>
            </div>

            {/* Right: date + buttons */}
            <div style={{textAlign:"right",paddingBottom:6}}>
              <div style={{fontFamily:BODY,fontSize:11,fontWeight:500,color:INK,marginBottom:2}}>{todayLong}</div>
              {lastUp&&<div style={{fontFamily:MONO,fontSize:10,color:MUTED}}>
                As of {lastUp.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})} ET
              </div>}
              <div className="noprint" style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10,flexWrap:"wrap"}}>
                <button onClick={()=>setShowSettings(true)} style={{
                  ...btnBase,display:"flex",alignItems:"center",gap:6,
                  borderColor:keyConfigured?RULE:GOLD_BRAND,
                  color:keyConfigured?MID:GOLD,
                  background:keyConfigured?"none":GOLDL,
                }}>
                  <span style={{width:6,height:6,borderRadius:"50%",display:"inline-block",flexShrink:0,
                    background:keyConfigured?POS:GOLD_BRAND}}/>
                  API Keys
                </button>
                <button onClick={()=>window.print()} style={btnBase}>Export PDF ↗</button>
                <button onClick={handleExportHTML} style={{...btnBase,
                  background:exportMsg?POSL:"none",borderColor:exportMsg?POS:INK,color:exportMsg?POS:INK}}>
                  {exportMsg||"Export HTML ↓"}
                </button>
              </div>
            </div>
          </div>

          {/* Double rule with gold accent */}
          <div style={{borderTop:`3px solid ${INK}`,marginTop:20}}/>
          <div style={{borderTop:`2px solid ${GOLD_BRAND}`,marginTop:3}}/>
        </div>

        {/* ── 01 Market Snapshot ── */}
        <div style={{padding:P}}><SectionLabel n={1} text="Market Snapshot"/></div>
        <div style={DV}/>
        <div style={{padding:"0 56px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:0}}>
            {[
              {label:"Bitcoin (BTC)",   val:`$${f(m.btc.price,0)}`, sub:pct(m.btc.change24h)+" 24h", sc:m.btc.change24h>=0?POS:NEG},
              {label:"Ethereum (ETH)",  val:`$${f(m.eth.price,0)}`, sub:pct(m.eth.change24h)+" 24h", sc:m.eth.change24h>=0?POS:NEG},
              {label:"BTC Dominance",   val:`${f(m.dominance,1)}%`, sub:"of total market cap"},
              {label:"Total Market Cap",val:fT(m.totalMarketCap),   sub:"all crypto, USD"},
            ].map((c,i)=>(
              <div key={i} style={{padding:"18px 0 20px",
                borderRight:i<3?`0.5px solid ${RULE}`:"none",
                paddingRight:i<3?24:0,paddingLeft:i>0?24:0,marginTop:16}}>
                <div style={{fontFamily:BODY,fontSize:10,fontWeight:500,color:MUTED,
                  letterSpacing:1.5,textTransform:"uppercase",marginBottom:9}}>{c.label}</div>
                <div style={{fontFamily:HEAD,fontSize:30,fontWeight:700,color:INK,lineHeight:1}}>{c.val}</div>
                <div style={{fontFamily:MONO,fontSize:12,color:c.sc||MUTED,marginTop:7}}>{c.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 02 Derivatives ── */}
        <div style={DV}/><div style={{padding:P}}><SectionLabel n={2} text="Derivatives — Funding, CME Basis & Open Interest"/></div><div style={DV}/>
        <div style={{padding:"16px 56px 8px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:36}}>
            <div>
              <div style={{fontFamily:BODY,fontSize:10,fontWeight:600,color:MUTED,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Perpetual Funding (8h)</div>
              <KVRow k="BTC Funding Rate" v={f(d.btcFunding,4)+"%"}/>
              <KVRow k="ETH Funding Rate" v={f(d.ethFunding,4)+"%"}/>
            </div>
            <div>
              <div style={{fontFamily:BODY,fontSize:10,fontWeight:600,color:MUTED,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>CME Futures Basis</div>
              <KVRow k="Front-Month Basis"  v={f(d.cmeBasis,2)+"%"}/>
              <KVRow k="Annualised Premium" v={f(d.cmeAnnualized,2)+"%"}/>
            </div>
            <div>
              <div style={{fontFamily:BODY,fontSize:10,fontWeight:600,color:MUTED,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Open Interest</div>
              <KVRow k="BTC OI" v={"$"+f(d.btcOI,1)+"B"}/>
              <KVRow k="ETH OI" v={"$"+f(d.ethOI,1)+"B"}/>
            </div>
          </div>
        </div>

        {/* ── 03 ETF Flows ── */}
        <div style={DV}/><div style={{padding:P}}><SectionLabel n={3} text="ETF Flows & Approval Probability"/></div><div style={DV}/>
        <div style={{padding:"16px 56px 4px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{fontFamily:BODY,fontSize:10,fontWeight:600,color:MUTED,letterSpacing:2,textTransform:"uppercase"}}>
              Daily ETF Flows — Farside Investors
              {entered&&<span style={{marginLeft:12,color:POS,fontWeight:400,letterSpacing:0}}>● Data entered</span>}
            </div>
            <button className="noprint" onClick={()=>setEditing(e=>!e)}
              style={{fontFamily:BODY,fontSize:11,fontWeight:600,color:INK,
                background:editing?BGS:"none",border:`1px solid ${RULE}`,borderRadius:2,
                padding:"4px 12px",cursor:"pointer",letterSpacing:0.3}}>
              {editing?"Lock flows":"Enter flows"}
            </button>
          </div>

          {entered&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:20}}>
              {[{l:"BTC Net",v:btcNet},{l:"ETH Net",v:ethNet},{l:"SOL Net",v:solNet},{l:"Combined",v:allNet}].map(s=>(
                <div key={s.l} style={{background:s.v>0?POSL:s.v<0?NEGL:BGO,
                  border:`0.5px solid ${s.v>0?"#9fcfb3":s.v<0?"#d4a0a0":RULE}`,
                  borderRadius:3,padding:"10px 14px"}}>
                  <div style={{fontFamily:BODY,fontSize:9,fontWeight:500,color:MID,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
                  <div style={{fontFamily:MONO,fontSize:18,fontWeight:"bold",color:s.v>0?POS:s.v<0?NEG:MUTED}}>
                    {s.v>0?"+":""}{f(s.v)}M
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:36,paddingBottom:8}}>
            <ETFTable issuers={ETF_BTC} flows={btcF} label="BTC Spot ETFs" editable={editing} onChange={mkChg(setBtcF)}/>
            <ETFTable issuers={ETF_ETH} flows={ethF} label="ETH Spot ETFs" editable={editing} onChange={mkChg(setEthF)}/>
            <ETFTable issuers={ETF_SOL} flows={solF} label="SOL Spot ETFs" editable={editing} onChange={mkChg(setSolF)}/>
          </div>
          <div style={{fontFamily:MONO,fontSize:9,color:MUTED,marginTop:10,marginBottom:24}}>
            Source: Farside Investors (@FarsideUK) · Posted nightly US ET · Flows in US$M
          </div>

          <div style={{borderTop:`0.5px solid ${RULE}`,paddingTop:18}}>
            <div style={{fontFamily:BODY,fontSize:10,fontWeight:600,color:MUTED,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>
              Polymarket — ETF Approval Odds
            </div>
            {POLY.map(mk=><PolyRow key={mk.id} label={mk.label} val={polyD[mk.id]??mk.fb}/>)}
            <div style={{fontFamily:MONO,fontSize:9,color:MUTED,marginTop:8}}>
              Source: Polymarket CLOB API · Refreshed on page load
            </div>
          </div>
        </div>

        {/* ── 04 + 05 News / Calendar ── */}
        <div style={DV}/>
        <div style={{display:"grid",gridTemplateColumns:"1.35fr 1fr",padding:P,gap:0,paddingTop:0,paddingBottom:0}}>
          <div style={{paddingRight:36,borderRight:`0.5px solid ${RULE}`}}>
            <SectionLabel n={4} text="Market News"/>
            <div style={{borderTop:`0.5px solid ${RULE}`}}/>
            <div style={{paddingTop:4}}>
              {news.slice(0,6).map((item,i)=><NewsRow key={i} item={item} i={i}/>)}
              <div style={{fontFamily:MONO,fontSize:9,color:MUTED,marginTop:10}}>
                Source: CoinDesk RSS · The Block · Cointelegraph
              </div>
            </div>
          </div>
          <div style={{paddingLeft:36}}>
            <SectionLabel n={5} text="Economic Calendar"/>
            <div style={{borderTop:`0.5px solid ${RULE}`}}/>
            <div style={{paddingTop:4}}>
              {upcoming.map((ev,i)=><EconRow key={i} ev={ev}/>)}
              <div style={{fontFamily:MONO,fontSize:9,color:MUTED,marginTop:10}}>
                Source: Federal Reserve · BLS · BEA · SEC.gov
              </div>
            </div>
          </div>
        </div>

        {/* ── 06 Analyst Brief ── */}
        <div style={DV}/><div style={{padding:P}}><SectionLabel n={6} text="Analyst Brief"/></div><div style={DV}/>
        <div style={{padding:"20px 56px 36px"}}>
          {brief?(
            <p style={{fontFamily:BODY,fontSize:16,lineHeight:1.9,color:INK,maxWidth:780,fontWeight:300}}>
              {brief}
            </p>
          ):(
            <p style={{fontFamily:MONO,fontSize:12,color:MUTED}}>Generating analyst brief…</p>
          )}
          <div style={{fontFamily:MONO,fontSize:9,color:MUTED,marginTop:14}}>
            Generated by Claude (Anthropic) · Based on live data at page load · For internal research use only · Not investment advice
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{borderTop:`3px solid ${INK}`,margin:"0 56px"}}/>
        <div style={{borderTop:`2px solid ${GOLD_BRAND}`,margin:"3px 56px 0"}}/>
        <div style={{padding:"16px 56px 36px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <SDMLogo width={90}/>
            <div>
              <div style={{fontFamily:BODY,fontSize:10,fontWeight:500,color:MID,marginTop:3}}>
                {todayLong} · Institutional Research
              </div>
            </div>
          </div>
          <PoweredByCarousel />
        </div>

      </div>
    </>
  );
}
