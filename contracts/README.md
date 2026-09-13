# GRAVE Protocol — Contracts

The onchain last-will protocol for RWA Stock Tokens on **Robinhood Chain**.

- `src/GraveVault.sol` — a non-custodial per-owner vault. Holds ETH and RWA
  Stock Tokens (standard ERC-20). The owner proves they are alive via `checkIn()`;
  if they miss their interval plus a grace period, anyone may call `execute()`,
  which freezes a balance snapshot, and each beneficiary pulls their fixed share
  with `claim()`. No admin key, no pause switch, no upgrade path.
- `src/GraveFactory.sol` — deploys and indexes one vault per owner.

## Network

| Network            | Chain ID | RPC                                          | Explorer                                     |
| ------------------ | -------- | -------------------------------------------- | -------------------------------------------- |
| Robinhood Mainnet  | 4663     | https://rpc.mainnet.chain.robinhood.com      | https://robinhoodchain.blockscout.com        |
| Robinhood Testnet  | 46630    | https://rpc.testnet.chain.robinhood.com/rpc  | https://explorer.testnet.chain.robinhood.com |

Gas is paid in **ETH**. Get testnet ETH at https://faucet.testnet.chain.robinhood.com.

## Deploy (Foundry)

```bash
# from contracts/
forge install foundry-rs/forge-std
export PRIVATE_KEY=0x...            # a funded deployer key

# Testnet
forge script script/Deploy.s.sol:Deploy \
  --rpc-url robinhood_testnet --broadcast --private-key $PRIVATE_KEY

# Mainnet
forge script script/Deploy.s.sol:Deploy \
  --rpc-url robinhood --broadcast --private-key $PRIVATE_KEY
```

After deploying, copy the printed `GraveFactory` address into
`js/config.js` (`FACTORY.testnet` / `FACTORY.mainnet`) so the dApp can find it.

## Security

This code is **unaudited**. It handles real assets — review it, test it on
testnet, and get an independent audit before any mainnet use. RWA Stock Tokens
are standard ERC-20s, so no special integration is required, but confirm each
token's transfer semantics (fees, blocklists, pausability) before depositing.
