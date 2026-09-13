/* GRAVE dApp configuration — Robinhood Chain */
window.GRAVE_CONFIG = {
  // Which network the dApp targets. Testnet is the safe default while the
  // protocol contracts are unaudited. Switch to "mainnet" once deployed & audited.
  DEFAULT_NETWORK: "testnet",

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
    mainnet: "",
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
