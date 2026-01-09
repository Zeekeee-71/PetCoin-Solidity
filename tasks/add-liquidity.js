const addressesFor = require("../lib/addresses");
const { poolV3ABI, positionManagerV3ABI } = require("../lib/uniswap");

task("add-liquidity", "Adds liquidity to the CNU/WETH pool on Uniswap V3")
  .addParam("amountCnu", "Amount of CNU to add", "1000000", types.string)
  .addParam("amountWeth", "Amount of WETH to add", "1", types.string)
  .addOptionalParam("fee", "Pool fee tier (e.g. 500, 3000, 10000)", "")
  .addOptionalParam("tickLower", "Lower tick (optional, must match spacing)", "")
  .addOptionalParam("tickUpper", "Upper tick (optional, must match spacing)", "")
  .addFlag("skipExemptions", "Skip fee/limit exemptions for the pool")
  .setAction(async ({ amountCnu, amountWeth, fee, tickLower, tickUpper, skipExemptions }, hre) => {
    const { ethers } = hre;
    const fs = require("fs");
    const path = require("path");

    const deployed = addressesFor(hre.network.name);
    const poolAddress = deployed.pool;
    const positionManagerAddress = deployed.UniswapV3PositionManager;

    if (!poolAddress || !positionManagerAddress) {
      console.error("❌ Missing pool or UniswapV3PositionManager in deployed.json.");
      return;
    }

    const feeTier = fee ? Number.parseInt(fee, 10) : (deployed.poolFee || 3000);

    const [signer] = await ethers.getSigners();
    const token = await ethers.getContractAt("CNU", deployed.token);
    const wethToken = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", deployed.weth);
    const pool = await ethers.getContractAt(poolV3ABI, poolAddress);
    const positionManager = await ethers.getContractAt(positionManagerV3ABI, positionManagerAddress);

    if (!skipExemptions) {
      await token.excludeFromLimits(poolAddress, true);
      await token.excludeFromFees(poolAddress, true);
    }

    const amountCnuParsed = ethers.parseUnits(amountCnu, 18);
    const amountWethParsed = ethers.parseUnits(amountWeth, 18);

    const token0 = await pool.token0();
    const token1 = await pool.token1();

    const amount0Desired = token0.toLowerCase() === deployed.token.toLowerCase()
      ? amountCnuParsed
      : amountWethParsed;
    const amount1Desired = token1.toLowerCase() === deployed.token.toLowerCase()
      ? amountCnuParsed
      : amountWethParsed;

    await token.approve(positionManager.target, amount0Desired + amount1Desired);
    await wethToken.approve(positionManager.target, amount0Desired + amount1Desired);

    const spacing = Number(await pool.tickSpacing());
    const lower = tickLower ? Number.parseInt(tickLower, 10) : Math.floor(-600 / spacing) * spacing;
    const upper = tickUpper ? Number.parseInt(tickUpper, 10) : Math.ceil(600 / spacing) * spacing;

    if (lower % spacing !== 0 || upper % spacing !== 0) {
      console.error(`❌ Tick bounds must be multiples of spacing (${spacing}).`);
      return;
    }

    const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
    const tx = await positionManager.mint({
      token0,
      token1,
      fee: feeTier,
      tickLower: lower,
      tickUpper: upper,
      amount0Desired,
      amount1Desired,
      amount0Min: 0,
      amount1Min: 0,
      recipient: signer.address,
      deadline,
    });

    const receipt = await tx.wait();
    const transferEvent = receipt.logs
      .map((log) => {
        try {
          return positionManager.interface.parseLog(log);
        } catch (_) {
          return null;
        }
      })
      .find((evt) => evt && evt.name === "Transfer" && evt.args.from === ethers.ZeroAddress);

    if (transferEvent) {
      deployed.positionId = transferEvent.args.tokenId.toString();
    }

    deployed.poolFee = feeTier;
    const full = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployed.json"), "utf8"));
    full[hre.network.name] = deployed;
    fs.writeFileSync(path.join(__dirname, "..", "deployed.json"), JSON.stringify(full, null, 2));

    console.log("✅ Liquidity added. Tx hash:", receipt.transactionHash);
    if (deployed.positionId) {
      console.log("📌 Position tokenId:", deployed.positionId);
    }
  });
