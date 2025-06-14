// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPetCoinVaults {
    function stakingVault() external view returns (address);
    function charityVault() external view returns (address);
}