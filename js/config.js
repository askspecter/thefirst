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

  // Optional curated RWA Stock Token shortcuts shown in the deposit panel.
  // Any ERC-20 address also works via manual entry. Fill with real token
  // addresses from the Robinhood Chain explorer.
  STOCK_TOKENS: [
    // { symbol: "AAPLx", address: "0x..." },
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
