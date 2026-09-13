// GRAVE — Reown AppKit (WalletConnect) integration.
// Loads as an ES module. Exposes window.GraveWallet and dispatches
// `grave:wallet` / `grave:wallet-ready` events that js/app.js listens to.
// If anything fails (no projectId, CDN blocked), app.js falls back to a
// basic injected-wallet connect on its own.

const CFG = window.GRAVE_CONFIG || {};
const PROJECT_ID = CFG.WALLETCONNECT_PROJECT_ID;

function fail(reason) {
  window.GraveWallet = { available: false, reason };
  window.dispatchEvent(new CustomEvent("grave:wallet-ready", { detail: { available: false } }));
}

if (!PROJECT_ID) {
  fail("no-project-id");
} else {
  try {
    const V = "1.8.21";
    const [{ createAppKit }, { defineChain }, { EthersAdapter }] = await Promise.all([
      import(`https://esm.sh/@reown/appkit@${V}`),
      import(`https://esm.sh/@reown/appkit@${V}/networks`),
      import(`https://esm.sh/@reown/appkit-adapter-ethers@${V}`),
    ]);

    const toAppkitChain = (n) =>
      defineChain({
        id: n.chainId,
        caipNetworkId: `eip155:${n.chainId}`,
        chainNamespace: "eip155",
        name: n.label,
        nativeCurrency: n.currency,
        rpcUrls: { default: { http: [n.rpcUrl] } },
        blockExplorers: { default: { name: "Explorer", url: n.explorer } },
      });

    const target = CFG.NETWORKS[CFG.DEFAULT_NETWORK];
    const other = CFG.NETWORKS[CFG.DEFAULT_NETWORK === "mainnet" ? "testnet" : "mainnet"];
    const targetChain = toAppkitChain(target);
    const networks = [targetChain, toAppkitChain(other)];

    const appKit = createAppKit({
      adapters: [new EthersAdapter()],
      networks,
      projectId: PROJECT_ID,
      themeMode: "dark",
      themeVariables: {
        "--w3m-accent": "#f2f2f0",
        "--w3m-font-family": "'JetBrains Mono', monospace",
        "--w3m-border-radius-master": "2px",
      },
      metadata: {
        name: "GRAVE",
        description: "The first onchain last will protocol on Robinhood Chain.",
        url: window.location.origin,
        icons: [window.location.origin + "/assets/favicon-64.png"],
      },
      features: { analytics: false, email: false, socials: false },
      enableWalletConnect: true,
    });

    const state = { provider: null, address: null, chainId: null, isConnected: false };
    const emit = () =>
      window.dispatchEvent(new CustomEvent("grave:wallet", { detail: { ...state } }));

    appKit.subscribeProviders((s) => { state.provider = s["eip155"] || null; emit(); });
    appKit.subscribeAccount((s) => {
      state.address = s?.address || null;
      state.isConnected = !!s?.isConnected;
      emit();
    });
    appKit.subscribeNetwork((s) => {
      const id = s?.chainId;
      state.chainId = typeof id === "string" ? parseInt(id.split(":").pop(), 10) : id ?? null;
      emit();
    });

    window.GraveWallet = {
      available: true,
      targetChain,
      open: () => appKit.open(),
      disconnect: () => appKit.disconnect(),
      switchNetwork: () => appKit.switchNetwork(targetChain),
      getState: () => ({ ...state }),
    };
    window.dispatchEvent(new CustomEvent("grave:wallet-ready", { detail: { available: true } }));
  } catch (e) {
    console.error("AppKit init failed:", e);
    fail("load-error");
  }
}
