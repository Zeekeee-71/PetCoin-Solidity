const { factoryV2ABI, routerV2ABI, pairV2ABI } = require("../lib/uniswap");

task("query-pair", "Show LP token balance and share of PETAI/WETH pool")
  .addPositionalParam("pair", "Pair address", "0x0")
  .setAction(async (args, hre) => {
    const fs = require("fs");
    const path = require("path");
    const { ethers } = hre;

    const [signer] = await ethers.getSigners();
    const deployed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployed.json")))[hre.network.name];

    const pair = await ethers.getContractAt(pairV2ABI, args.pair);
    const lp = await ethers.getContractAt("IERC20", args.pair);

    const [lpBalance, totalSupply, reserves] = await Promise.all([
      lp.balanceOf(signer.address),
      lp.totalSupply(),
      pair.getReserves()
    ]);


    const token0 = await pair.token0();
    const token1 = await pair.token1();

    console.log(`Token0: ${token0}`);
    console.log(`Token1: ${token1}`); 

    const isPetaiToken0 = token0 === deployed.token;

    const reservePetai = isPetaiToken0 ? reserves[0] : reserves[1];
    const reserveWeth  = isPetaiToken0 ? reserves[1] : reserves[0];

    const pct = Number(lpBalance) / Number(totalSupply || 1);

    const sharePetai = Number(reservePetai) * pct;
    const shareWeth  = Number(reserveWeth) * pct;

    console.log(`🔗 LP Token Address: ${args.pair}`);
    console.log(`💼 Your LP Balance: ${ethers.formatUnits(lpBalance, 18)} LP`);
    console.log(`📊 Pool Share: ~${(pct * 100).toFixed(4)}%`);
    console.log(`💰 Claimable:`);
    console.log(`   ~${ethers.formatUnits(BigInt(sharePetai), 18)} PETAI`);
    console.log(`   ~${ethers.formatUnits(BigInt(shareWeth), 18)} WETH`);
  });
