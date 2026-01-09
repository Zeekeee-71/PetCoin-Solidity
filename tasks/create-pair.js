const fs = require("fs");
const path = require("path");

const addressesFor = require("../lib/addresses");
const { factoryV3ABI, poolV3ABI } = require("../lib/uniswap");

const deployedPath = path.join(__dirname, "..", "deployed.json");
const deployedRaw = fs.readFileSync(deployedPath, "utf8");

task("create-pair", "Creates the CNU/quote pool on Uniswap V3")
  .addOptionalParam("quote", "Quote token address (defaults to deployed.quote or deployed.weth)", "")
  .addOptionalParam("fee", "Pool fee tier (e.g. 500, 3000, 10000)", "3000")
  .addOptionalParam("sqrtPriceX96", "Initial sqrtPriceX96 (defaults to 1:1)", "")
  .addOptionalParam("cardinality", "Observation cardinality to set on the pool", "0")
  .setAction(async ({ quote, fee, sqrtPriceX96, cardinality }, hre) => {
    const { ethers } = hre;
    const deployed = addressesFor(hre.network.name);

    if (!deployed.UniswapV3Factory) {
      console.error("❌ Missing UniswapV3Factory in deployed.json.");
      return;
    }

    const quoteToken = quote || deployed.quote || deployed.weth;
    if (!quoteToken) {
      console.error("❌ Missing quote token (set deployed.quote or pass --quote).");
      return;
    }

    const factory = await ethers.getContractAt(factoryV3ABI, deployed.UniswapV3Factory);
    const feeTier = Number.parseInt(fee, 10);

    const pool = await factory.getPool(deployed.token, quoteToken, feeTier);
    if (pool !== ethers.ZeroAddress) {
      console.log("Pool already exists:", pool);
      return;
    }

    const tx = await factory.createPool(deployed.token, quoteToken, feeTier);
    const receipt = await tx.wait();
    console.log("Pool created. Tx hash:", receipt.transactionHash);

    const newPool = await factory.getPool(deployed.token, quoteToken, feeTier);
    console.log("New pool address:", newPool);

    const poolContract = await ethers.getContractAt(poolV3ABI, newPool);
    const slot0 = await poolContract.slot0();
    const needsInit = slot0[0] === 0n;

    if (needsInit) {
      const initialSqrtPrice = sqrtPriceX96
        ? BigInt(sqrtPriceX96)
        : 2n ** 96n;
      const initTx = await poolContract.initialize(initialSqrtPrice);
      await initTx.wait();
      console.log("✅ Pool initialized.");
    }

    const cardinalityNext = Number.parseInt(cardinality, 10);
    if (cardinalityNext > 0) {
      const cardTx = await poolContract.increaseObservationCardinalityNext(cardinalityNext);
      await cardTx.wait();
      console.log(`✅ Cardinality set to ${cardinalityNext}.`);
    }

    deployed.pool = newPool.toString();
    deployed.poolFee = feeTier;
    deployed.quote = quoteToken;
    const full = JSON.parse(deployedRaw);
    full[hre.network.name] = deployed;
    fs.writeFileSync(deployedPath, JSON.stringify(full, null, 2));
    console.log("✅ Updated deployed.json.");
  });
