/* GRAVE — $GRAVE live token module. Dependency-free (raw JSON-RPC + fetch),
   so it can run on the marketing landing and on the token page alike.
   - Live price / FDV / 24h volume / 24h change from GeckoTerminal.
   - Live burn read straight from the chain (totalSupply + burn balances).
   Populates any elements that carry the data-grave attributes it knows, and
   polls on an interval so the numbers stay live. */
(() => {
  "use strict";
  const CFG = window.GRAVE_CONFIG;
  if (!CFG || !CFG.TOKEN) return;
  const T = CFG.TOKEN;
  const NET = CFG.NETWORKS[CFG.DEFAULT_NETWORK];
  const RPC = NET.rpcUrl;
  const GT = "https://api.geckoterminal.com/api/v2/networks/" + T.gtNetwork;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const set = (name, val) => $$("[data-grave='" + name + "']").forEach((e) => { e.textContent = val; });

  /* ---------- raw JSON-RPC (no ethers) ---------- */
  async function ethCall(to, data) {
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.result;
  }
  const padAddr = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const totalSupply = () => ethCall(T.address, "0x18160ddd");
  const balanceOf = (a) => ethCall(T.address, "0x70a08231" + padAddr(a));

  /* ---------- formatting ---------- */
  const pow = 10n ** BigInt(T.decimals);
  function toUnits(bi) { return Number(bi) / Number(pow); }
  function fmtInt(n) { return Math.round(n).toLocaleString("en-US"); }
  function fmtCompact(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return fmtInt(n);
  }
  function fmtUsd(n) {
    if (!isFinite(n) || n <= 0) return "$0";
    if (n >= 1) return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // small prices: show 4 significant figures
    return "$" + n.toPrecision(4).replace(/0+$/, "").replace(/\.$/, "");
  }
  function fmtUsdBig(n) {
    if (!isFinite(n) || n <= 0) return "—";
    return "$" + fmtCompact(n);
  }

  /* ---------- live price (GeckoTerminal) ---------- */
  async function fetchPrice() {
    const out = { price: null, fdv: null, vol24: null, change24: null };
    try {
      const r = await fetch(GT + "/tokens/" + T.address, { headers: { accept: "application/json" } });
      const a = (await r.json()).data.attributes;
      out.price = parseFloat(a.price_usd);
      out.fdv = a.fdv_usd != null ? parseFloat(a.fdv_usd) : null;
      out.vol24 = a.volume_usd && a.volume_usd.h24 != null ? parseFloat(a.volume_usd.h24) : null;
    } catch (_) {}
    try {
      const r2 = await fetch(GT + "/tokens/" + T.address + "/pools", { headers: { accept: "application/json" } });
      const pools = (await r2.json()).data;
      if (pools && pools.length) {
        const pc = pools[0].attributes.price_change_percentage;
        if (pc && pc.h24 != null) out.change24 = parseFloat(pc.h24);
        if (out.vol24 == null && pools[0].attributes.volume_usd) out.vol24 = parseFloat(pools[0].attributes.volume_usd.h24);
      }
    } catch (_) {}
    return out;
  }

  /* ---------- live burn (on-chain) ---------- */
  async function fetchBurn() {
    const ts = BigInt(await totalSupply());
    let burned = 0n;
    for (const a of T.burnAddresses) {
      try { burned += BigInt(await balanceOf(a)); } catch (_) {}
    }
    const circ = ts - burned;
    const pct = ts > 0n ? Number(burned * 1000000n / ts) / 10000 : 0; // 4 dp %
    return { total: toUnits(ts), burned: toUnits(burned), circulating: toUnits(circ), pct };
  }

  /* ---------- count-up animation for the burn figure ---------- */
  const anim = {};
  function animateNumber(name, to, fmt) {
    const from = anim[name] != null ? anim[name] : to;
    anim[name] = to;
    const nodes = $$("[data-grave='" + name + "']");
    if (!nodes.length) return;
    if (from === to) { nodes.forEach((n) => (n.textContent = fmt(to))); return; }
    const dur = 900, t0 = performance.now();
    const step = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = from + (to - from) * eased;
      nodes.forEach((n) => (n.textContent = fmt(val)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- render ---------- */
  function paintPrice(p) {
    if (p.price != null) set("price", fmtUsd(p.price));
    set("fdv", fmtUsdBig(p.fdv));
    set("vol24", fmtUsdBig(p.vol24));
    if (p.change24 != null) {
      const s = (p.change24 >= 0 ? "+" : "") + p.change24.toFixed(2) + "%";
      $$("[data-grave='change24']").forEach((e) => {
        e.textContent = s;
        e.classList.remove("up", "down");
        e.classList.add(p.change24 >= 0 ? "up" : "down");
      });
    }
  }
  function paintBurn(b) {
    animateNumber("burned", b.burned, (v) => fmtInt(v));
    animateNumber("burnedCompact", b.burned, (v) => fmtCompact(v));
    set("burnPct", b.pct.toFixed(2) + "%");
    set("circulating", fmtCompact(b.circulating));
    set("supply", fmtCompact(b.total));
    const bar = $("[data-grave='burnBar']");
    if (bar) bar.style.width = Math.min(b.pct, 100).toFixed(3) + "%";
  }

  async function refresh() {
    const [p, b] = await Promise.allSettled([fetchPrice(), fetchBurn()]);
    if (p.status === "fulfilled") paintPrice(p.value);
    if (b.status === "fulfilled") paintBurn(b.value);
    const stamp = $("[data-grave='updated']");
    if (stamp) stamp.textContent = "Updated " + new Date().toLocaleTimeString();
  }

  function init() {
    // only run if the page actually has $GRAVE widgets
    if (!$("[data-grave]")) return;
    // fill static bits
    set("symbol", "$" + T.symbol);
    set("address", T.address);
    $$("[data-grave-href='explorer']").forEach((e) => (e.href = NET.explorer + "/token/" + T.address));
    $$("[data-grave-href='chart']").forEach((e) => (e.href = "https://www.geckoterminal.com/" + T.gtNetwork + "/pools/" + T.pool));
    $$("[data-grave-href='buy']").forEach((e) => (e.href = "https://www.geckoterminal.com/" + T.gtNetwork + "/pools/" + T.pool));
    // copy buttons
    $$("[data-grave-copy]").forEach((btn) => btn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(T.address); const o = btn.textContent; btn.textContent = "Copied"; setTimeout(() => (btn.textContent = o), 1500); } catch (_) {}
    }));

    refresh();
    setInterval(refresh, 45000); // live-ish; respects GeckoTerminal rate limits
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.GraveToken = { refresh, fetchPrice, fetchBurn };
})();
