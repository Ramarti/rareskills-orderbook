// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract OrderBookExecutor is EIP712, AccessControl {

    using SafeERC20 for ERC20;

    struct Order {
        address from;
        address token1;
        uint256 amount1; 
        address token2;
        uint256 amount2;
        uint64 expiraton;
    }

    bytes32 private constant _ORDER_TYPEHASH =
        keccak256("Order(address from,address token1,uint256 amount1,address token2,address amount2,uint64 expiration)");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    uint256 public constant MAX_TOKENS = 2;
    uint256 public constant MAX_TTL = 30 days;
    uint256 public constant ORDERBOOK_MAX_DEPTH = 10;

    mapping(address => bool) public tokens;

    constructor(address relayer, address[] memory _tokens) EIP712("OrderBookExecutor", "1") {
        require(relayer != address(0), "Zero relayer");
        _grantRole(RELAYER_ROLE, relayer);
        uint256 length = _tokens.length;
        require(length <= MAX_TOKENS, "Too many tokens");
        for(uint256 i; i < length; ) {
            require(_tokens[i] != address(0), "ZeroToken");
            tokens[_tokens[i]] = true;
            unchecked {
                i++;
            }
        }

    }

    function executeOrders(Order calldata _buy, bytes calldata _buySig, Order calldata _sell, bytes calldata _sellSig) external onlyRole(RELAYER_ROLE) {
        // Example matching orders
        // buy 100 token1 for 50 token2
        // sell 100 token1 for 50 token2
        require(block.timestamp <= _buy.expiraton && block.timestamp <= _sell.expiraton, "Expired Order");
        require(_buy.token1 != _buy.token2, "Cannot trade same token");
        require(_buy.token1 == _sell.token1 && _buy.token2 == _sell.token2, "Tokens do not match");
        require(tokens[_buy.token1] && tokens[_buy.token2], "Unsupported token");
        require(_buy.amount1 != 0 && _buy.amount2 != 0, "Zero amount");
        require(_buy.amount1 == _sell.amount1 && _buy.amount2 == _sell.amount2, "Amounts mismatch");
        require(
            _isOrderSigValid(_buy, _buySig),
            "Buy signature does not match"
        );
        require(
            _isOrderSigValid(_sell, _sellSig),
            "Sell signature does not match"
        );
        ERC20(_buy.token1).safeTransferFrom(_buy.from, _sell.from, _buy.amount1);
        ERC20(_buy.token2).safeTransferFrom(_sell.from, _buy.from, _buy.amount2);

    }

    function _isOrderSigValid(Order calldata _order, bytes calldata _signature) private view returns (bool) {
        return SignatureChecker.isValidSignatureNow(
                _order.from,
                _hashTypedDataV4(keccak256(abi.encode(_ORDER_TYPEHASH, _order.from, _order.token1, _order.amount1, _order.token2, _order.amount2, _order.expiraton))),
                _signature
        );
    }
    




}
