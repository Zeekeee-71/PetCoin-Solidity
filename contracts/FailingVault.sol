// SPDX-License-Identifier: Apache-2.0
// For test purposes only
pragma solidity ^0.8.20;

/// @title FailingVault
/// @notice Test-only vault that always reverts on migration.
contract FailingVault {
    function migrateTo(address) external pure {
        revert("Migration transfer failed");
    }

    function isVault() external pure returns (bool) {
        return true;
    }
}
