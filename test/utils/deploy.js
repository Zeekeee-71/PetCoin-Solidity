const { ethers } = require("hardhat");

function getTokenPair(token, weth) {
  return token.address < weth.address
  ? [token.address, weth.address]
  : [weth.address, token.address];
}


async function deployEcosystem() {
  const [owner, user1, user2, user3, ...rest] = await ethers.getSigners();

  const MockFeedFactory = await ethers.getContractFactory("MockPriceFeed");
  const feed = await MockFeedFactory.deploy();
  await feed.setPrice(10000); 

  const TokenFactory = await ethers.getContractFactory("PetCoinAI");
  const token = await TokenFactory.deploy(ethers.parseUnits("1000000000000", 18));
  await token.setWalletLimit(ethers.parseUnits("10000000000", 18)); // Ten Billion in 18 decimals
  await token.setTxLimit(ethers.parseUnits("1000000000", 18)); // One Billion in 18 decimals

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

  const FactoryFactory = await ethers.getContractFactory("UniswapV2Factory");
  const factory = await FactoryFactory.deploy(owner);

  const RouterFactory = await ethers.getContractFactory("UniswapV2Router02");
  const router = await RouterFactory.deploy(factory, weth);

  const tx = await factory.createPair(token, weth);
  await tx.wait();

  const pair = await ethers.getContractAt("MockUniswapV2Pair", await factory.getPair(token, weth)); 
  await token.excludeFromLimits(pair, true);

  const UniFeed = await ethers.getContractFactory("UniswapV2PriceFeed");
  unifeed = await UniFeed.deploy(pair);

  const [tokenA, tokenB] = token.target < weth.target
    ? [token.target, weth.target]
    : [weth.target, token.target];


  return {
    owner,
    user1,
    user2,
    user3,
    rest,
    token,
    charityVault,
    stakingVault,
    gate,
    feed,
    unifeed,
    factory,
    router,
    weth,
    pair,
    tokenA,
    tokenB,
  };
}

module.exports = { deployEcosystem };