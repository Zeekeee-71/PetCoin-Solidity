// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title VaultBase
/// @notice Shared base for CNU vaults with migration support.
abstract contract VaultBase is Ownable, ReentrancyGuard {
    IERC20 public immutable cnuToken;

    modifier onlyToken() {
        require(msg.sender == address(cnuToken), "Unauthorized: not token");
        _;
    }

    constructor(address _cnuToken) Ownable(msg.sender) {
        cnuToken = IERC20(_cnuToken);
    }

    /// @dev Transfers the entire vault balance to a new vault during migrations.
    function _migrateAll(address newVault) internal returns (uint256 amount) {
        require(newVault != address(0), "Invalid vault address");

        amount = cnuToken.balanceOf(address(this));
        require(cnuToken.transfer(newVault, amount), "Migration transfer failed");
    }

    /// @notice Identify this contract as a vault for CNU.
    function isVault() external pure returns (bool) {
        return true;
    }
}
