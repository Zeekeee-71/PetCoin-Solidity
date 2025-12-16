const addressesFor = require("../lib/addresses");

task("exclude", "Retrieve a balance")
  .addPositionalParam("wallet", "address", process.env.WALLET_ADDRESS)
  .addOptionalPositionalParam("exclude", "true", "true")
  .setAction(async ({wallet, exclude}, hre) => {

    const deployed = addressesFor(hre.network.name);
    exclude = exclude == "true" ? true : false;

    console.info(deployed)

    const token = await ethers.getContractAt("CNU", deployed.token);
  
    await token.excludeFromFees(wallet, exclude);

    console.log(`Wallet ${wallet} excluded from fees: ${exclude}`);

  })
