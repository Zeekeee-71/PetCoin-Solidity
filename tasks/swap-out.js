
const addressesFor = require("../lib/addresses");
const { factoryV2ABI, routerV2ABI, pairV2ABI } = require("../lib/uniswap");

task("swap-out", "Swap PETAI for WETH using fee-on-transfer-safe method")
  .addPositionalParam("amountIn", "Amount of PETAI to swap", "1000")
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

    const weth = await ethers.getContractAt("IERC20", deployed.weth);
    const petai = await ethers.getContractAt("PetCoinAI", deployed.token);

    const petAmount = ethers.parseEther(amountIn);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    // Approve router to spend PETAI
    const approval = await petai.connect(signer).approve(router.target, petAmount);
    await approval.wait();

    const allowance = await petai.connect(signer).allowance(signer.address, router.target);

    console.log(`Allowance to router: ${ethers.formatEther(allowance)} PETAI`);
    const petBalance = await petai.connect(signer).balanceOf(signer.address);
    console.log("PETAI token balance:", ethers.formatEther(petBalance));
    const maxWallet = await petai.maxWalletSize();
    const maxTx = await petai.maxTxSize();
    const userBal = await weth.connect(signer).balanceOf(signer.address);
    
    console.log("Max wallet size:", ethers.formatUnits(maxWallet, 18));
    console.log("Max tx size:", ethers.formatUnits(maxTx, 18));
    console.log("User's WETH balance before swap:", ethers.formatUnits(userBal, 18));

    const out = await router.connect(signer).getAmountsOut(petAmount, [deployed.token, deployed.weth]);
    console.log(`📈 Estimated WETH received: ${ethers.formatUnits(out[1], 18)}`);

    console.log(`🚀 Swapping ${ethers.formatEther(petAmount)} PETAI for WETH...`);

    let tx;
    try {
      tx = await router.connect(signer).swapExactTokensForTokensSupportingFeeOnTransferTokens(
        petAmount,
        0, // accept any amount of PETAI
        [deployed.token, deployed.weth],
        signer,
        deadline,
        {gasLimit: 25000000}
      );
    
      const receipt = await tx.wait();
      console.log(`✅ Swap complete. Tx hash: ${receipt.hash}`);
    
      const newBal = await weth.connect(signer).balanceOf(signer.address);
      console.log(`💰 New WETH balance: ${ethers.formatUnits(newBal, 18)} PETAI`);
    
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