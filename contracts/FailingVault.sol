// SPDX-License-Identifier: MIT
// For test purposes only
pragma solidity ^0.8.20;

contract FailingVault {
    function migrateTo(address) external pure {
        revert("vault boom");
    }

    function authorizeStakingVault(address) external pure {
        // no-op
    }
}