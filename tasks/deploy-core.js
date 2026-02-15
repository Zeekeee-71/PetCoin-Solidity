const addressesFor = require("../lib/addresses");

task("deploy-core", "Deploy core contracts")
  .setAction(async (args, hre) => {

    const [signer] = await ethers.getSigners();

    const fs = require("fs");
    const path = require("path");
    const network = hre.network.name;
    
    console.log(`Deploying to ${network}`);
    
    const deployedPath = path.join(__dirname, "..", "deployed.json"); //  don't use addressFor() here,
    const deployedRaw = fs.readFileSync(deployedPath, "utf8");        //  we need the path and
    const deployed = JSON.parse(deployedRaw)[hre.network.name];          //  existing should be overwritten

    console.log(`🚀 Deploying contracts from: ${signer.address}`);

	const signer_balance = await ethers.provider.getBalance(signer.address);

    console.log(`🚀 Balance: ${ethers.formatEther(signer_balance)}`);

	
    // 1. Deploy CNU token
    const TokenFactory = await ethers.getContractFactory("CNU");
    const token = await TokenFactory.deploy(ethers.parseUnits("1000000000000", 18));
    await token.waitForDeployment();
    console.log(`💰 CNU deployed at: ${token.target}`);

    // 1.2. Set Wallet Limit 
    const walletLimitTx = await token.setWalletLimit(ethers.parseUnits("10000000000", 18)); // Ten Billion in 18 decimals
    await walletLimitTx.wait();
    console.log(`🔒 Wallet limit set`);

    // 1.3. Set Transaction Limit 
    const txLimitTx = await token.setTxLimit(ethers.parseUnits("1000000000", 18)); // One Billion in 18 decimals
    await txLimitTx.wait();
    console.log(`🔒 Transaction limit set`);

    // 1.4. Deploy Treasury Vault
    const TreasuryVaultFactory = await ethers.getContractFactory("TreasuryVault");
    const treasuryVault = await TreasuryVaultFactory.deploy(token);
    await treasuryVault.waitForDeployment();
    const setTreasuryTx = await token.setTreasuryVault(treasuryVault);
    await setTreasuryTx.wait();
    console.log(`🏦 TreasuryVault deployed at: ${treasuryVault.target}`);

    // 2. Deploy Charity Vault
    const CharityVaultFactory = await ethers.getContractFactory("CharityVault");
    const charityVault = await CharityVaultFactory.deploy(token);
    await charityVault.waitForDeployment();
    const setCharityTx = await token.setCharityVault(charityVault);
    await setCharityTx.wait();
    console.log(`🏦 CharityVault deployed at: ${charityVault.target}`);

    // 3. Deploy Staking Vault
    const StakingVaultFactory = await ethers.getContractFactory("StakingVault");
    const stakingVault = await StakingVaultFactory.deploy(token);
    await stakingVault.waitForDeployment();
    const setStakingTx = await token.setStakingVault(stakingVault);
    await setStakingTx.wait();
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
    deployed.treasury = treasuryVault.target;
    deployed.feed = feed.target;
    deployed.gate = gate.target;

    const full = JSON.parse(deployedRaw);
    full[hre.network.name] = deployed;
    fs.writeFileSync(deployedPath, JSON.stringify(full, null, 2));
    console.log("✅ Updated deployed.json.");

  })
