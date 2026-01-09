const addressesFor = require("../lib/addresses");
const { routerV3ABI } = require("../lib/uniswap");

task("swap-out", "Swap CNU for quote token using Uniswap V3")
  .addPositionalParam("amountIn", "Amount of CNU to swap", "1000")
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
    const cnuAmount = ethers.parseEther(amountIn);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    const approval = await cnu.connect(signer).approve(router.target, cnuAmount);
    await approval.wait();

    console.log(`🚀 Swapping ${ethers.formatEther(cnuAmount)} CNU for quote tokens...`);

    try {
      const tx = await router.connect(signer).exactInputSingle({
        tokenIn: deployed.token,
        tokenOut: quoteTokenAddress,
        fee: feeTier,
        recipient: signer.address,
        deadline,
        amountIn: cnuAmount,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0,
      });

      const receipt = await tx.wait();
      console.log(`✅ Swap complete. Tx hash: ${receipt.hash}`);

      const newBal = await quoteToken.connect(signer).balanceOf(signer.address);
      const quoteDecimals = await quoteToken.decimals();
      console.log(`💰 New quote balance: ${ethers.formatUnits(newBal, quoteDecimals)}`);
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
