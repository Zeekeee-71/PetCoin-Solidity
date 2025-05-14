const addressesFor = require("../lib/addresses");
const { factoryV2ABI, routerV2ABI, pairV2ABI } = require("../lib/uniswap");

task("remove-liquidity", "Removes liquidity from the PETAI/WETH pool")
  .addPositionalParam("liquidity", "Amount of LP tokens to exchange (in wei)", "0")
  .setAction(async ({ liquidity }, hre) => {

    const fs = require("fs");
    const path = require("path");
    const { ethers } = hre;
    const deployed = addressesFor(hre.network.name);  

    const token = await ethers.getContractAt("PetCoinAI", deployed.token);
    const router = await ethers.getContractAt(routerV2ABI, deployed.UniswapV2Router02);
    const pair = await ethers.getContractAt(pairV2ABI, deployed.pair);

    const pairDecimals = await pair.decimals();

    liquidity = ethers.parseUnits(liquidity, pairDecimals);
    console.log("Liquidity to remove:", ethers.formatUnits(liquidity, pairDecimals));

    const [signer] = await ethers.getSigners();

    const tx1 = await pair.approve(router.target, liquidity);
    await tx1.wait();
    console.log("✅ Approved router to spend LP tokens.");
    

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    const tx2 = await router.removeLiquidity(
      deployed.token,
      deployed.weth,
      liquidity,
      0, // min amountA
      0, // min amountB
      signer.address,
      deadline
    );

    const receipt = await tx2.wait();
    console.log("✅ Liquidity removed. Tx hash:", receipt.hash);

  });
