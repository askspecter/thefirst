# GRAVE Watcher Bot

A tiny, stateless bot that keeps GRAVE working without any privileged access.

When a vault's owner stops checking in and the grace period elapses, the vault
becomes **expirable** — but someone still has to send the `execute()`
transaction that snapshots balances and opens claims for the beneficiaries.
`execute()` is **permissionless**: anyone can call it, and it moves no funds to
the caller. This bot simply scans every vault and calls `execute()` on the ones
that are expired and not yet executed.

Because the transaction only pays gas, the bot's wallet needs a small amount of
ETH for gas and **nothing else**. It holds no special authority over any vault.

## Run locally

```bash
cd bot
npm install

# Report only — never sends a transaction (no key needed):
npm run dry

# Live: execute expired vaults (needs a gas-funded key):
export PRIVATE_KEY=0x...          # a hot wallet with a little ETH for gas
npm run once                      # single scan, then exit
# or run continuously (scans every INTERVAL_SECONDS):
npm start
```

## Configuration (environment variables)

| Variable           | Default                                             | Purpose                                   |
| ------------------ | --------------------------------------------------- | ----------------------------------------- |
| `RPC_URL`          | `https://rpc.mainnet.chain.robinhood.com`           | Robinhood Chain RPC                        |
| `FACTORY_ADDRESS`  | `0x3Fa87f229c42d892a91f0DfeFC85c21F4cddd6A0`         | GraveFactory to discover vaults from       |
| `PRIVATE_KEY`      | *(none)*                                             | Gas-funded executor key; omit for dry run |
| `FROM_BLOCK`       | `0`                                                 | Block to start scanning `VaultCreated`     |
| `BLOCK_RANGE`      | `50000`                                              | `getLogs` chunk size (lower if RPC caps)   |
| `DRY_RUN`          | `0`                                                 | `1` = report only, never send a tx        |
| `RUN_ONCE`         | `0`                                                 | `1` = one scan then exit (for cron/CI)     |
| `INTERVAL_SECONDS` | `300`                                                | Loop delay when not `RUN_ONCE`             |

## Run on a schedule (GitHub Actions)

A workflow is included at `.github/workflows/watcher.yml`. It runs one scan on a
cron schedule. To enable live execution, add a repository secret:

- `WATCHER_PRIVATE_KEY` — a dedicated hot wallet, funded only with gas money.

Optionally add `WATCHER_RPC_URL` to override the RPC. Until a key is set the
workflow runs in dry-run mode and only reports what it would do.

> Security: use a throwaway wallet with minimal ETH. The key can only pay gas to
> call a public function; it cannot move any vault's assets.
