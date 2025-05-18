const addressesFor = require("../lib/addresses");
const { factoryV2ABI, routerV2ABI } = require("../lib/uniswap")
;
task("add-liquidity", "Adds liquidity to the PETAI/WETH pool")
  .addParam("amountPetai", "Amount of PETAI to add", "1000000", types.string) // 1,000,000 PETAI
  .addParam("amountWeth", "Amount of WETH to add",              "1", types.string) // 1 WETH
  .setAction(async ({ amountPetai, amountWeth, weth }, hre) => {
    

    const fs = require("fs");
    const path = require("path");
    const { ethers } = hre;

    amountPetai = ethers.parseUnits(amountPetai, 18);
    amountWeth = ethers.parseUnits(amountWeth, 18);
    const deployed = addressesFor(hre.network.name);

    const [signer] = await ethers.getSigners();
    const router = await ethers.getContractAt(routerV2ABI, deployed.UniswapV2Router02);
    const token = await ethers.getContractAt("PetCoinAI", deployed.token);
    const wethToken = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", deployed.weth);

    await token.approve(router.target, amountPetai);
    await wethToken.approve(router.target, amountWeth);

    const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
    const tx = await router.addLiquidity(
      deployed.token,
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