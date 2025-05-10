task("deploy-feed", "Deploy UniswapV2PriceFeed and link to AccessGating")
  .addParam("pair", "Address of the UniswapV2 Pair (PETAI/WETH)")
  .setAction(async ({ pair }, hre) => {
    const { ethers } = hre;
    const fs = require("fs");
    const path = require("path");

    const deployedPath = path.join(__dirname, "..", "deployed.json");
    const deployedRaw = fs.readFileSync(deployedPath, "utf8");
    const deployed = JSON.parse(deployedRaw)[hre.network.name];

    const Feed = await ethers.getContractFactory("UniswapV2PriceFeed");
    const feed = await Feed.deploy(pair);
    await feed.waitForDeployment();

    console.log("📡 UniswapV2PriceFeed deployed:", await feed.getAddress());

    // Wire it into AccessGating
    const accessGating = await ethers.getContractAt("AccessGating", deployed.gate);
    const tx = await accessGating.setPriceFeed(await feed.getAddress());
    await tx.wait();

    console.log("🔗 AccessGating updated to use new price feed.");

    // Save it into deployed.json
    deployed.feed = await feed.getAddress();
    const full = JSON.parse(deployedRaw);
    full[hre.network.name] = deployed;
    fs.writeFileSync(deployedPath, JSON.stringify(full, null, 2));

    console.log("✅ Updated deployed.json with new price feed.");
  });