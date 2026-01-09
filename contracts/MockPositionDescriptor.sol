// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface INonfungiblePositionManager {}

/// @dev Test-only descriptor to satisfy NonfungiblePositionManager constructor.
contract MockPositionDescriptor {
    function tokenURI(INonfungiblePositionManager, uint256) external pure returns (string memory) {
        return "mock://position";
    }
}
