const { positionManagerV3ABI } = require("../lib/uniswap");

task("get-liquidity", "Show position stats for the CNU/WETH Uniswap V3 pool")
  .addOptionalPositionalParam("tokenId", "Position tokenId (defaults to deployed.positionId)", "")
  .setAction(async ({ tokenId }, hre) => {
    const fs = require("fs");
    const path = require("path");
    const { ethers } = hre;

    const deployed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployed.json")))[hre.network.name];
    const positionManagerAddress = deployed.UniswapV3PositionManager;
    const id = tokenId || deployed.positionId;

    if (!positionManagerAddress) {
      console.error("❌ Missing UniswapV3PositionManager in deployed.json.");
      return;
    }
    if (!id) {
      console.error("❌ Missing position tokenId (pass positional arg or set deployed.positionId).");
      return;
    }

    const positionManager = await ethers.getContractAt(positionManagerV3ABI, positionManagerAddress);
    const position = await positionManager.positions(id);

    console.log(`📌 Position tokenId: ${id.toString()}`);
    console.log(`   Token0: ${position.token0}`);
    console.log(`   Token1: ${position.token1}`);
    console.log(`   Fee: ${position.fee}`);
    console.log(`   TickLower: ${position.tickLower}`);
    console.log(`   TickUpper: ${position.tickUpper}`);
    console.log(`   Liquidity: ${position.liquidity.toString()}`);
    console.log(`   Tokens owed0: ${position.tokensOwed0.toString()}`);
    console.log(`   Tokens owed1: ${position.tokensOwed1.toString()}`);
  });
