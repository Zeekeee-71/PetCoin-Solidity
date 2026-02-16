const fs = require("fs");
const path = require("path");

const addressesFor = require("../lib/addresses");

task("deploy-splitbuy", "Deploy SplitBuy payment splitter")
  .addOptionalParam("dev", "Dev wallet recipient", "")
  .addOptionalParam("holdings", "Holdings wallet recipient", "")
  .addOptionalParam("weth", "Wrapped native token address", "")
  .addOptionalParam("dai", "DAI token address", "")
  .addOptionalParam("gno", "GNO token address", "")
  .setAction(async ({ dev, holdings, weth, dai, gno }, hre) => {
    const { ethers } = hre;
    const network = hre.network.name;

    const deployedPath = path.join(__dirname, "..", "deployed.json");
    const deployedRaw = fs.readFileSync(deployedPath, "utf8");
    const allNetworks = JSON.parse(deployedRaw);
    const deployed = addressesFor(network) || {};

    const [signer] = await ethers.getSigners();

    const defaultWrappedByNetwork = {
      mainnet: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
      gnosis: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d", // WXDAI
      chiado: "0x18c8a7ec7897177E4529065a7E7B0878358B3BfF", // WXDAI (Chiado)
    };
    const defaultDaiByNetwork = {
      mainnet: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    };
    const defaultGnoByNetwork = {
      gnosis: "0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb",
    };

    const devWallet = dev || signer.address;
    const holdingsWallet = holdings || deployed.treasury || signer.address;
    const wrappedNative = weth || deployed.weth || defaultWrappedByNetwork[network] || "";
    const daiToken = dai || deployed.dai || defaultDaiByNetwork[network] || "";
    const gnoToken = gno || deployed.gno || defaultGnoByNetwork[network] || "";

    const isUsableAddress = (value) =>
      !!value && value !== ethers.ZeroAddress && ethers.isAddress(value);
    const isGnosisFamily = network === "gnosis" || network === "chiado";

    const allowSet = new Set([ethers.ZeroAddress]);

    if (network === "mainnet") {
      if (!isUsableAddress(wrappedNative)) {
        throw new Error("Mainnet deploy requires WETH address");
      }
      if (!isUsableAddress(daiToken)) {
        throw new Error("Mainnet deploy requires DAI address");
      }
      allowSet.add(wrappedNative);
      allowSet.add(daiToken);
    } else if (isGnosisFamily) {
      if (!isUsableAddress(wrappedNative)) {
        throw new Error("Gnosis/Chiado deploy requires WXDAI address");
      }
      if (!isUsableAddress(gnoToken)) {
        throw new Error("Gnosis/Chiado deploy requires GNO address");
      }
      allowSet.add(wrappedNative);
      allowSet.add(gnoToken);
      if (isUsableAddress(daiToken)) {
        console.log("ℹ️ Ignoring DAI on gnosis/chiado: allowlist is native + WXDAI + GNO only.");
      }
    } else {
      if (isUsableAddress(wrappedNative)) {
        allowSet.add(wrappedNative);
      }
      if (isUsableAddress(daiToken)) {
        allowSet.add(daiToken);
      }
      if (isUsableAddress(gnoToken)) {
        allowSet.add(gnoToken);
      }
    }
    const allowedTokens = [...allowSet];

    console.log(`Deploying SplitBuy to ${network}`);
    console.log(`🚀 Deployer: ${signer.address}`);
    console.log(`🧾 Dev recipient: ${devWallet}`);
    console.log(`🏦 Holdings recipient: ${holdingsWallet}`);
    console.log(`🪙 Allowed tokens: ${allowedTokens.join(", ")}`);

    const SplitBuyFactory = await ethers.getContractFactory("SplitBuy");
    const splitBuy = await SplitBuyFactory.deploy(devWallet, holdingsWallet, allowedTokens);
    await splitBuy.waitForDeployment();

    console.log(`💸 SplitBuy deployed at: ${splitBuy.target}`);

    if (!allNetworks[network]) {
      allNetworks[network] = {};
    }

    allNetworks[network].splitbuy = splitBuy.target;
    fs.writeFileSync(deployedPath, JSON.stringify(allNetworks, null, 2));
    console.log("✅ Updated deployed.json.");

    if (!isGnosisFamily && !daiToken) {
      console.log("ℹ️ DAI was not set. Pass a DAI address to include it in the allowlist at deploy time.");
    }
  });
