const addressesFor = require("../lib/addresses");
const fs = require("fs");
const path = require("path");

task("deploy-feed", "Deploy UniswapV3PriceFeed and link to AccessGating")
  .addOptionalPositionalParam("pool", "Uniswap V3 pool address", "")
  .addOptionalParam("base", "Base token priced by the feed (defaults to deployed.token)", "")
  .addOptionalParam("quote", "Quote token (defaults to deployed.weth)", "")
  .addOptionalParam("fee", "Expected pool fee tier", "")
  .addOptionalParam("twap", "TWAP interval in seconds", "1800")
  .addOptionalParam("minLiquidity", "Minimum harmonic mean liquidity", "0")
  .addOptionalParam("maxTickDeviation", "Max tick delta between updates (0 disables)", "0")
  .addOptionalParam("cardinality", "Observation cardinality to set on the pool", "0")
  .setAction(async ({ pool, base, quote, fee, twap, minLiquidity, maxTickDeviation, cardinality }, hre) => {
    const { ethers } = hre;

    const deployed = addressesFor(hre.network.name);
    const selectedPool = pool || deployed.pool;

    if (!selectedPool) {
      console.error("❌ No pool found. Please deploy the core contracts first or pass --pool <address>.");
      return;
    }

    const baseToken = base || deployed.token;
    const quoteToken = quote || deployed.quote || deployed.weth;

    if (!quoteToken) {
      console.error("❌ Missing quote token (set deployed.quote or pass --quote).");
      return;
    }
    const feeTier = fee ? Number.parseInt(fee, 10) : (deployed.poolFee || 0);

    console.log(`🚀 Deploying UniswapV3PriceFeed for pool: ${selectedPool}`);

    const Feed = await ethers.getContractFactory("UniswapV3PriceFeed");
    const feed = await Feed.deploy(
      selectedPool,
      baseToken,
      quoteToken,
      feeTier,
      Number.parseInt(twap, 10),
      BigInt(minLiquidity),
      Number.parseInt(maxTickDeviation, 10),
      Number.parseInt(cardinality, 10)
    );
    await feed.waitForDeployment();

    console.log("📡 UniswapV3PriceFeed deployed at:", await feed.target);

    // Wire it into AccessGating
    const gate = await ethers.getContractAt("AccessGating", deployed.gate);
    const tx = await gate.setPriceFeed(feed.target);
    await tx.wait();

    console.log("🔗 AccessGating updated to use new price feed.");

    deployed.feed = feed.target;
    const deployedPath = path.join(__dirname, "..", "deployed.json");
    const full = JSON.parse(fs.readFileSync(deployedPath, "utf8"));
    full[hre.network.name] = deployed;
    fs.writeFileSync(deployedPath, JSON.stringify(full, null, 2));
    console.info("✅ Updated deployed.json.");
  });
