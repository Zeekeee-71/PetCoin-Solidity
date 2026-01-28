task("update-feed", "Calls update() on the UniswapV3PriceFeed contract")
  .setAction(async (_, hre) => {
    const fs = require("fs");
    const path = require("path");
    const { ethers } = hre;

    const network = hre.network.name;
    const deployedPath = path.join(__dirname, "..", "deployed.json");
    const deployedRaw = fs.readFileSync(deployedPath, "utf8");
    const deployed = JSON.parse(deployedRaw)[hre.network.name];


    const feed = await ethers.getContractAt("UniswapV3PriceFeed", deployed.feed);

    console.log(`📡 Calling update() on PriceFeed at ${feed.target}...`);
    try {
      const tx = await feed.update();
      await tx.wait();
    } catch (e) {
      console.warn("⚠️ Update skipped (mock feed or too soon):", e.message);
    }

    const price = await feed.getLatestPrice();
    console.log(`✔ Current price: ${ethers.formatUnits(price, 18)} (18 decimals)`);

    try {
      const lastUpdate = await feed.getTimeSinceUpdate();
      console.log(`🕒 Time since update: ${lastUpdate.toString()} seconds`);
    } catch (e) {
      console.warn("ℹ️ Time since update unavailable (likely MockPriceFeed).");
    }
  });
