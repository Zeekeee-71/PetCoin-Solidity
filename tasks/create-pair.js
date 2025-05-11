task("create-pair", "Creates the PETAI/WETH pair on Uniswap")
  .setAction(async ({ weth }, hre) => {
    const fs = require("fs");
    const path = require("path");
    const { ethers } = hre;

    const deployedPath = path.join(__dirname, "..", "deployed.json");
    const deployedRaw = fs.readFileSync(deployedPath, "utf8");
    const deployed = JSON.parse(deployedRaw)[hre.network.name];

    const IUniswapV2FactoryABI = [
      "function createPair(address tokenA, address tokenB) external returns (address pair)",
      "function getPair(address tokenA, address tokenB) external view returns (address pair)"
    ];

    const factory = await ethers.getContractAt(IUniswapV2FactoryABI, deployed.UniswapV2Factory);
    const token = deployed.token;

    const pair = await factory.getPair(token, deployed.weth);
    if (pair !== ethers.ZeroAddress) {
      console.log("Pair already exists:", pair);
      return;
    }

    const tx = await factory.createPair(token, deployed.weth);
    const receipt = await tx.wait();
    console.log("Pair created. Tx hash:", receipt.transactionHash);

    const newPair = await factory.getPair(token, deployed.weth);
    console.log("New pair address:", newPair);
    // Save it into deployed.json

    deployed.pair = newPair.toString()
    const full = JSON.parse(deployedRaw);
    full[hre.network.name] = deployed;
    fs.writeFileSync(deployedPath, JSON.stringify(full, null, 2));
    console.log("✅ Updated deployed.json.");


  });