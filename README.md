# GRAVE — The First Onchain Last Will Protocol

A non-custodial last-will protocol for **RWA Stock Tokens** on **Robinhood Chain**.
Lock ETH and tokenized real-world assets into an immutable vault; if you stop
proving you're alive (missed check-in + grace period), your beneficiaries claim
their pre-defined shares — no probate, no custodian, no admin key.

## Structure

| Path             | What it is                                                                 |
| ---------------- | ------------------------------------------------------------------------- |
| `index.html`     | Marketing landing page (`css/style.css`, `js/main.js`)                    |
| `app/`           | The dApp — wallet connect, create vault, deposit RWA, check-in, claim     |
| `js/app.js`      | dApp logic (ethers v6)                                                    |
| `js/config.js`   | Network + deployed contract addresses + ABIs                             |
| `css/app.css`    | dApp styles                                                               |
| `contracts/`     | Solidity protocol (`GraveVault`, `GraveFactory`) + Foundry deploy         |
| `abi/`           | Compiled ABIs                                                             |

## Network — Robinhood Chain

| Network            | Chain ID | RPC                                          | Explorer                                     |
| ------------------ | -------- | -------------------------------------------- | -------------------------------------------- |
| Mainnet            | 4663     | https://rpc.mainnet.chain.robinhood.com      | https://robinhoodchain.blockscout.com        |
| Testnet            | 46630    | https://rpc.testnet.chain.robinhood.com/rpc  | https://explorer.testnet.chain.robinhood.com |

Gas is paid in ETH. Testnet faucet: https://faucet.testnet.chain.robinhood.com

## Bring the dApp live

1. Deploy the factory — see `contracts/README.md` (Foundry).
2. Paste the factory address into `js/config.js` → `FACTORY.testnet` / `FACTORY.mainnet`.
3. Serve the site: `python3 -m http.server 8000`, open `http://localhost:8000`,
   click **Launch App**, connect a wallet, and add the Robinhood Chain network
   when prompted.

`DEFAULT_NETWORK` in `js/config.js` selects testnet (default) or mainnet.

## Status

The contracts are **unaudited**. Test on testnet and commission an audit before
any mainnet use with real assets.
