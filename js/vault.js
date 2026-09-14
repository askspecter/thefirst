/* GRAVE — public read-only vault page. No wallet required; reads directly from
   the chain RPC so anyone can inspect a vault's status and history. */
(() => {
  "use strict";
  const CFG = window.GRAVE_CONFIG;
  const NET = CFG.NETWORKS[CFG.DEFAULT_NETWORK];
  const { ABI } = CFG;
  const GS = window.GraveShared;
  const el = (id) => document.getElementById(id);

  const short = GS.short;
  const addrLink = (a) => NET.explorer + "/address/" + a;

  let toastTimer = null;
  function toast(msg, opts = {}) {
    const t = el("toast");
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove("show"); setTimeout(() => { t.hidden = true; }, 300); }, opts.timeout || 4000);
  }

  function showPanel(name) {
    ["invalid", "loading", "vault"].forEach((p) => { const n = el("panel-" + p); if (n) n.hidden = p !== name; });
  }

  function getAddress() {
    const p = new URLSearchParams(location.search);
    return (p.get("address") || p.get("v") || p.get("vault") || "").trim();
  }

  let cdTimer = null;
  function startCountdown(deadlineSec, executed) {
    clearInterval(cdTimer);
    const wrap = el("countdown");
    const tick = () => {
      let diff = deadlineSec - Math.floor(Date.now() / 1000);
      wrap.classList.toggle("expired", diff <= 0 || executed);
      if (diff < 0) diff = 0;
      el("cdDays").textContent = Math.floor(diff / 86400);
      el("cdHours").textContent = String(Math.floor((diff % 86400) / 3600)).padStart(2, "0");
      el("cdMins").textContent = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
      el("cdSecs").textContent = String(diff % 60).padStart(2, "0");
    };
    tick();
    cdTimer = setInterval(tick, 1000);
  }

  async function main() {
    const addr = getAddress();
    if (!addr || !ethers.isAddress(addr)) {
      el("invalidText").textContent = addr ? "That is not a valid address." : "No vault address in this link.";
      return showPanel("invalid");
    }
    const vaultAddr = ethers.getAddress(addr);
    const provider = new ethers.JsonRpcProvider(NET.rpcUrl, NET.chainId);
    const v = new ethers.Contract(vaultAddr, ABI.vault, provider);

    let owner, dl, executed, expired, bens, tokens, lastCheckIn, interval, grace;
    try {
      [owner, dl, executed, expired, bens, tokens, lastCheckIn, interval, grace] = await Promise.all([
        v.owner(), v.deadline(), v.executed(), v.isExpired(), v.getBeneficiaries(), v.getTokens(),
        v.lastCheckIn(), v.checkInInterval(), v.gracePeriod(),
      ]);
    } catch (e) {
      el("invalidText").textContent = "No GRAVE Vault found at this address on " + NET.label + ".";
      return showPanel("invalid");
    }
    if (!owner || owner === ethers.ZeroAddress) {
      el("invalidText").textContent = "No GRAVE Vault found at this address.";
      return showPanel("invalid");
    }

    showPanel("vault");

    el("vaultAddrLink").textContent = short(vaultAddr) + "  ↗";
    el("vaultAddrLink").href = addrLink(vaultAddr);

    // status + progress
    const life = GS.computeLife(lastCheckIn, interval, grace, executed);
    GS.paintLife({
      state: el("lifeState"), track: el("lifeTrack"),
      fillInterval: el("lifeFillInterval"), fillGrace: el("lifeFillGrace"),
      intervalLbl: el("lifeIntervalLbl"), graceLbl: el("lifeGraceLbl"), lastLbl: el("lifeLastLbl"),
    }, life);

    const badge = el("statusBadge");
    badge.className = "status-badge";
    if (executed) { badge.textContent = "Executed"; badge.classList.add("executed"); }
    else if (expired) { badge.textContent = "Execution ready"; badge.classList.add("pending"); }
    else if (life.state === "grace") { badge.textContent = "Grace period"; badge.classList.add("pending"); }
    else { badge.textContent = "Active"; badge.classList.add("active"); }

    startCountdown(Number(dl), executed);
    el("cdCaption").textContent = executed
      ? "vault executed — assets are claimable"
      : (expired ? "grace period elapsed — execution unlocked"
        : (life.state === "grace" ? "grace period — owner can still check in" : "until execution unlocks"));

    // assets
    const ethBal = await provider.getBalance(vaultAddr);
    el("ethBal").textContent = (+ethers.formatEther(ethBal)).toFixed(5) + " ETH";
    const tokenData = await loadTokenData(provider, vaultAddr, tokens);
    renderTokens(tokenData);

    // beneficiaries + estimated allocations
    renderBeneficiaries(bens, ethBal, tokenData);

    // activity
    GS.renderActivity(provider, vaultAddr, el("activityList"));

    el("shareBtn").addEventListener("click", async () => {
      const url = location.href;
      try { if (navigator.share) { await navigator.share({ title: "GRAVE Vault", url }); return; } } catch (_) { return; }
      try { await navigator.clipboard.writeText(url); toast("Link copied."); } catch (_) { toast(url, { timeout: 8000 }); }
    });
  }

  const iconCache = {};
  async function tokenIcon(addr) {
    if (addr in iconCache) return iconCache[addr];
    try { const r = await fetch(NET.explorer + "/api/v2/tokens/" + addr); const d = await r.json(); iconCache[addr] = d.icon_url || null; }
    catch (_) { iconCache[addr] = null; }
    return iconCache[addr];
  }
  function tokenAvatar(sym, icon) {
    const s = (sym || "?").replace(/[<>]/g, "").slice(0, 3);
    const mono = `<span class="ti-mono"${icon ? ' style="display:none"' : ""}>${s}</span>`;
    const img = icon ? `<img class="ti-icon" src="${icon}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : "";
    return `<span class="ti-avatar">${img}${mono}</span>`;
  }

  async function loadTokenData(provider, vaultAddr, tokens) {
    const out = [];
    for (const addr of tokens) {
      const erc = new ethers.Contract(addr, ABI.erc20, provider);
      let sym = short(addr), dec = 18, bal = 0n;
      try { [sym, dec, bal] = await Promise.all([erc.symbol(), erc.decimals(), erc.balanceOf(vaultAddr)]); } catch (_) {}
      out.push({ addr, sym, dec: Number(dec), bal, icon: await tokenIcon(addr) });
    }
    return out;
  }

  function renderTokens(tokenData) {
    const list = el("tokenList");
    list.innerHTML = "";
    if (!tokenData.length) { list.innerHTML = '<div class="muted-row">No RWA tokens deposited yet.</div>'; return; }
    for (const t of tokenData) {
      const row = document.createElement("div");
      row.className = "asset-row";
      row.innerHTML = `<span class="asset-left">${tokenAvatar(t.sym, t.icon)}<span class="asset-sym">${t.sym}</span></span><span class="asset-bal">${(+ethers.formatUnits(t.bal, t.dec)).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>`;
      list.appendChild(row);
    }
  }

  function renderBeneficiaries(bens, ethBal, tokenData) {
    const list = el("benList");
    list.innerHTML = "";
    bens.forEach((b) => {
      const bps = Number(b.bps);
      const item = document.createElement("div");
      item.className = "ben-item-wrap";
      let preview = `<div class="ben-alloc"><div class="asset-row"><span class="asset-sym">ETH</span><span class="asset-bal">${(+ethers.formatEther(ethBal * BigInt(bps) / 10000n)).toFixed(5)}</span></div>`;
      for (const t of tokenData) {
        const share = t.bal * BigInt(bps) / 10000n;
        preview += `<div class="asset-row"><span class="asset-sym">${t.sym}</span><span class="asset-bal">${(+ethers.formatUnits(share, t.dec)).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span></div>`;
      }
      preview += `<p class="ben-alloc-note">Estimated share at today's balance. Fixed by an onchain snapshot at execution.</p></div>`;
      item.innerHTML =
        `<button type="button" class="ben-item ben-toggle" aria-expanded="false">` +
          `<span class="addr">${short(b.account)}</span>` +
          `<span class="share">${bps / 100}% <span class="ben-caret">▾</span></span>` +
        `</button>` + preview;
      const btn = item.querySelector(".ben-toggle");
      const alloc = item.querySelector(".ben-alloc");
      btn.addEventListener("click", () => {
        const open = alloc.classList.toggle("open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      list.appendChild(item);
    });
  }

  main();
})();
