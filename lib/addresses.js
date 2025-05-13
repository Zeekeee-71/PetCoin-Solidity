
const fs = require("fs");
const path = require("path");

module.exports = function addressesFor(network){
  const deployedPath = path.join(__dirname, "..", "deployed.json");
  const deployedRaw = fs.readFileSync(deployedPath, "utf8");
  const deployed = JSON.parse(deployedRaw);
  return deployed[network];
}