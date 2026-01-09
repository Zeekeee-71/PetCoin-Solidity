require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

// Tasks

require("./tasks/repl");
require("./tasks/deploy-core");
require("./tasks/create-pair");
require("./tasks/deploy-feed");
require("./tasks/add-liquidity");
require("./tasks/remove-liquidity");
require("./tasks/get-liquidity");
require("./tasks/update-feed");
require("./tasks/status");
require("./tasks/balance");
require("./tasks/exclude");
require("./tasks/swap-in");
require("./tasks/swap-out");

console.info("Hardhat config loaded");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  //solidity: "0.8.28",
  solidity: {
    compilers: [
      { version: "0.5.16",
        settings: { optimizer: { enabled: true, runs: 200 } } },
      { version: "0.7.6",
        settings: { optimizer: { enabled: true, runs: 200 } } },
      { version: "0.8.28",
        settings: { optimizer: { enabled: true, runs: 200 } } },
    ]
  },
  networks: {
    hardhat: {
      accounts: {
        count: 20,
        balance: "1000000000000000000000" // 1000 ETH
      }
    },
//    sepolia: {
//      url: process.env.SEPOLIA_RPC_URL,
//      accounts: [
//        process.env.PRIVATE_WALLET_KEY,  // First key, required
//        process.env.PRIVATE_WALLET_KEY2, // Optional second key
//        process.env.PRIVATE_WALLET_KEY3  // Optional third key
//      ],
//    },
  },
};
