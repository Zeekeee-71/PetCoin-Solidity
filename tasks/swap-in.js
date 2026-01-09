const addressesFor = require("../lib/addresses");
const { routerV3ABI } = require("../lib/uniswap");

task("swap-in", "Swap WETH for CNU using Uniswap V3")
  .addPositionalParam("amountIn", "Amount of WETH to swap", "0.01")
  .addOptionalParam("fee", "Pool fee tier", "")
  .addOptionalPositionalParam("from", "signerIdx", "0")
  .setAction(async ({ amountIn, fee, from }, hre) => {
    const { ethers } = hre;
    const deployed = addressesFor(hre.network.name);

    const signers = await ethers.getSigners();
    const signer = signers[from];
    if (!signer) {
      console.error(`Signer ${from} not found`);
      return;
    }
    console.log(`Using signer ${from}: ${signer.address}`);

    if (!deployed.UniswapV3SwapRouter) {
      console.error("❌ Missing UniswapV3SwapRouter in deployed.json.");
      return;
    }

    const router = await ethers.getContractAt(routerV3ABI, deployed.UniswapV3SwapRouter);
    const weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", deployed.weth);
    const cnu = await ethers.getContractAt("CNU", deployed.token);

    const feeTier = fee ? Number.parseInt(fee, 10) : (deployed.poolFee || 3000);
    const wethAmount = ethers.parseEther(amountIn);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    const approval = await weth.connect(signer).approve(router.target, wethAmount);
    await approval.wait();

    console.log(`🚀 Swapping ${ethers.formatEther(wethAmount)} WETH for CNU...`);

    try {
      const tx = await router.connect(signer).exactInputSingle({
        tokenIn: deployed.weth,
        tokenOut: deployed.token,
        fee: feeTier,
        recipient: signer.address,
        deadline,
        amountIn: wethAmount,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0,
      });

      const receipt = await tx.wait();
      console.log(`✅ Swap complete. Tx hash: ${receipt.hash}`);

      const newBal = await cnu.connect(signer).balanceOf(signer.address);
      console.log(`💰 New CNU balance: ${ethers.formatUnits(newBal, 18)} CNU`);
    } catch (err) {
      console.error("❌ Swap failed.");
      if (err?.reason) {
        console.error(`Reason: ${err.reason}`);
      } else if (err?.message) {
        console.error(`Error: ${err.message}`);
      } else {
        console.error(err);
      }
    }
  });
