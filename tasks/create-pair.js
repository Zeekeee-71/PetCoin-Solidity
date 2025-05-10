task("create-pair", "Creates the PETAI/WETH pair on Uniswap")
  .addOptionalParam("weth", "WETH token address", "0xC778417E063141139Fce010982780140Aa0cD5Ab") // adjust if needed
  .setAction(async ({ weth }, hre) => {
    const fs = require("fs");
    const path = require("path");
    const { ethers } = hre;

    const deployedPath = path.join(__dirname, "..", "deployed.json");
    const deployedRaw = fs.readFileSync(deployedPath, "utf8");
    const deployed = JSON.parse(deployedRaw)[hre.network.name];

    const factory = await ethers.getContractAt("IUniswapV2Factory", deployed.UniswapV2Factory);
    const token = deployed.token;

    const pair = await factory.getPair(token, weth);
    if (pair !== ethers.ZeroAddress) {
      console.log("Pair already exists:", pair);
      return;
    }

    const tx = await factory.createPair(token, weth);
    const receipt = await tx.wait();
    console.log("Pair created. Tx hash:", receipt.transactionHash);

    const newPair = await factory.getPair(token, weth);
    console.log("New pair address:", newPair);
    // Save it into deployed.json

    deployed.pair = newPair.toString()
    const full = JSON.parse(deployedRaw);
    full[hre.network.name] = deployed;
    fs.writeFileSync(deployedPath, JSON.stringify(full, null, 2));
    console.log("✅ Updated deployed.json.");


  });