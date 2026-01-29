const addressesFor = require("../lib/addresses");
const { factoryV2ABI, routerV2ABI, pairV2ABI } = require("../lib/uniswap");

task("deploy-feed", "Deploy UniswapV2PriceFeed and link to AccessGating")
  .addOptionalPositionalParam("pair", "Pair address", "")
  .addOptionalPositionalParam("base", "Base token address (priced token)", "")
  .addOptionalPositionalParam("quote", "Quote token address", "")
  .setAction(async ({pair, base, quote}, hre) => {
    const { ethers } = hre;
    const fs = require("fs");
    const path = require("path");

    const deployed = addressesFor(hre.network.name);

    if(!(pair || deployed.pair)) {
      console.error("❌ No pair found. Please deploy the core contracts first.");
      return;
    }

    const baseToken = base || deployed.token;
    const quoteToken = quote || deployed.weth;

    if (!baseToken || !quoteToken) {
      console.error("❌ Missing base/quote token addresses. Provide them or ensure deployed.json has token + weth.");
      return;
    }

    const pairAddress = pair || deployed.pair;
    const pairContract = await ethers.getContractAt(pairV2ABI, pairAddress);
    const reserves = await pairContract.getReserves();
    if (reserves[0] === 0n || reserves[1] === 0n) {
      console.error("❌ Pair has no liquidity. Add liquidity before deploying the feed.");
      return;
    }

    console.log(`🚀 Deploying UniswapV2PriceFeed to use pair: ${pairAddress}`);

    const Feed = await ethers.getContractFactory("UniswapV2PriceFeed");
    const feed = await Feed.deploy(pairAddress, baseToken, quoteToken);
    await feed.waitForDeployment();

    console.log("📡 UniswapV2PriceFeed deployed at:", await feed.target);

    // Wire it into AccessGating
    const gate = await ethers.getContractAt("AccessGating", deployed.gate);
    const tx = await gate.setPriceFeed(feed.target);
    await tx.wait();

    console.log("🔗 AccessGating updated to use new price feed.");

    console.info("✅ Remember to update deployed.json !!!")

  });
