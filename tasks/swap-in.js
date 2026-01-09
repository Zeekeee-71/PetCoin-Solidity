const addressesFor = require("../lib/addresses");
const { routerV3ABI } = require("../lib/uniswap");

task("swap-in", "Swap quote token for CNU using Uniswap V3")
  .addPositionalParam("amountIn", "Amount of quote token to swap", "0.01")
  .addOptionalParam("quote", "Quote token address (defaults to deployed.quote or deployed.weth)", "")
  .addOptionalParam("fee", "Pool fee tier", "")
  .addOptionalPositionalParam("from", "signerIdx", "0")
  .setAction(async ({ amountIn, quote, fee, from }, hre) => {
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

    const quoteTokenAddress = quote || deployed.quote || deployed.weth;
    if (!quoteTokenAddress) {
      console.error("❌ Missing quote token (set deployed.quote or pass --quote).");
      return;
    }

    const router = await ethers.getContractAt(routerV3ABI, deployed.UniswapV3SwapRouter);
    const quoteToken = await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol:IERC20Metadata",
      quoteTokenAddress
    );
    const cnu = await ethers.getContractAt("CNU", deployed.token);

    const feeTier = fee ? Number.parseInt(fee, 10) : (deployed.poolFee || 3000);
    const quoteDecimals = await quoteToken.decimals();
    const quoteAmount = ethers.parseUnits(amountIn, quoteDecimals);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    const approval = await quoteToken.connect(signer).approve(router.target, quoteAmount);
    await approval.wait();

    console.log(`🚀 Swapping ${amountIn} quote tokens for CNU...`);

    try {
      const tx = await router.connect(signer).exactInputSingle({
        tokenIn: quoteTokenAddress,
        tokenOut: deployed.token,
        fee: feeTier,
        recipient: signer.address,
        deadline,
        amountIn: quoteAmount,
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
