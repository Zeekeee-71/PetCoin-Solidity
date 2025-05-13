
task("balance", "Retrieve a balance")
  .addPositionalParam("account", "Owner address", process.env.WALLET_ADDRESS)
  .setAction(async (args, hre) => {

    const wallet = args.account;
    const fs = require("fs");
    const path = require("path");
    const network = hre.network.name;
    const deployedPath = path.join(__dirname, "..", "deployed.json");
    const deployedRaw = fs.readFileSync(deployedPath, "utf8");
    const deployed = JSON.parse(deployedRaw)[hre.network.name];

  
    const Token = await ethers.getContractAt("PetCoinAI", deployed.token);
  
    console.info("Balance for: ", wallet)

    // === Token ===
    const [name, symbol] = await Promise.all([
      Token.name(),
      Token.symbol(),
    ]);
    console.log(`💰 Token: ${name} (${symbol})`);
    console.log(`   Your Balance: ${ethers.formatEther(await Token.balanceOf(wallet))} PETAI\n`);
  
  });