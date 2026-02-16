// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

interface ISplitBuyNative {
    function payNative(uint256 paymentRef) external payable;
}

/// @notice Test helper that attempts a one-time reentrant call when it receives native coin.
contract ReentrantNativeReceiver {
    ISplitBuyNative public immutable splitBuy;
    bool public attempted;

    constructor(address _splitBuy) {
        splitBuy = ISplitBuyNative(_splitBuy);
    }

    receive() external payable {
        if (!attempted && address(this).balance > 0) {
            attempted = true;
            try splitBuy.payNative{value: 1}(999999) {} catch {}
        }
    }
}

/// @notice Test helper that always rejects native coin transfers.
contract RejectNativeReceiver {
    receive() external payable {
        revert("Rejecting native transfer");
    }
}
