const { factoryV2ABI, routerV2ABI, pairV2ABI } = require("../lib/uniswap");

task("get-liquidity", "Show LP token balance and share of CNU/WETH pool")
  .setAction(async (args, hre) => {
    const fs = require("fs");
    const path = require("path");
    const { ethers } = hre;

    const deployed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployed.json")))[hre.network.name];

    const [signer] = await ethers.getSigners();
    const factory = await ethers.getContractAt(factoryV2ABI, deployed.UniswapV2Factory);
    const token = await ethers.getContractAt("CNU", deployed.token);
    const weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", deployed.weth);

    const pairAddress = await factory.getPair(deployed.token, deployed.weth);

    if (pairAddress === ethers.ZeroAddress) {
      console.error("❌ No pair found for CNU/WETH.");
      return;
    }

    const pair = await ethers.getContractAt(pairV2ABI, pairAddress);
    const lp = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", pairAddress);

    const [lpBalance, totalSupply, reserves] = await Promise.all([
      lp.balanceOf(signer.address),
      lp.totalSupply(),
      pair.getReserves()
    ]);


    const token0 = await pair.token0();
    const token1 = await pair.token1();

    const isCnuToken0 = token0 === deployed.token;

    const reserveCnu = isCnuToken0 ? reserves[0] : reserves[1];
    const reserveWeth  = isCnuToken0 ? reserves[1] : reserves[0];

    const pct = Number(lpBalance) / Number(totalSupply || 1);

    const shareCnu = Math.floor(Number(reserveCnu) * pct);
    const shareWeth  = Math.floor(Number(reserveWeth) * pct);

    console.log(`🔗 LP Token Address: ${pairAddress}`);
    console.log(`💼 Your LP Balance: ${ethers.formatUnits(lpBalance, 18)} LP`);
    console.log(`📊 Pool Share: ~${(pct * 100).toFixed(4)}%`);
    console.log(`💰 Claimable:`);
    console.log(`   ~${ethers.formatUnits(BigInt(shareCnu), 18)} CNU`);
    console.log(`   ~${ethers.formatUnits(BigInt(shareWeth), 18)} WETH`);
    console.log(`   ~${shareCnu/shareWeth} CNU/WETH`);
  });
