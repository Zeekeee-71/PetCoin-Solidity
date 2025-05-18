const addressesFor = require("../lib/addresses");
const { factoryV2ABI, routerV2ABI, pairV2ABI } = require("../lib/uniswap");

task("deploy-feed", "Deploy UniswapV2PriceFeed and link to AccessGating")
  .addOptionalPositionalParam("pair", "Pair address", "")
  .setAction(async ({pair}, hre) => {
    const { ethers } = hre;
    const fs = require("fs");
    const path = require("path");

    const deployed = addressesFor(hre.network.name);

    if(!(pair || deployed.pair)) {
      console.error("❌ No pair found. Please deploy the core contracts first.");
      return;
    }
    console.log(`🚀 Deploying UniswapV2PriceFeed to use pair: ${pair || deployed.pair}`);

    const Feed = await ethers.getContractFactory("UniswapV2PriceFeed");
    const feed = await Feed.deploy(pair || deployed.pair);
    await feed.waitForDeployment();

    console.log("📡 UniswapV2PriceFeed deployed at:", await feed.target);

    // Wire it into AccessGating
    const gate = await ethers.getContractAt("AccessGating", deployed.gate);
    const tx = await gate.setPriceFeed(feed.target);
    await tx.wait();

    console.log("🔗 AccessGating updated to use new price feed.");

    console.info("✅ Remember to update deployed.json !!!")

  });