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

  const el = (id) => document.getElementById(id);
  const PANELS = ["connect", "network", "nofactory", "create", "dashboard"];

  let provider = null;   // ethers BrowserProvider (wallet)
  let signer = null;
  let account = null;
  let chainId = null;
  let vaultAddr = null;
  let cdTimer = null;
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
    let owner, dl, executed, expired, bens, tokens;
    try {
      [owner, dl, executed, expired, bens, tokens] = await Promise.all([
        v.owner(), v.deadline(), v.executed(), v.isExpired(), v.getBeneficiaries(), v.getTokens(),
      ]);
    } catch (e) { toast("Could not load vault: " + errMsg(e), { error: true }); return; }

    const isOwner = owner.toLowerCase() === account.toLowerCase();
    let guardianFlag = false;
    if (!isOwner) { try { guardianFlag = await v.isGuardian(account); } catch (_) {} }

    el("vaultAddrLink").textContent = short(vaultAddr) + "  ↗";
    el("vaultAddrLink").href = addrLink(vaultAddr);

    // status
    const badge = el("statusBadge");
    badge.className = "status-badge";
    if (executed) { badge.textContent = "Executed"; badge.classList.add("executed"); }
    else if (expired) { badge.textContent = "Execution ready"; badge.classList.add("pending"); }
    else { badge.textContent = "Active"; badge.classList.add("active"); }

    // countdown
    startCountdown(Number(dl), executed);
    el("cdCaption").textContent = executed
      ? "vault executed — assets are claimable"
      : (expired ? "grace period elapsed — execution unlocked" : "until execution unlocks");

    // heartbeat actions
    el("checkInBtn").hidden = executed || !(isOwner || guardianFlag);
    el("executeBtn").hidden = executed || !expired;

    // assets
    const ethBal = await provider.getBalance(vaultAddr);
    el("ethBal").textContent = (+ethers.formatEther(ethBal)).toFixed(5) + " ETH";
    await renderTokens(v, tokens);

    // beneficiaries
    renderBeneficiaries(bens);

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

  async function renderTokens(v, tokens) {
    const list = el("tokenList");
    list.innerHTML = "";
    if (!tokens.length) { list.innerHTML = '<div class="muted-row">No RWA tokens deposited yet.</div>'; return; }
    for (const addr of tokens) {
      const erc = new ethers.Contract(addr, ABI.erc20, provider);
      let sym = short(addr), dec = 18, bal = 0n;
      try { [sym, dec, bal] = await Promise.all([erc.symbol(), erc.decimals(), erc.balanceOf(vaultAddr)]); } catch (_) {}
      const row = document.createElement("div");
      row.className = "asset-row";
      row.innerHTML = `<span class="asset-sym">${sym}</span><span class="asset-bal">${(+ethers.formatUnits(bal, dec)).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>`;
      list.appendChild(row);
    }
  }

  function renderBeneficiaries(bens) {
    const list = el("benList");
    list.innerHTML = "";
    bens.forEach((b) => {
      const you = b.account.toLowerCase() === account.toLowerCase();
      const row = document.createElement("div");
      row.className = "ben-item";
      row.innerHTML = `<span class="addr">${short(b.account)}${you ? '<span class="you">you</span>' : ""}</span><span class="share">${(Number(b.bps) / 100)}%</span>`;
      list.appendChild(row);
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
        return `<button type="button" class="token-item" data-addr="${addr}"><span class="ti-sym">${sym}</span><span class="ti-name">${name}</span></button>`;
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
