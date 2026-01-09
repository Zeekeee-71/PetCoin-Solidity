const { ethers } = require("hardhat");

async function deployEcosystem() {
  const [owner, user1, user2, user3, ...rest] = await ethers.getSigners();

  const MockFeedFactory = await ethers.getContractFactory("MockPriceFeed");
  const feed = await MockFeedFactory.deploy();
  await feed.setPrice(10000); 

  const TokenFactory = await ethers.getContractFactory("CNU");
  const token = await TokenFactory.deploy(ethers.parseUnits("1000000000000", 18));
  await token.setWalletLimit(ethers.parseUnits("10000000000", 18)); // Ten Billion in 18 decimals
  await token.setTxLimit(ethers.parseUnits("1000000000", 18)); // One Billion in 18 decimals

  const TreasuryVaultFactory = await ethers.getContractFactory("TreasuryVault");
  const treasuryVault = await TreasuryVaultFactory.deploy(token);
  await token.setTreasuryVault(treasuryVault);

  const CharityVaultFactory = await ethers.getContractFactory("CharityVault");
  const charityVault = await CharityVaultFactory.deploy(token);
  await token.setCharityVault(charityVault);

  const StakingVaultFactory = await ethers.getContractFactory("StakingVault");
  const stakingVault = await StakingVaultFactory.deploy(token);
  await token.setStakingVault(stakingVault);

  const AccessFactory = await ethers.getContractFactory("AccessGating");
  const gate = await AccessFactory.deploy(token, feed);

  const WethFactory = await ethers.getContractFactory("WETH9");
  const weth = await WethFactory.deploy();

  const v3FactoryArtifact = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");
  const swapRouterArtifact = require("@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json");
  const positionManagerArtifact = require("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");
  const poolArtifact = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");

  const FactoryFactory = new ethers.ContractFactory(
    v3FactoryArtifact.abi,
    v3FactoryArtifact.bytecode,
    owner
  );
  const factory = await FactoryFactory.deploy();

  const swapRouterFactory = new ethers.ContractFactory(
    swapRouterArtifact.abi,
    swapRouterArtifact.bytecode,
    owner
  );
  const router = await swapRouterFactory.deploy(factory, weth);

  const DescriptorFactory = await ethers.getContractFactory("MockPositionDescriptor");
  const descriptor = await DescriptorFactory.deploy();

  const positionManagerFactory = new ethers.ContractFactory(
    positionManagerArtifact.abi,
    positionManagerArtifact.bytecode,
    owner
  );
  const positionManager = await positionManagerFactory.deploy(factory, weth, descriptor);

  const poolFee = 3000;
  const createPoolTx = await factory.createPool(token, weth, poolFee);
  await createPoolTx.wait();

  const poolAddress = await factory.getPool(token, weth, poolFee);
  const pool = new ethers.Contract(poolAddress, poolArtifact.abi, owner);
  const sqrtPriceX96 = 2n ** 96n;
  await pool.initialize(sqrtPriceX96);

  await token.excludeFromLimits(poolAddress, true);
  await token.excludeFromFees(poolAddress, true);

  const UniFeed = await ethers.getContractFactory("UniswapV3PriceFeed");
  const unifeed = await UniFeed.deploy(
    poolAddress,
    token.target ?? token.address,
    weth.target ?? weth.address,
    poolFee,
    1800,
    0,
    0,
    0
  );

  return {
    owner,
    user1,
    user2,
    user3,
    rest,
    token,
    treasuryVault,
    charityVault,
    stakingVault,
    gate,
    feed,
    unifeed,
    factory,
    router,
    weth,
    pool,
    positionManager,
    poolFee,
  };
}

module.exports = { deployEcosystem };
