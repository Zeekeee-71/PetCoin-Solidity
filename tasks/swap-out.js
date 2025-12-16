
const addressesFor = require("../lib/addresses");
const { factoryV2ABI, routerV2ABI, pairV2ABI } = require("../lib/uniswap");

task("swap-out", "Swap CNU for WETH using fee-on-transfer-safe method")
  .addPositionalParam("amountIn", "Amount of CNU to swap", "1000")
  .addOptionalPositionalParam("from", "signerIdx", "0")
  .setAction(async ({ amountIn, from }, hre) => {
    const { ethers } = hre;

    const deployed = addressesFor(hre.network.name);

    const signers = await ethers.getSigners();
    const signer = signers[from];
    if(!signer) {
      console.error(`Signer ${from} not found`);
      return;
    }
    console.log(`Using signer ${from}: ${signer.address}`);

    const router = await ethers.getContractAt(routerV2ABI, deployed.UniswapV2Router02);
    const pair = await ethers.getContractAt(pairV2ABI, deployed.pair);

    const weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", deployed.weth);
    const cnu = await ethers.getContractAt("CNU", deployed.token);

    const cnuAmount = ethers.parseEther(amountIn);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    // Approve router to spend CNU
    const approval = await cnu.connect(signer).approve(router.target, cnuAmount * 2n); /////////////////////////////////
    const approval2 = await cnu.connect(signer).approve(pair.target, cnuAmount *2n);  /////////////////////////////////
    
    await approval.wait();
    await approval2.wait();

    const allowance = await cnu.connect(signer).allowance(signer.address, router.target);
    const allowance2 = await cnu.connect(signer).allowance(signer.address, pair.target);

    console.log(`Allowance to router: ${ethers.formatEther(allowance)} CNU`);
    console.log(`Allowance to pair: ${ethers.formatEther(allowance2)} CNU`);

    const cnuBalance = await cnu.connect(signer).balanceOf(signer.address);
    console.log("CNU token balance:", ethers.formatEther(cnuBalance, 18));
    const maxWallet = await cnu.maxWalletSize();
    const maxTx = await cnu.maxTxSize();
    const userBal = await weth.connect(signer).balanceOf(signer.address);
    
    console.log("Max wallet size:", ethers.formatUnits(maxWallet, 18));
    console.log("Max tx size:", ethers.formatUnits(maxTx, 18));
    console.log("User's WETH balance before swap:", ethers.formatUnits(userBal, 18));

    const out = await router.connect(signer).getAmountsOut(cnuAmount, [deployed.token, deployed.weth]);
    console.log(`📈 Estimated WETH received: ${ethers.formatUnits(out[1], 18)}`);

    console.log(`🚀 Swapping ${ethers.formatEther(cnuAmount)} CNU for WETH...`);

    let tx;
    try {
      tx = await router.connect(signer).swapExactTokensForTokensSupportingFeeOnTransferTokens( ///////////////////////////////
        cnuAmount,
        0, // accept any amount of CNU
        [deployed.token, deployed.weth],
        signer,
        deadline,
        {gasLimit: 25000000}
      );
    
      const receipt = await tx.wait();
      console.log(`✅ Swap complete. Tx hash: ${receipt.hash}`);
    
      const newBal = await weth.connect(signer).balanceOf(signer.address);
      console.log(`💰 New WETH balance: ${ethers.formatUnits(newBal, 18)} ETH`);
    
    } catch (err) {
      if(!tx){
        console.error(`⚠️ Tx undefined: ${tx}`);
      }
      if (tx?.hash) {
        console.error(`⚠️ Swap failed after submission. Tx hash: ${tx.hash}`);
      } else {
        console.error("❌ Swap failed before transaction submitted.");
      }
    
      if (err?.reason) {
        console.error(`Reason: ${err.reason}`);
      } else if (err?.message) {
        console.error(`Error: ${err.message}`);
      } else {
        console.error(err);
      }
    }

  });