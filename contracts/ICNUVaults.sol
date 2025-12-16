// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICNUVaults {
    function stakingVault() external view returns (address);
    function getStakingVaultHistory() external view returns (address[] memory);
    function charityVault() external view returns (address);
    function getCharityVaultHistory() external view returns (address[] memory);
    function treasuryVault() external view returns (address);
    function getTreasuryVaultHistory() external view returns (address[] memory);
}
