const { sign } = require("crypto");
const addressesFor = require("../lib/addresses");
const { factoryV2ABI, routerV2ABI, pairV2ABI } = require("../lib/uniswap");
const fs = require("fs");
const path = require("path");
const repl = require("repl");

task("repl", "Launch interactive Hardhat REPL")
  .setAction(async (_, hre) => {
    const { ethers } = hre;

    const signers = await ethers.getSigners();
    const [deployer, alt, tri] = signers;
    const deployed = addressesFor(hre.network.name);

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
      token: await ethers.getContractAt("PetCoinAI", deployed.token, deployer),
      weth: await ethers.getContractAt("IERC20", deployed.weth, deployer),
      charity: await ethers.getContractAt("CharityVault", deployed.charity, deployer),
      staking: await ethers.getContractAt("StakingVault", deployed.staking, deployer),
      feed: await ethers.getContractAt("MockPriceFeed", deployed.feed, deployer),
      gate: await ethers.getContractAt("AccessGating", deployed.gate, deployer), 
      // Uniswap V2
      router: await ethers.getContractAt(routerV2ABI, deployed.UniswapV2Router02, deployer),
      factory: await ethers.getContractAt(factoryV2ABI, deployed.UniswapV2Factory, deployer),
      pair: await ethers.getContractAt(pairV2ABI, deployed.UniswapV2Factory, deployer),
      // Utilities
      delay: ms => new Promise(res => setTimeout(res, ms))
    };

    console.log("🔮 Hardhat PETAI REPL");
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