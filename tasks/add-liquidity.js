const { factoryV2ABI, routerV2ABI } = require("../lib/uniswap");

task("add-liquidity", "Adds liquidity to the PETAI/WETH pool")
  .addParam("amountPetai", "Amount of PETAI to add", "10000000000000000000000000000", types.string) // 10,000,000,000 PETAI
  .addParam("amountWeth", "Amount of WETH to add",              "1000000000000000000", types.string) // 1 WETH
  .setAction(async ({ amountPetai, amountWeth, weth }, hre) => {
    const fs = require("fs");
    const path = require("path");
    const { ethers } = hre;
    const deployedPath = path.join(__dirname, "..", "deployed.json");
    const deployedRaw = fs.readFileSync(deployedPath, "utf8");
    const deployed = JSON.parse(deployedRaw)[hre.network.name];


    const [signer] = await ethers.getSigners();
    const router = await ethers.getContractAt(routerV2ABI, deployed.UniswapV2Router02);
    const token = await ethers.getContractAt("PetCoinAI", deployed.token);
    const wethToken = await ethers.getContractAt("IERC20", deployed.weth);

    await token.approve(router.target, amountPetai);
    await wethToken.approve(router.target, amountWeth);

    const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
    const tx = await router.addLiquidity(
      token.target,
      deployed.weth,
      amountPetai,
      amountWeth,
      0,
      0,
      signer.address,
      deadline
    );

    const receipt = await tx.wait();
    console.log("Liquidity added. Tx hash:", receipt.transactionHash);
  });