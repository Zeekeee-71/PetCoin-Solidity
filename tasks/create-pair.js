const fs = require("fs");
const path = require("path");

const addressesFor = require("../lib/addresses");
const { factoryV2ABI, routerV2ABI, pairV2ABI } = require("../lib/uniswap");

const deployedPath = path.join(__dirname, "..", "deployed.json");
const deployedRaw = fs.readFileSync(deployedPath, "utf8");

task("create-pair", "Creates the CNU/WETH pair on Uniswap")
  .setAction(async ({ weth }, hre) => {
    const { ethers } = hre;
    const deployed = addressesFor(hre.network.name);

    const factory = await ethers.getContractAt(factoryV2ABI, deployed.UniswapV2Factory);
    //const token = await ethers.getContractAt("CNU", deployed.token);
    //const weth = await ethers.getContractAt("IWETH", deployed.weth);

    const pair = await factory.getPair(deployed.token, deployed.weth);
    if (pair !== ethers.ZeroAddress) {
      console.log("Pair already exists:", pair);
      return;
    }

    const tx = await factory.createPair(deployed.token, deployed.weth);
    const receipt = await tx.wait();
    console.log("Pair created. Tx hash:", receipt.transactionHash);

    const newPair = await factory.getPair(deployed.token, deployed.weth);
    console.log("New pair address:", newPair);
    // Save it into deployed.json

    deployed.pair = newPair.toString();
    const full = JSON.parse(deployedRaw);
    full[hre.network.name] = deployed;
    fs.writeFileSync(deployedPath, JSON.stringify(full, null, 2));
    console.log("✅ Updated deployed.json.");
  });