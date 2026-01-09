const addressesFor = require("../lib/addresses");
const { positionManagerV3ABI } = require("../lib/uniswap");

task("remove-liquidity", "Removes liquidity from the CNU/WETH pool on Uniswap V3")
  .addOptionalPositionalParam("tokenId", "Position tokenId (defaults to deployed.positionId)", "")
  .addOptionalParam("liquidity", "Liquidity amount to remove (defaults to full)", "0")
  .setAction(async ({ tokenId, liquidity }, hre) => {
    const { ethers } = hre;
    const deployed = addressesFor(hre.network.name);
    const positionManagerAddress = deployed.UniswapV3PositionManager;

    if (!positionManagerAddress) {
      console.error("❌ Missing UniswapV3PositionManager in deployed.json.");
      return;
    }

    const id = tokenId || deployed.positionId;
    if (!id) {
      console.error("❌ Missing position tokenId (pass positional arg or set deployed.positionId).");
      return;
    }

    const [signer] = await ethers.getSigners();
    const positionManager = await ethers.getContractAt(positionManagerV3ABI, positionManagerAddress);
    const position = await positionManager.positions(id);

    const fullLiquidity = position.liquidity;
    const liquidityToRemove = liquidity === "0" ? fullLiquidity : BigInt(liquidity);
    if (liquidityToRemove > fullLiquidity) {
      console.error("❌ Liquidity amount exceeds position liquidity.");
      return;
    }

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    const tx = await positionManager.connect(signer).decreaseLiquidity({
      tokenId: id,
      liquidity: liquidityToRemove,
      amount0Min: 0,
      amount1Min: 0,
      deadline,
    });
    await tx.wait();

    const maxUint128 = (2n ** 128n) - 1n;
    const collectTx = await positionManager.connect(signer).collect({
      tokenId: id,
      recipient: signer.address,
      amount0Max: maxUint128,
      amount1Max: maxUint128,
    });
    await collectTx.wait();

    if (liquidityToRemove === fullLiquidity) {
      const burnTx = await positionManager.connect(signer).burn(id);
      await burnTx.wait();
      console.log("✅ Position burned.");
    }

    console.log("✅ Liquidity removed for position:", id.toString());
  });
