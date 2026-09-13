(() => {
  'use strict';
  const CFG = window.GRAVE_CONFIG;
  const NET = CFG.NETWORKS[CFG.DEFAULT_NETWORK];
  const ART = window.GRAVE_ARTIFACTS;
  const el = (id) => document.getElementById(id);

  let provider = null, signer = null, account = null, chainId = null;
  let usingAppKit = false;
  const APPKIT_CONFIGURED = !!CFG.WALLETCONNECT_PROJECT_ID;

  function short(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : ""; }
  function errMsg(e) { return e?.info?.error?.message || e?.reason || e?.shortMessage || e?.message || "Failed"; }

  let toastTimer;
  function toast(msg, opts = {}) {
    const t = el("toast");
    t.innerHTML = msg + (opts.link ? ` <a class="toast-link" href="${opts.link}" target="_blank" rel="noopener">view</a>` : "");
    t.classList.toggle("error", !!opts.error);
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer);
    if (opts.timeout !== 0) toastTimer = setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.hidden = true, 300); }, opts.timeout || 6000);
  }

  function render() {
    el("netName").textContent = NET.label + " (chainId " + NET.chainId + ")";
    el("connectBtn").textContent = account ? short(account) : "Connect Wallet";
    el("step-connect").hidden = !!account;
    const onNet = account && chainId === NET.chainId;
    el("step-network").hidden = !(account && !onNet);
    el("step-deploy").hidden = !onNet;
    const existing = CFG.FACTORY[CFG.DEFAULT_NETWORK] || localStorageGet();
    if (existing) { el("existingWrap").hidden = false; el("existingAddr").textContent = existing; el("existingAddr").href = NET.explorer + "/address/" + existing; }
  }

  function localStorageGet() { try { return localStorage.getItem("grave_factory_" + CFG.DEFAULT_NETWORK) || ""; } catch (_) { return ""; } }

  async function onConnected(eip1193, address, cid) {
    provider = new ethers.BrowserProvider(eip1193, "any");
    signer = await provider.getSigner();
    account = ethers.getAddress(address);
    chainId = cid != null ? Number(cid) : Number((await provider.getNetwork()).chainId);
    render();
  }

  let connectedVia = null;
  function isInAppWallet() {
    return !!window.ethereum && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  async function connectInjected() {
    if (!window.ethereum) { toast("No EVM wallet detected.", { error: true }); return; }
    usingAppKit = false; connectedVia = "injected";
    try { const accs = await new ethers.BrowserProvider(window.ethereum).send("eth_requestAccounts", []); await onConnected(window.ethereum, accs[0]); }
    catch (e) { toast(errMsg(e), { error: true }); }
  }

  async function connect() {
    if (isInAppWallet()) return connectInjected();
    if (window.GraveWallet && window.GraveWallet.available) { usingAppKit = true; window.GraveWallet.open(); return; }
    return connectInjected();
  }

  async function switchNet() {
    if (usingAppKit && window.GraveWallet) { try { window.GraveWallet.switchNetwork(); } catch (e) { toast(errMsg(e), { error: true }); } return; }
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: NET.chainIdHex }] });
    } catch (e) {
      if (e.code === 4902) {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: NET.chainIdHex, chainName: NET.label, rpcUrls: [NET.rpcUrl], nativeCurrency: NET.currency, blockExplorerUrls: [NET.explorer] }] });
      } else toast(errMsg(e), { error: true });
    }
  }

  async function deploy() {
    if (!signer) return;
    const btn = el("deployBtn");
    const label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Deploying…';
    try {
      const factory = new ethers.ContractFactory(ART.factory.abi, ART.factory.bytecode, signer);
      const contract = await factory.deploy();
      toast("Deployment sent, waiting for confirmation…", { link: NET.explorer + "/tx/" + contract.deploymentTransaction().hash, timeout: 0 });
      await contract.waitForDeployment();
      const addr = await contract.getAddress();
      try { localStorage.setItem("grave_factory_" + CFG.DEFAULT_NETWORK, addr); } catch (_) {}
      el("resultWrap").hidden = false;
      el("resultAddr").textContent = addr;
      el("resultAddr").href = NET.explorer + "/address/" + addr;
      el("configLine").textContent = `FACTORY: { ${CFG.DEFAULT_NETWORK}: "${addr}" }`;
      toast("Factory deployed.", { link: NET.explorer + "/address/" + addr });
      render();
    } catch (e) { toast(errMsg(e), { error: true }); }
    finally { btn.disabled = false; btn.innerHTML = label; }
  }

  function copyConfig() {
    const txt = el("resultAddr").textContent;
    navigator.clipboard?.writeText(txt).then(() => toast("Address copied.")).catch(() => {});
  }

  function init() {
    el("connectBtn").addEventListener("click", connect);
    el("connectBtn2").addEventListener("click", connect);
    el("switchNetBtn").addEventListener("click", switchNet);
    el("deployBtn").addEventListener("click", deploy);
    el("copyBtn").addEventListener("click", copyConfig);

    window.addEventListener("grave:wallet", async (e) => {
      if (connectedVia === "injected") return;
      const d = e.detail || {};
      if (d.isConnected && d.provider && d.address) { usingAppKit = true; connectedVia = "appkit"; try { await onConnected(d.provider, d.address, d.chainId); } catch (err) { toast(errMsg(err), { error: true }); } }
      else if (!d.isConnected && usingAppKit) { account = null; signer = null; provider = null; connectedVia = null; render(); }
    });

    if (!APPKIT_CONFIGURED && window.ethereum) {
      window.ethereum.on("chainChanged", (hex) => { chainId = parseInt(hex, 16); render(); });
      window.ethereum.on("accountsChanged", (accs) => { if (!accs.length) { account = null; signer = null; render(); } else connect(); });
    }
    render();
  }
  init();
})();
