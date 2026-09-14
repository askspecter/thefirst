/* GRAVE Watcher Bot
 *
 * Permissionlessly calls execute() on any GRAVE Vault whose grace period has
 * elapsed (isExpired() == true and executed() == false). execute() takes no
 * funds — it only snapshots balances and opens claims — so this bot needs a
 * wallet with a little ETH for gas and nothing more.
 *
 * Config via environment variables:
 *   RPC_URL          default https://rpc.mainnet.chain.robinhood.com
 *   FACTORY_ADDRESS  default 0x3Fa87f229c42d892a91f0DfeFC85c21F4cddd6A0
 *   PRIVATE_KEY      required unless DRY_RUN=1 (funded only for gas)
 *   FROM_BLOCK       default 0   (block to start scanning VaultCreated from)
 *   BLOCK_RANGE      default 50000 (getLogs chunk size)
 *   DRY_RUN          default 0   (1 = report only, never send a tx)
 *   RUN_ONCE         default 0   (1 = one scan then exit, for cron/CI)
 *   INTERVAL_SECONDS default 300 (loop delay when RUN_ONCE is not set)
 */
import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || "0x3Fa87f229c42d892a91f0DfeFC85c21F4cddd6A0";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const FROM_BLOCK = BigInt(process.env.FROM_BLOCK || "0");
const BLOCK_RANGE = BigInt(process.env.BLOCK_RANGE || "50000");
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const RUN_ONCE = process.env.RUN_ONCE === "1" || process.env.RUN_ONCE === "true";
const INTERVAL = Number(process.env.INTERVAL_SECONDS || "300") * 1000;

const FACTORY_ABI = [
  "event VaultCreated(address indexed owner, address indexed vault)",
];
const VAULT_ABI = [
  "function executed() view returns (bool)",
  "function isExpired() view returns (bool)",
  "function deadline() view returns (uint64)",
  "function execute()",
];

const log = (...a) => console.log(new Date().toISOString(), ...a);

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY, provider) : null;

async function discoverVaults() {
  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
  const latest = BigInt(await provider.getBlockNumber());
  const filter = factory.filters.VaultCreated();
  const vaults = new Set();
  for (let from = FROM_BLOCK; from <= latest; from += BLOCK_RANGE + 1n) {
    const to = from + BLOCK_RANGE > latest ? latest : from + BLOCK_RANGE;
    try {
      const evs = await factory.queryFilter(filter, from, to);
      for (const e of evs) vaults.add(ethers.getAddress(e.args.vault));
    } catch (err) {
      log(`  getLogs ${from}-${to} failed (${err.shortMessage || err.message}); halving range`);
      // retry this window in smaller pieces
      const mid = from + (to - from) / 2n;
      try {
        for (const [a, b] of [[from, mid], [mid + 1n, to]]) {
          const evs = await factory.queryFilter(filter, a, b);
          for (const e of evs) vaults.add(ethers.getAddress(e.args.vault));
        }
      } catch (_) { /* skip this window */ }
    }
  }
  return [...vaults];
}

async function scanOnce() {
  log(`Scanning factory ${FACTORY_ADDRESS} on ${RPC_URL}`);
  const vaults = await discoverVaults();
  log(`Found ${vaults.length} vault(s)`);

  let executed = 0, pending = 0, active = 0;
  for (const addr of vaults) {
    const v = new ethers.Contract(addr, VAULT_ABI, wallet || provider);
    let isExecuted, expired;
    try {
      [isExecuted, expired] = await Promise.all([v.executed(), v.isExpired()]);
    } catch (err) {
      log(`  ${addr}: read failed (${err.shortMessage || err.message})`);
      continue;
    }
    if (isExecuted) { executed++; continue; }
    if (!expired) { active++; continue; }

    pending++;
    if (DRY_RUN || !wallet) {
      log(`  ${addr}: EXPIRED and un-executed — would call execute() (dry run)`);
      continue;
    }
    try {
      log(`  ${addr}: EXPIRED — sending execute()`);
      const tx = await v.execute();
      log(`    tx ${tx.hash} submitted, waiting…`);
      const rec = await tx.wait();
      log(`    executed in block ${rec.blockNumber}`);
    } catch (err) {
      log(`    execute() failed: ${err.shortMessage || err.message}`);
    }
  }
  log(`Done. active=${active} pending=${pending} alreadyExecuted=${executed}`);
}

async function main() {
  if (!wallet && !DRY_RUN) {
    log("No PRIVATE_KEY set — running in DRY_RUN mode (reporting only).");
  }
  if (wallet) log(`Executor: ${wallet.address}`);

  if (RUN_ONCE) { await scanOnce(); return; }
  // continuous loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await scanOnce(); } catch (err) { log("scan error:", err.shortMessage || err.message); }
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

main().catch((e) => { log("fatal:", e); process.exit(1); });
