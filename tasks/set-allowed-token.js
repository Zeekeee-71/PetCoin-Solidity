const addressesFor = require("../lib/addresses");

task("set-allowed-token", "Enable or disable an allowed payment token on SplitBuy")
  .addPositionalParam("token", "Token address (use zero address for native coin)")
  .addOptionalPositionalParam("allowed", "true|false", "true")
  .addOptionalParam("splitbuy", "SplitBuy contract address override", "")
  .setAction(async ({ token, allowed, splitbuy }, hre) => {
    const { ethers } = hre;
    const network = hre.network.name;
    const deployed = addressesFor(network) || {};

    const splitBuyAddress = splitbuy || deployed.splitbuy || "";
    if (!splitBuyAddress || !ethers.isAddress(splitBuyAddress)) {
      throw new Error(
        `SplitBuy address missing/invalid for network "${network}". ` +
          `Pass --splitbuy <address> or set deployed.json.${network}.splitbuy`
      );
    }

    if (!ethers.isAddress(token)) {
      throw new Error(`Invalid token address: "${token}"`);
    }

    const allowedRaw = String(allowed).toLowerCase();
    if (allowedRaw !== "true" && allowedRaw !== "false") {
      throw new Error(`Invalid allowed value: "${allowed}". Use true or false.`);
    }
    const allowedBool = allowedRaw === "true";

    const [signer] = await ethers.getSigners();
    const splitBuy = await ethers.getContractAt("SplitBuy", splitBuyAddress);

    const tokenLabel = token === ethers.ZeroAddress ? "native coin (zero address)" : token;
    console.log(`📡 Network: ${network}`);
    console.log(`👤 Signer: ${signer.address}`);
    console.log(`💸 SplitBuy: ${splitBuyAddress}`);
    console.log(`🪙 Token: ${tokenLabel}`);
    console.log(`⚙️ Setting allowed = ${allowedBool}`);

    const tx = await splitBuy.connect(signer).setAllowedToken(token, allowedBool);
    await tx.wait();

    const isAllowed = await splitBuy.isAllowedToken(token);
    console.log(`✅ Tx: ${tx.hash}`);
    console.log(`✅ On-chain isAllowedToken(${token}) = ${isAllowed}`);
  });
