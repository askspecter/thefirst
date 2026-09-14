(() => {
  'use strict';

  const CFG = window.GRAVE_CONFIG;
  const NET = CFG.NETWORKS[CFG.DEFAULT_NETWORK];
  const FACTORY_ADDR = resolveFactory();
  function resolveFactory() {
    const configured = CFG.FACTORY[CFG.DEFAULT_NETWORK];
    if (configured) return configured;
    try {
      const saved = localStorage.getItem("grave_factory_" + CFG.DEFAULT_NETWORK);
      if (saved && ethers.isAddress(saved)) return saved;
    } catch (_) {}
    return "";
  }
  const { ABI } = CFG;
  const GS = window.GraveShared;

  const el = (id) => document.getElementById(id);
  const PANELS = ["connect", "network", "nofactory", "create", "dashboard"];

  let provider = null;   // ethers BrowserProvider (wallet)
  let signer = null;
  let account = null;
  let chainId = null;
  let vaultAddr = null;
  let cdTimer = null;
  let lifeData = null;
  let usingAppKit = false;
  const APPKIT_CONFIGURED = !!CFG.WALLETCONNECT_PROJECT_ID;

  /* ------------------------------------------------------------------ */
  /*  UI helpers                                                         */
  /* ------------------------------------------------------------------ */
  function showPanel(name) {
    PANELS.forEach((p) => { const n = el("panel-" + p); if (n) n.hidden = p !== name; });
  }

  function short(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : ""; }

  let toastTimer = null;
  function toast(msg, opts = {}) {
    const t = el("toast");
    t.innerHTML = msg + (opts.link ? ` <a class="toast-link" href="${opts.link}" target="_blank" rel="noopener">view</a>` : "");
    t.classList.toggle("error", !!opts.error);
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer);
    if (opts.timeout !== 0) {
      toastTimer = setTimeout(() => {
        t.classList.remove("show");
        setTimeout(() => { t.hidden = true; }, 300);
      }, opts.timeout || 6000);
    }
  }

  function txLink(hash) { return NET.explorer + "/tx/" + hash; }
  function addrLink(a) { return NET.explorer + "/address/" + a; }

  function errMsg(e) {
    return e?.info?.error?.message || e?.reason || e?.shortMessage || e?.message || "Transaction failed";
  }

  async function withBusy(btn, fn) {
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>' + btn.textContent;
    try { return await fn(); }
    finally { btn.disabled = false; btn.innerHTML = label; }
  }

  async function sendTx(btn, fn, { pending = "Submitted, waiting for confirmation…", done = "Confirmed" } = {}) {
    return withBusy(btn, async () => {
      const tx = await fn();
      toast(pending, { link: txLink(tx.hash), timeout: 0 });
      const rec = await tx.wait();
      toast(done, { link: txLink(tx.hash) });
      return rec;
    }).catch((e) => { toast(errMsg(e), { error: true }); throw e; });
  }

  /* ------------------------------------------------------------------ */
  /*  Wallet                                                            */
  /* ------------------------------------------------------------------ */
  let connectedVia = null;

  // Inside a wallet's in-app browser the injected provider is the wallet itself;
  // WalletConnect there often fails ("connection declined / previous request active").
  function isInAppWallet() {
    return !!window.ethereum && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  // Primary entry: in-app wallet → injected; otherwise the Reown AppKit modal.
  async function connect() {
    if (isInAppWallet()) return connectInjected();
    if (window.GraveWallet && window.GraveWallet.available) {
      usingAppKit = true;
      window.GraveWallet.open();
      return;
    }
    if (APPKIT_CONFIGURED && !window.GraveWallet) {
      toast("Wallet options are still loading — try again in a moment.");
      return;
    }
    return connectInjected();
  }

  // Basic EIP-1193 injected connect.
  async function connectInjected() {
    if (!window.ethereum) { el("noWalletHint").hidden = false; return; }
    usingAppKit = false;
    connectedVia = "injected";
    provider = new ethers.BrowserProvider(window.ethereum, "any");
    try {
      const accs = await provider.send("eth_requestAccounts", []);
      await onConnected(window.ethereum, accs[0]);
    } catch (e) { toast(errMsg(e), { error: true }); }
  }

  // Shared: build ethers provider/signer from any EIP-1193 source, then route.
  async function onConnected(eip1193, address, cid) {
    provider = new ethers.BrowserProvider(eip1193, "any");
    signer = await provider.getSigner();
    account = ethers.getAddress(address);
    chainId = cid != null ? Number(cid) : Number((await provider.getNetwork()).chainId);
    updateNav();
    await route();
  }

  function updateNav() {
    const connected = !!account;
    const onNet = chainId === NET.chainId;
    el("netPill").hidden = !connected;
    el("netLabel").textContent = onNet ? NET.label : "Wrong network";
    el("netPill").classList.toggle("wrong", connected && !onNet);
    const label = connected ? short(account) : "Connect Wallet";
    el("connectBtn").textContent = label;
    const b2 = el("connectBtn2"); if (b2) b2.textContent = connected ? short(account) : "Connect Wallet";
  }

  async function switchNetwork() {
    if (usingAppKit && window.GraveWallet) {
      try { window.GraveWallet.switchNetwork(); } catch (e) { toast(errMsg(e), { error: true }); }
      return;
    }
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: NET.chainIdHex }] });
    } catch (e) {
      if (e.code === 4902 || String(e.message || "").includes("Unrecognized")) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: NET.chainIdHex,
              chainName: NET.label,
              rpcUrls: [NET.rpcUrl],
              nativeCurrency: NET.currency,
              blockExplorerUrls: [NET.explorer],
            }],
          });
        } catch (e2) { toast(errMsg(e2), { error: true }); }
      } else { toast(errMsg(e), { error: true }); }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Routing                                                           */
  /* ------------------------------------------------------------------ */
  async function route() {
    if (!account) return showPanel("connect");
    if (chainId !== NET.chainId) {
      el("targetNetName").textContent = NET.label;
      if (NET.faucet) { const h = el("faucetHint"); h.hidden = false; h.innerHTML = `Need test ETH? <a class="toast-link" href="${NET.faucet}" target="_blank" rel="noopener">Robinhood Chain faucet</a>`; }
      return showPanel("network");
    }
    if (!FACTORY_ADDR) return showPanel("nofactory");

    try {
      const factory = new ethers.Contract(FACTORY_ADDR, ABI.factory, provider);
      vaultAddr = await factory.vaultOf(account);
    } catch (e) { toast("Could not reach the protocol: " + errMsg(e), { error: true }); return; }

    if (!vaultAddr || vaultAddr === ethers.ZeroAddress) {
      ensureBenRows();
      showPanel("create");
    } else {
      showPanel("dashboard");
      await loadDashboard();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Create vault                                                      */
  /* ------------------------------------------------------------------ */
  function benRowTemplate(addr = "", pct = "") {
    const row = document.createElement("div");
    row.className = "ben-row";
    row.innerHTML =
      `<input type="text" class="ben-addr" placeholder="0x beneficiary address" spellcheck="false" value="${addr}">` +
      `<span class="pct"><input type="number" class="ben-pct" min="0" max="100" step="any" placeholder="0" value="${pct}"></span>` +
      `<button type="button" class="ben-del" title="Remove">×</button>`;
    row.querySelector(".ben-del").addEventListener("click", () => { row.remove(); updateBenSum(); });
    row.querySelector(".ben-pct").addEventListener("input", updateBenSum);
    return row;
  }

  function ensureBenRows() {
    const wrap = el("benRows");
    if (wrap.children.length === 0) wrap.appendChild(benRowTemplate());
    updateBenSum();
  }

  function updateBenSum() {
    let sum = 0;
    document.querySelectorAll(".ben-pct").forEach((i) => { sum += parseFloat(i.value) || 0; });
    const s = el("benSum");
    s.textContent = "Total: " + (Math.round(sum * 100) / 100) + "%";
    s.classList.toggle("ok", Math.abs(sum - 100) < 1e-9);
    s.classList.toggle("bad", sum > 0 && Math.abs(sum - 100) >= 1e-9);
  }

  function daysToSecs(d) { return BigInt(Math.round(parseFloat(d) * 86400)); }

  async function createVault(e) {
    e.preventDefault();
    const interval = daysToSecs(el("interval").value);
    const grace = daysToSecs(el("grace").value);
    if (interval <= 0n) return toast("Check-in interval must be greater than zero.", { error: true });

    const accounts = [], bpsArr = [];
    let bpsTotal = 0;
    for (const row of document.querySelectorAll(".ben-row")) {
      const a = row.querySelector(".ben-addr").value.trim();
      const p = parseFloat(row.querySelector(".ben-pct").value);
      if (!a && !p) continue;
      if (!ethers.isAddress(a)) return toast("Invalid beneficiary address: " + a, { error: true });
      if (!p || p <= 0) return toast("Each beneficiary needs a share above 0%.", { error: true });
      accounts.push(ethers.getAddress(a));
      bpsArr.push(Math.round(p * 100));
      bpsTotal += Math.round(p * 100);
    }
    if (accounts.length === 0) return toast("Add at least one beneficiary.", { error: true });
    if (bpsTotal !== 10000) return toast("Beneficiary shares must add up to exactly 100%.", { error: true });

    const guardians = (el("guardians").value.match(/0x[a-fA-F0-9]{40}/g) || []).map(ethers.getAddress);

    const factory = new ethers.Contract(FACTORY_ADDR, ABI.factory, signer);
    try {
      await sendTx(el("createBtn"), () => factory.createVault(interval, grace, accounts, bpsArr, guardians),
        { done: "Vault created." });
      await route();
    } catch (_) {}
  }

  /* ------------------------------------------------------------------ */
  /*  Dashboard                                                         */
  /* ------------------------------------------------------------------ */
  async function loadDashboard() {
    const v = new ethers.Contract(vaultAddr, ABI.vault, provider);
    let owner, dl, executed, expired, bens, tokens, lastCheckIn, interval, grace;
    try {
      [owner, dl, executed, expired, bens, tokens, lastCheckIn, interval, grace] = await Promise.all([
        v.owner(), v.deadline(), v.executed(), v.isExpired(), v.getBeneficiaries(), v.getTokens(),
        v.lastCheckIn(), v.checkInInterval(), v.gracePeriod(),
      ]);
    } catch (e) { toast("Could not load vault: " + errMsg(e), { error: true }); return; }

    const isOwner = owner.toLowerCase() === account.toLowerCase();
    let guardianFlag = false;
    if (!isOwner) { try { guardianFlag = await v.isGuardian(account); } catch (_) {} }

    el("vaultAddrLink").textContent = short(vaultAddr) + "  ↗";
    el("vaultAddrLink").href = addrLink(vaultAddr);

    // proof-of-life status + progress bar
    lifeData = GS.computeLife(lastCheckIn, interval, grace, executed);
    GS.paintLife({
      state: el("lifeState"), track: el("lifeTrack"),
      fillInterval: el("lifeFillInterval"), fillGrace: el("lifeFillGrace"),
      intervalLbl: el("lifeIntervalLbl"), graceLbl: el("lifeGraceLbl"), lastLbl: el("lifeLastLbl"),
    }, lifeData);

    // status badge (nav-level)
    const badge = el("statusBadge");
    badge.className = "status-badge";
    if (executed) { badge.textContent = "Executed"; badge.classList.add("executed"); }
    else if (expired) { badge.textContent = "Execution ready"; badge.classList.add("pending"); }
    else if (lifeData.state === "grace") { badge.textContent = "Grace period"; badge.classList.add("pending"); }
    else { badge.textContent = "Active"; badge.classList.add("active"); }

    // countdown
    startCountdown(Number(dl), executed);
    el("cdCaption").textContent = executed
      ? "vault executed — assets are claimable"
      : (expired ? "grace period elapsed — execution unlocked"
        : (lifeData.state === "grace" ? "grace period — check in now to cancel" : "until execution unlocks"));

    // heartbeat actions
    el("checkInBtn").hidden = executed || !(isOwner || guardianFlag);
    el("executeBtn").hidden = executed || !expired;
    // reminder: owner/guardian, active vault only
    el("remindBtn").hidden = executed || !(isOwner || guardianFlag);
    maybeWarnDeadline(lifeData);

    // assets
    const ethBal = await provider.getBalance(vaultAddr);
    el("ethBal").textContent = (+ethers.formatEther(ethBal)).toFixed(5) + " ETH";
    const tokenData = await loadTokenData(v, tokens);
    renderTokens(tokenData);

    // beneficiaries + estimated per-heir allocations
    renderBeneficiaries(bens, ethBal, tokenData);

    // activity timeline
    GS.renderActivity(provider, vaultAddr, el("activityList"));

    // deposit card only for owner + active
    el("depositCard").hidden = !isOwner || executed;

    // claim card
    const myBps = Number(await v.bpsOf(account).catch(() => 0));
    const claimed = myBps > 0 ? await v.claimed(account).catch(() => false) : false;
    const claimCard = el("claimCard");
    if (executed && myBps > 0 && !claimed) {
      claimCard.hidden = false;
      await renderClaimPreview(v);
    } else {
      claimCard.hidden = true;
    }
  }

  // Load token metadata + vault balances once, reused for the asset list and
  // the per-beneficiary allocation preview.
  async function loadTokenData(v, tokens) {
    const out = [];
    for (const addr of tokens) {
      const erc = new ethers.Contract(addr, ABI.erc20, provider);
      let sym = short(addr), dec = 18, bal = 0n;
      try { [sym, dec, bal] = await Promise.all([erc.symbol(), erc.decimals(), erc.balanceOf(vaultAddr)]); } catch (_) {}
      const icon = await tokenIcon(addr);
      out.push({ addr, sym, dec: Number(dec), bal, icon });
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

  // Beneficiaries with an expandable preview of the estimated share each would
  // receive at today's balances (bps × balance ÷ 10,000).
  function renderBeneficiaries(bens, ethBal, tokenData) {
    const list = el("benList");
    list.innerHTML = "";
    bens.forEach((b) => {
      const you = b.account.toLowerCase() === account.toLowerCase();
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
          `<span class="addr">${short(b.account)}${you ? '<span class="you">you</span>' : ""}</span>` +
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

  async function renderClaimPreview(v) {
    try {
      const [ethAmt, toks, amts] = await v.previewClaim(account);
      let html = `<div class="asset-row"><span class="asset-sym">ETH</span><span class="asset-bal">${(+ethers.formatEther(ethAmt)).toFixed(5)}</span></div>`;
      for (let i = 0; i < toks.length; i++) {
        const erc = new ethers.Contract(toks[i], ABI.erc20, provider);
        let sym = short(toks[i]), dec = 18;
        try { [sym, dec] = await Promise.all([erc.symbol(), erc.decimals()]); } catch (_) {}
        html += `<div class="asset-row"><span class="asset-sym">${sym}</span><span class="asset-bal">${(+ethers.formatUnits(amts[i], dec)).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span></div>`;
      }
      el("claimPreview").innerHTML = html;
    } catch (_) {}
  }

  /* countdown */
  function startCountdown(deadlineSec, executed) {
    clearInterval(cdTimer);
    const wrap = el("countdown");
    const tick = () => {
      let diff = deadlineSec - Math.floor(Date.now() / 1000);
      const expired = diff <= 0;
      wrap.classList.toggle("expired", expired || executed);
      if (diff < 0) diff = 0;
      const d = Math.floor(diff / 86400);
      const h = Math.floor((diff % 86400) / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      el("cdDays").textContent = d;
      el("cdHours").textContent = String(h).padStart(2, "0");
      el("cdMins").textContent = String(m).padStart(2, "0");
      el("cdSecs").textContent = String(s).padStart(2, "0");
    };
    tick();
    cdTimer = setInterval(tick, 1000);
  }

  /* ------------------------------------------------------------------ */
  /*  Deposit RWA                                                       */
  /* ------------------------------------------------------------------ */
  // Token logos aren't onchain (ERC-20 has no image field); we pull them from
  // the chain's explorer, with a ticker monogram fallback.
  function tokenAvatar(sym, icon) {
    const s = (sym || "?").replace(/[<>]/g, "").slice(0, 3);
    const mono = `<span class="ti-mono"${icon ? ' style="display:none"' : ""}>${s}</span>`;
    const img = icon
      ? `<img class="ti-icon" src="${icon}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : "";
    return `<span class="ti-avatar">${img}${mono}</span>`;
  }

  const iconCache = {};
  async function tokenIcon(addr) {
    if (addr in iconCache) return iconCache[addr];
    try {
      const r = await fetch(NET.explorer + "/api/v2/tokens/" + addr);
      const d = await r.json();
      iconCache[addr] = d.icon_url || null;
    } catch (_) { iconCache[addr] = null; }
    return iconCache[addr];
  }

  // Live token search from the chain's Blockscout explorer (accurate + verified).
  async function searchTokens(q) {
    const box = el("tokenResults");
    if (!q || q.trim().length < 1) { box.hidden = true; box.innerHTML = ""; return; }
    try {
      const url = NET.explorer + "/api/v2/tokens?type=ERC-20&q=" + encodeURIComponent(q.trim());
      const r = await fetch(url);
      const data = await r.json();
      const items = (data.items || []).slice(0, 12);
      if (!items.length) { box.innerHTML = '<div class="token-empty">No tokens found</div>'; box.hidden = false; return; }
      box.innerHTML = items.map((it) => {
        const addr = it.address || it.address_hash || "";
        const sym = (it.symbol || "?").replace(/[<>]/g, "");
        const name = (it.name || "").replace(/[<>]/g, "");
        if (addr) iconCache[addr] = it.icon_url || null;
        return `<button type="button" class="token-item" data-addr="${addr}">${tokenAvatar(sym, it.icon_url)}<span class="ti-sym">${sym}</span><span class="ti-name">${name}</span></button>`;
      }).join("");
      box.hidden = false;
      box.querySelectorAll(".token-item").forEach((b) => b.addEventListener("click", () => {
        el("depToken").value = b.dataset.addr;
        el("tokenSearch").value = b.querySelector(".ti-sym").textContent;
        box.hidden = true;
        refreshDepToken();
      }));
    } catch (_) { box.hidden = true; }
  }

  let depTokenMeta = null;
  async function refreshDepToken() {
    const addr = el("depToken").value.trim();
    depTokenMeta = null;
    el("depTokenMeta").textContent = "";
    el("depWalletBal").textContent = "";
    if (!ethers.isAddress(addr)) return;
    try {
      const erc = new ethers.Contract(addr, ABI.erc20, provider);
      const [sym, dec, bal] = await Promise.all([erc.symbol(), erc.decimals(), erc.balanceOf(account)]);
      depTokenMeta = { addr: ethers.getAddress(addr), sym, dec };
      el("depTokenMeta").textContent = "Token: " + sym;
      el("depWalletBal").textContent = "Your balance: " + (+ethers.formatUnits(bal, dec)).toLocaleString(undefined, { maximumFractionDigits: 6 }) + " " + sym;
    } catch (_) { el("depTokenMeta").textContent = "Not a readable ERC-20 at this address."; }
  }

  async function approveToken() {
    if (!depTokenMeta) return toast("Enter a valid token address first.", { error: true });
    const amt = ethers.parseUnits(el("depAmount").value || "0", depTokenMeta.dec);
    if (amt <= 0n) return toast("Enter an amount to approve.", { error: true });
    const erc = new ethers.Contract(depTokenMeta.addr, ABI.erc20, signer);
    try { await sendTx(el("approveBtn"), () => erc.approve(vaultAddr, amt), { done: "Approved. You can deposit now." }); } catch (_) {}
  }

  async function depositToken() {
    if (!depTokenMeta) return toast("Enter a valid token address first.", { error: true });
    const amt = ethers.parseUnits(el("depAmount").value || "0", depTokenMeta.dec);
    if (amt <= 0n) return toast("Enter an amount to deposit.", { error: true });
    const erc = new ethers.Contract(depTokenMeta.addr, ABI.erc20, provider);
    const allowance = await erc.allowance(account, vaultAddr).catch(() => 0n);
    if (allowance < amt) return toast("Approve the token for this amount first.", { error: true });
    const v = new ethers.Contract(vaultAddr, ABI.vault, signer);
    try {
      await sendTx(el("depositBtn"), () => v.depositToken(depTokenMeta.addr, amt), { done: "Deposited into your vault." });
      el("depAmount").value = "";
      await loadDashboard();
    } catch (_) {}
  }

  /* ------------------------------------------------------------------ */
  /*  Actions                                                           */
  /* ------------------------------------------------------------------ */
  async function checkIn() {
    const v = new ethers.Contract(vaultAddr, ABI.vault, signer);
    try { await sendTx(el("checkInBtn"), () => v.checkIn(), { done: "Checked in. Countdown reset." }); await loadDashboard(); } catch (_) {}
  }
  async function execute() {
    const v = new ethers.Contract(vaultAddr, ABI.vault, signer);
    try { await sendTx(el("executeBtn"), () => v.execute(), { done: "Executed. Assets are now claimable." }); await loadDashboard(); } catch (_) {}
  }
  async function claim() {
    const v = new ethers.Contract(vaultAddr, ABI.vault, signer);
    try { await sendTx(el("claimBtn"), () => v.claim(), { done: "Claimed. Assets sent to your wallet." }); await loadDashboard(); } catch (_) {}
  }

  /* ------------------------------------------------------------------ */
  /*  Reminders (check-in) — calendar + browser notification            */
  /* ------------------------------------------------------------------ */
  // Static site: no backend, so reminders are a downloadable calendar event
  // (works with Google/Apple Calendar, which deliver email + push) plus an
  // optional in-browser notification when the tab is open near the deadline.
  function publicVaultUrl() {
    return location.origin + "/app/vault?address=" + vaultAddr;
  }

  async function setReminder() {
    if (!lifeData) return;
    // 1) calendar file with two alarms (7d + 1d before grace begins)
    const ics = GS.buildICS(lifeData.intervalEnd, vaultAddr, publicVaultUrl());
    GS.downloadICS(ics, "grave-checkin.ics");

    // 2) opt-in browser notifications
    let notifNote = "";
    if ("Notification" in window) {
      try {
        let perm = Notification.permission;
        if (perm === "default") perm = await Notification.requestPermission();
        if (perm === "granted") {
          localStorage.setItem("grave_remind_" + vaultAddr.toLowerCase(), "1");
          notifNote = " Browser reminders are on for this device.";
          scheduleLocalNotif(lifeData);
        }
      } catch (_) {}
    }
    const hint = el("remindHint");
    hint.hidden = false;
    hint.textContent = "Calendar reminder downloaded — add it to Google or Apple Calendar for email + push." + notifNote;
    toast("Check-in reminder saved.");
  }

  let localNotifTimer = null;
  function scheduleLocalNotif(life) {
    clearTimeout(localNotifTimer);
    if (Notification.permission !== "granted") return;
    // fire ~1 day before grace begins, if the tab is still open by then
    const fireAt = (life.intervalEnd - 86400) * 1000;
    const delay = fireAt - Date.now();
    if (delay <= 0 || delay > 2147483647) return; // out of setTimeout range
    localNotifTimer = setTimeout(() => {
      try { new Notification("GRAVE — check-in due soon", { body: "Check in to keep your vault active.", icon: "/assets/favicon-64.png" }); } catch (_) {}
    }, delay);
  }

  // Warn in-app when the deadline is close (or grace already running).
  function maybeWarnDeadline(life) {
    const hint = el("remindHint");
    if (life.state === "grace") {
      hint.hidden = false;
      hint.className = "life-hint warn";
      hint.textContent = "Grace period is running — check in now to cancel execution.";
    } else if (life.state === "active") {
      const secsLeft = life.intervalEnd - life.now;
      if (secsLeft > 0 && secsLeft < 7 * 86400) {
        hint.hidden = false;
        hint.className = "life-hint warn";
        hint.textContent = "Grace period begins in " + GS.fmtDur(secsLeft) + " — consider checking in.";
      } else {
        hint.className = "life-hint";
      }
      // resume a scheduled local notification if the user opted in
      try {
        if (localStorage.getItem("grave_remind_" + vaultAddr.toLowerCase()) === "1") scheduleLocalNotif(life);
      } catch (_) {}
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Share (public read-only link)                                     */
  /* ------------------------------------------------------------------ */
  async function shareVault() {
    const url = publicVaultUrl();
    try {
      if (navigator.share) { await navigator.share({ title: "GRAVE Vault", url }); return; }
    } catch (_) { /* user cancelled share sheet */ return; }
    try {
      await navigator.clipboard.writeText(url);
      toast("Public vault link copied to clipboard.");
    } catch (_) {
      toast(url, { timeout: 0 });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Wire up                                                           */
  /* ------------------------------------------------------------------ */
  function init() {
    el("connectBtn").addEventListener("click", connect);
    el("connectBtn2").addEventListener("click", connect);
    el("switchNetBtn").addEventListener("click", switchNetwork);
    el("addBenBtn").addEventListener("click", () => { el("benRows").appendChild(benRowTemplate()); });
    el("createForm").addEventListener("submit", createVault);
    el("checkInBtn").addEventListener("click", checkIn);
    el("executeBtn").addEventListener("click", execute);
    el("claimBtn").addEventListener("click", claim);
    el("approveBtn").addEventListener("click", approveToken);
    el("depositBtn").addEventListener("click", depositToken);
    el("remindBtn").addEventListener("click", setReminder);
    el("shareBtn").addEventListener("click", shareVault);
    let depTimer;
    el("depToken").addEventListener("input", () => { clearTimeout(depTimer); depTimer = setTimeout(refreshDepToken, 350); });
    let searchTimer;
    el("tokenSearch").addEventListener("input", (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => searchTokens(e.target.value), 300); });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".token-search")) { const b = el("tokenResults"); if (b) b.hidden = true; }
    });

    // AppKit bridge: react to wallet/account/network changes from the modal.
    window.addEventListener("grave:wallet", async (e) => {
      if (connectedVia === "injected") return; // in-app injected takes precedence
      const d = e.detail || {};
      if (d.isConnected && d.provider && d.address) {
        usingAppKit = true; connectedVia = "appkit";
        try { await onConnected(d.provider, d.address, d.chainId); }
        catch (err) { toast(errMsg(err), { error: true }); }
      } else if (!d.isConnected && usingAppKit) {
        account = null; signer = null; provider = null; connectedVia = null;
        updateNav(); showPanel("connect");
      }
    });

    if (!APPKIT_CONFIGURED) {
      enableInjectedFallback();
    } else {
      // If AppKit fails to load, quietly fall back to injected wallets.
      window.addEventListener("grave:wallet-ready", (e) => {
        if (!e.detail || !e.detail.available) enableInjectedFallback();
      }, { once: true });
    }

    showPanel("connect");
  }

  function enableInjectedFallback() {
    if (!window.ethereum) return;
    window.ethereum.on("accountsChanged", async (accs) => {
      if (usingAppKit) return;
      if (!accs.length) { account = null; signer = null; updateNav(); showPanel("connect"); return; }
      account = ethers.getAddress(accs[0]);
      signer = await provider.getSigner();
      updateNav();
      await route();
    });
    window.ethereum.on("chainChanged", async (hex) => {
      if (usingAppKit) return;
      chainId = parseInt(hex, 16);
      updateNav();
      await route();
    });
    // eager reconnect if already authorized
    window.ethereum.request({ method: "eth_accounts" }).then((accs) => { if (accs && accs.length) connectInjected(); });
  }

  init();
})();
