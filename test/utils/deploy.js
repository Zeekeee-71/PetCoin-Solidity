const { ethers } = require("hardhat");

async function deployEcosystem() {
  const [owner, user1, user2, user3, ...rest] = await ethers.getSigners();

  const PriceFeedFactory = await ethers.getContractFactory("MockPriceFeed");
  const feed = await PriceFeedFactory.deploy();
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
    feed
  };
}

module.exports = { deployEcosystem };