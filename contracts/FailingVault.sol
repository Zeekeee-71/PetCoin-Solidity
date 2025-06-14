// SPDX-License-Identifier: MIT
// For test purposes only
pragma solidity ^0.8.20;

contract FailingVault {
    function migrateTo(address) external pure {
        revert("Migration transfer failed");
    }
}