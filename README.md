# 🐾 PetCoinAI

**PetCoinAI** is a purpose-driven ERC-20 token and staking ecosystem built on Ethereum (and tested on Sepolia) that combines blockchain technology with meaningful real-world impact. Every transaction supports animal welfare through automatic donations, burns, and user rewards. This repo contains the core Solidity contracts, test suite, deployment tools, and Uniswap integration code for the project.

---

## 🌍 What Is PetCoinAI?

PetCoinAI (ticker: `PETAI`) is a hybrid utility and charity token designed to:

- Fund animal rescue and welfare organizations via **automatic fee routing**
- Reward long-term holders with **staking incentives and tier-based benefits**
- Provide **on-chain transparency and migration safety** via upgradeable vault logic
- Back its economy with a **Uniswap-based price oracle** used for access control and valuation

Tokenomics include:
- 🔥 **0.5% burn**
- 🐶 **1% charity fee**
- 🎁 **2% rewards** to the staking vault

---

## 🧱 Components

This monorepo includes:

### Solidity Contracts

| Contract             | Purpose                                                                 |
|----------------------|-------------------------------------------------------------------------|
| `PetCoinAI.sol`      | The core ERC-20 token with fee mechanics, vault routing, pause control |
| `StakingVault.sol`   | Multi-stake reward vault with tiered lock durations and finalization   |
| `CharityVault.sol`   | Donation receiver, distributor, and migratable charity sink            |
| `UniswapV2PriceFeed.sol` | TWAP-based price oracle for PETAI from Uniswap V2 liquidity pool   |
| `AccessGating.sol`   | Role-based gating using USD-valued PETAI holdings                      |

### Test Suite

Powered by **Hardhat** and **Chai**, with deep coverage for:

- Token economics and exemptions
- Vault migration logic and fee forwarding
- Oracle behavior (TWAP, TOO_SOON, fallback handling)
- Gating logic and tier thresholds
- Reward distribution and edge case handling

### Tasks

Custom `hardhat` tasks for:

- Deploying contracts (`deploy-core`)
- Creating Uniswap pairs (`create-pair`)
- Adding liquidity (`add-liquidity`)
- Wiring price feeds and updating TWAPs (`deploy-feed`, `update-feed`)
- Checking on-chain state (`status`, `balance`)

---

## 🔧 Getting Started

### Install Dependencies

```bash
npm install
````

### Build & Compile Contracts

```bash
npx hardhat compile
```

### Run Local Tests

```bash
npx hardhat test
```

### Deploy to Sepolia

Configure `.env`:

```env
SEPOLIA_RPC_URL=https://...
PRIVATE_WALLET_KEY=0x...
```

Then:

```bash
npx hardhat deploy-core --network sepolia
```

Add a Uniswap pair:

```bash
npx hardhat create-pair --network sepolia
npx hardhat add-liquidity --network sepolia
```

Link and update price feed:

```bash
npx hardhat deploy-feed --pair 0xYourPair --network sepolia
npx hardhat update-feed --network sepolia
```

---

## 📊 Governance and Access

PETAI holders receive **Access Tiers** based on their USD-equivalent holdings using Uniswap TWAP pricing. These tiers can unlock app features, community tools, or governance votes in future phases.

| Tier     | Threshold (USD) |
| -------- | --------------- |
| CLUB     | \$1             |
| SILVER   | \$100           |
| GOLD     | \$500           |
| PLATINUM | \$1,000         |
| DIAMOND  | \$10,000        |

---

## 🤝 Contributing

We welcome open source contributions! Whether you're improving gas efficiency, fixing tests, or helping build the frontend dApp — thank you for helping animals and pushing crypto forward.

To get started:

```bash
git clone https://github.com/your-org/PetCoinAI.git
cd PetCoinAI
```

Please open issues or pull requests, and feel free to reach out with proposals.

---

## 📜 License

MIT License — see `LICENSE` file.

---

## 🐾 About

PetCoinAI is built by a small team of technologists and animal lovers. We believe that **blockchain can do good**, and we're committed to using smart contract transparency to improve how charitable crypto is done.

