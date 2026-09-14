/* GRAVE dApp configuration — Robinhood Chain */
window.GRAVE_CONFIG = {
  // Which network the dApp targets.
  DEFAULT_NETWORK: "mainnet",

  // Reown AppKit (WalletConnect) project id — powers the multi-wallet modal
  // (Trust, MetaMask, Binance, SafePal, 80+ wallets incl. mobile via QR/deeplink).
  // Get a free one at https://cloud.reown.com and allowlist your domain.
  // The default below is Reown's public localhost-only demo id — REPLACE IT with
  // your own before deploying, or the modal won't authorize on your domain.
  // Leave empty ("") to fall back to a basic injected-wallet connect.
  WALLETCONNECT_PROJECT_ID: "fc30dabc7ffba787f7415f0c4c613c75",

  NETWORKS: {
    mainnet: {
      key: "mainnet",
      label: "Robinhood Chain",
      chainId: 4663,
      chainIdHex: "0x1237",
      rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
      explorer: "https://robinhoodchain.blockscout.com",
      currency: { name: "Ether", symbol: "ETH", decimals: 18 },
      faucet: null,
    },
    testnet: {
      key: "testnet",
      label: "Robinhood Chain Testnet",
      chainId: 46630,
      chainIdHex: "0xB626",
      rpcUrl: "https://rpc.testnet.chain.robinhood.com/rpc",
      explorer: "https://explorer.testnet.chain.robinhood.com",
      currency: { name: "Ether", symbol: "ETH", decimals: 18 },
      faucet: "https://faucet.testnet.chain.robinhood.com",
    },
  },

  // Deployed GraveFactory addresses. Fill these in after running the Foundry
  // deploy script (see contracts/README.md). Leave empty until deployed.
  FACTORY: {
    mainnet: "0x3Fa87f229c42d892a91f0DfeFC85c21F4cddd6A0",
    testnet: "",
  },

  // The official GRAVE protocol token ($GRAVE) on Robinhood Chain.
  TOKEN: {
    address: "0x69949143aeb1de079c4c1e1064126128dfa7d8f5",
    symbol: "GRAVE",
    name: "Grave",
    decimals: 18,
    // GeckoTerminal (live price/volume) — network slug + main pool.
    gtNetwork: "robinhood",
    pool: "0xc9322006f6a004e4c44334fb2a0834661aa022a0",
    // Addresses whose balance counts as permanently burned.
    burnAddresses: [
      "0x000000000000000000000000000000000000dEaD",
      "0x0000000000000000000000000000000000000000",
    ],
  },

  // Curated RWA Stock Token shortcuts shown in the deposit panel. Any ERC-20
  // address also works via manual entry or the live search. Verified official
  // "Robinhood Token" assets on Robinhood Chain; logos load from the explorer.
  STOCK_TOKENS: [
    { symbol: "AAPL",  name: "Apple",       address: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9" },
    { symbol: "TSLA",  name: "Tesla",       address: "0x322f0929c4625ed5bad873c95208d54e1c003b2d" },
    { symbol: "NVDA",  name: "NVIDIA",      address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec" },
    { symbol: "MSFT",  name: "Microsoft",   address: "0xe93237c50d904957cf27e7b1133b510c669c2e74" },
    { symbol: "GOOGL", name: "Alphabet",    address: "0x1d45f0d84b83497874cb38560eb9f6d332a8372b" },
    { symbol: "AMZN",  name: "Amazon",      address: "0x12f190a9f9d7d37a250758b26824b97ce941bf54" },
    { symbol: "META",  name: "Meta",        address: "0xc0d6457c16cc70d6790dd43521c899c87ce02f35" },
    { symbol: "NFLX",  name: "Netflix",     address: "0xe0444ef8bf4ed74f74fd73686e2ddf4c1c5591e8" },
    { symbol: "COIN",  name: "Coinbase",    address: "0x6330d8c3178a418788df01a47479c0ce7ccf450b" },
    { symbol: "MSTR",  name: "Strategy",    address: "0xec262a75e413fafd0df80480274532c79d42da09" },
    { symbol: "AMD",   name: "AMD",         address: "0x86923f96303d656e4aa86d9d42d1e57ad2023fdc" },
    { symbol: "PLTR",  name: "Palantir",    address: "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a" },
  ],

  ABI: {
    factory: [
      "function vaultOf(address) view returns (address)",
      "function createVault(uint64 checkInInterval, uint64 gracePeriod, address[] accounts, uint16[] bps, address[] guardians) returns (address)",
      "function vaultCount() view returns (uint256)",
      "event VaultCreated(address indexed owner, address indexed vault)",
    ],
    vault: [
      "function owner() view returns (address)",
      "function checkInInterval() view returns (uint64)",
      "function gracePeriod() view returns (uint64)",
      "function lastCheckIn() view returns (uint64)",
      "function deadline() view returns (uint64)",
      "function isExpired() view returns (bool)",
      "function executed() view returns (bool)",
      "function executedAt() view returns (uint64)",
      "function getBeneficiaries() view returns (tuple(address account, uint16 bps)[])",
      "function getTokens() view returns (address[])",
      "function bpsOf(address) view returns (uint16)",
      "function isGuardian(address) view returns (bool)",
      "function claimed(address) view returns (bool)",
      "function checkIn()",
      "function depositToken(address token, uint256 amount)",
      "function trackToken(address token)",
      "function withdrawETH(uint256 amount, address to)",
      "function withdrawToken(address token, uint256 amount, address to)",
      "function setSchedule(uint64 checkInInterval, uint64 gracePeriod)",
      "function setBeneficiaries(address[] accounts, uint16[] bps)",
      "function setGuardian(address guardian, bool enabled)",
      "function execute()",
      "function claim()",
      "function previewClaim(address account) view returns (uint256 ethAmount, address[] toks, uint256[] amounts)",
      "event CheckedIn(address indexed by, uint64 at)",
      "event ScheduleUpdated(uint64 checkInInterval, uint64 gracePeriod)",
      "event BeneficiariesUpdated(uint256 count)",
      "event GuardianUpdated(address indexed guardian, bool enabled)",
      "event Deposited(address indexed token, uint256 amount)",
      "event Withdrawn(address indexed token, address indexed to, uint256 amount)",
      "event Executed(address indexed by, uint64 at)",
      "event Claimed(address indexed beneficiary, uint16 bps)",
    ],
    erc20: [
      "function approve(address spender, uint256 amount) returns (bool)",
      "function allowance(address owner, address spender) view returns (uint256)",
      "function balanceOf(address) view returns (uint256)",
      "function decimals() view returns (uint8)",
      "function symbol() view returns (string)",
      "function name() view returns (string)",
    ],
  },
};
