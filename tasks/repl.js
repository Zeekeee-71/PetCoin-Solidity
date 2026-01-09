const addressesFor = require("../lib/addresses");
const { factoryV3ABI, routerV3ABI, poolV3ABI, positionManagerV3ABI } = require("../lib/uniswap");
const fs = require("fs");
const path = require("path");
const repl = require("repl");

task("repl", "Launch interactive Hardhat REPL")
  .setAction(async (_, hre) => {
    const { ethers } = hre;

    const signers = await ethers.getSigners();
    const [deployer, alt, tri] = signers;
    const deployed = addressesFor(hre.network.name);

    const quoteAddress = deployed.quote || deployed.weth;
    const quoteToken = quoteAddress
      ? await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", quoteAddress, deployer)
      : null;

    const context = {
      // Hardhat
      ethers,
      hre,
      parse: (v) => ethers.parseUnits(v.toString(), 18),
      format: (v) => ethers.formatUnits(v.toString(), 18),
      // Signers
      deployed,
      deployer,
      signer: deployer,
      alt,
      tri,
      signers,
      // Contracts
      token: await ethers.getContractAt("CNU", deployed.token, deployer),
      weth: deployed.weth
        ? await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", deployed.weth, deployer)
        : null,
      quote: quoteToken,
      charity: await ethers.getContractAt("CharityVault", deployed.charity, deployer),
      staking: await ethers.getContractAt("StakingVault", deployed.staking, deployer),
      feed: await ethers.getContractAt("UniswapV3PriceFeed", deployed.feed, deployer),
      gate: await ethers.getContractAt("AccessGating", deployed.gate, deployer), 
      // Uniswap V3
      router: await ethers.getContractAt(routerV3ABI, deployed.UniswapV3SwapRouter, deployer),
      factory: await ethers.getContractAt(factoryV3ABI, deployed.UniswapV3Factory, deployer),
      positionManager: await ethers.getContractAt(positionManagerV3ABI, deployed.UniswapV3PositionManager, deployer),
      pool: await ethers.getContractAt(poolV3ABI, deployed.pool, deployer),
      // Utilities
      delay: ms => new Promise(res => setTimeout(res, ms))
    };

    console.log("🔮 Hardhat CNU REPL");
    const replServer = repl.start({
      prompt: "🦴 > ",
      useGlobal: false,
      ignoreUndefined: true,
    });

    // Inject all bindings into REPL context
    Object.assign(replServer.context, context);

    // Optional: autocomplete on context keys

    await new Promise(() => {});
  });
