// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SplitBuy
/// @notice Accepts native/ERC20 payments and splits each payment 20% to development and 80% to holdings.
contract SplitBuy is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant DEV_SHARE_BPS = 2_000; // 20%

    address public devWallet;
    address public holdingsWallet;

    // token => allowed
    // address(0) represents native coin (ETH on Ethereum, xDAI on Gnosis).
    mapping(address => bool) public isAllowedToken;

    event PaymentReceived(
        uint256 indexed paymentRef,
        address indexed payer,
        address indexed token,
        uint256 grossAmount,
        uint256 devAmount,
        uint256 holdingsAmount,
        address devWallet,
        address holdingsWallet
    );
    event AllowedTokenUpdated(address indexed token, bool allowed);
    event RecipientsUpdated(address indexed devWallet, address indexed holdingsWallet);

    constructor(address _devWallet, address _holdingsWallet, address[] memory allowedTokens) Ownable(msg.sender) {
        _setRecipients(_devWallet, _holdingsWallet);

        for (uint256 i = 0; i < allowedTokens.length; i++) {
            isAllowedToken[allowedTokens[i]] = true;
            emit AllowedTokenUpdated(allowedTokens[i], true);
        }
    }

    /**
     * @notice Update destination wallets for split payments.
     */
    function setRecipients(address _devWallet, address _holdingsWallet) external onlyOwner {
        _setRecipients(_devWallet, _holdingsWallet);
    }

    /**
     * @notice Enable or disable an allowed payment token.
     * @dev Use address(0) to configure native coin acceptance.
     */
    function setAllowedToken(address token, bool allowed) external onlyOwner {
        isAllowedToken[token] = allowed;
        emit AllowedTokenUpdated(token, allowed);
    }

    /**
     * @notice Accept native payment and split to recipients.
     * @param paymentRef Off-chain reference id to correlate payment intent.
     */
    function payNative(uint256 paymentRef) external payable nonReentrant {
        require(isAllowedToken[address(0)], "Native payment disabled");
        require(msg.value > 0, "Amount must be > 0");

        (uint256 devAmount, uint256 holdingsAmount) = previewSplit(msg.value);

        (bool devSuccess, ) = devWallet.call{value: devAmount}("");
        require(devSuccess, "Dev transfer failed");

        (bool holdingsSuccess, ) = holdingsWallet.call{value: holdingsAmount}("");
        require(holdingsSuccess, "Holdings transfer failed");

        emit PaymentReceived(
            paymentRef,
            msg.sender,
            address(0),
            msg.value,
            devAmount,
            holdingsAmount,
            devWallet,
            holdingsWallet
        );
    }

    /**
     * @notice Accept ERC20 payment and split to recipients.
     * @param paymentRef Off-chain reference id to correlate payment intent.
     * @param token ERC20 token address.
     * @param amount Amount of tokens to pay.
     */
    function payToken(uint256 paymentRef, address token, uint256 amount) external nonReentrant {
        require(token != address(0), "Use payNative for native");
        require(isAllowedToken[token], "Token not allowed");
        require(amount > 0, "Amount must be > 0");

        IERC20 paymentToken = IERC20(token);
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);

        (uint256 devAmount, uint256 holdingsAmount) = previewSplit(amount);

        paymentToken.safeTransfer(devWallet, devAmount);
        paymentToken.safeTransfer(holdingsWallet, holdingsAmount);

        emit PaymentReceived(
            paymentRef,
            msg.sender,
            token,
            amount,
            devAmount,
            holdingsAmount,
            devWallet,
            holdingsWallet
        );
    }

    /**
     * @notice Preview split results for an amount.
     * @dev Rounds in favor of holdings wallet so no dust is lost.
     */
    function previewSplit(uint256 grossAmount) public pure returns (uint256 devAmount, uint256 holdingsAmount) {
        devAmount = (grossAmount * DEV_SHARE_BPS) / BPS_DENOMINATOR;
        holdingsAmount = grossAmount - devAmount;
    }

    receive() external payable {
        revert("Use payNative");
    }

    function _setRecipients(address _devWallet, address _holdingsWallet) internal {
        require(_devWallet != address(0), "Invalid dev wallet");
        require(_holdingsWallet != address(0), "Invalid holdings wallet");

        devWallet = _devWallet;
        holdingsWallet = _holdingsWallet;
        emit RecipientsUpdated(_devWallet, _holdingsWallet);
    }
}
