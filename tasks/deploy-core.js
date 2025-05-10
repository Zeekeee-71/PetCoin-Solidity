// return false; // prevent accidental re-deployment

task("deploy-core", "Deploy core contracts")
  .setAction(async (args, hre) => {

    const [signer] = await ethers.getSigners();

    const fs = require("fs");
    const path = require("path");
    const network = hre.network.name;
    const deployedPath = path.join(__dirname, "..", "deployed.json");
    const deployedRaw = fs.readFileSync(deployedPath, "utf8");
    const deployed = JSON.parse(deployedRaw)[hre.network.name];


    console.log(`🚀 Deploying contracts from: ${signer.address}`);

    // 1. Deploy PETAI token
    const TokenFactory = await ethers.getContractFactory("PetCoinAI");
    const token = await TokenFactory.deploy(ethers.parseUnits("1000000000000", 18));
    await token.waitForDeployment();
    console.log(`💰 PetCoinAI deployed at: ${token.target}`);

    // 1.2. Set Wallet Limit 
    await token.setWalletLimit(ethers.parseUnits("10000000000", 18)); // Ten Billion in 18 decimals
    console.log(`🔒 Wallet limit set`);

    // 1.3. Set Transaction Limit 
    await token.setTxLimit(ethers.parseUnits("1000000000", 18)); // One Billion in 18 decimals
    console.log(`🔒 Transaction limit set`);

    // 2. Deploy Charity Vault
    const CharityVaultFactory = await ethers.getContractFactory("CharityVault");
    const charityVault = await CharityVaultFactory.deploy(token);
    await token.setCharityVault(charityVault);
    console.log(`🏦 CharityVault deployed at: ${charityVault.target}`);

    // 3. Deploy Staking Vault
    const StakingVaultFactory = await ethers.getContractFactory("StakingVault");
    const stakingVault = await StakingVaultFactory.deploy(token);
    await token.setStakingVault(stakingVault);
    console.log(`🏦 StakingVault deployed at: ${stakingVault.target}`);

    // 4. Deploy mock price feed
    const PriceFeedFactory = await ethers.getContractFactory("MockPriceFeed");
    const feed = await PriceFeedFactory.deploy(); 
    await feed.waitForDeployment();
    console.log(`🪙 MockPriceFeed deployed at: ${feed.target}`);

    // 5. Deploy Access Gate
    const AccessFactory = await ethers.getContractFactory("AccessGating");
    const gate = await AccessFactory.deploy(token, feed);
    await gate.waitForDeployment();
    console.log(`🧭 AccessGating deployed at: ${gate.target}`);

    // 8. Done
    console.log("✅ All contracts deployed and wired");


    // Save it into deployed.json
    deployed.token = token.target;
    deployed.charity = charityVault.target;
    deployed.staking = stakingVault.target;
    deployed.feed = feed.target;
    deployed.gate = gate.target;

    const full = JSON.parse(deployedRaw);
    full[hre.network.name] = deployed;
    fs.writeFileSync(deployedPath, JSON.stringify(full, null, 2));
    console.log("✅ Updated deployed.json.");

  })
