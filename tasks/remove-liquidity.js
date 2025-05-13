const { factoryV2ABI, routerV2ABI, pairV2ABI } = require("../lib/uniswap");

task("remove-liquidity", "Removes liquidity from the PETAI/WETH pool")
  .addParam("liquidity", "Amount of LP tokens to burn (in wei)")
  .setAction(async ({ liquidity }, hre) => {
    const fs = require("fs");
    const path = require("path");
    const { ethers } = hre;

    const deployedPath = path.join(__dirname, "..", "deployed.json");
    const deployed = JSON.parse(fs.readFileSync(deployedPath))[hre.network.name];

    const token = deployed.token;
    const router = await ethers.getContractAt(routerV2ABI, deployed.UniswapV2Router02);

    const factory = await ethers.getContractAt(factoryV2ABI, deployed.UniswapV2Factory);

    const pairAddress = await factory.getPair(token, deployed.weth);
    if (pairAddress === ethers.ZeroAddress) {
      console.error("❌ Pair does not exist.");
      return;
    }

    const pair = await ethers.getContractAt(pairV2ABI, pairAddress);

    const [signer] = await ethers.getSigners();

    const tx1 = await pair.approve(router.target, liquidity);
    await tx1.wait();
    console.log("✅ Approved router to spend LP tokens.");

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    const tx2 = await router.removeLiquidity(
      token,
      weth,
      liquidity,
      0, // min amountA
      0, // min amountB
      signer.address,
      deadline
    );

    const receipt = await tx2.wait();
    console.log("✅ Liquidity removed. Tx hash:", receipt.hash);
  });
