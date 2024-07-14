// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ISettlementContract, CrossChainOrder, ResolvedCrossChainOrder, Input, Output} from "./interfaces/IERC7683.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { OApp, MessagingFee, Origin } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import { MessagingReceipt } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppSender.sol";
import { OptionsBuilder } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";


contract SettlementContract is
    ISettlementContract,
    Context,
    Ownable,
    ReentrancyGuard,
    OApp
{
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using Address for address;
    using OptionsBuilder for bytes;

    ///
    /// Constructor
    ///

    uint256 immutable public chainId;

    constructor(address endpoint, address delegate, uint256 _chainId) OApp(endpoint, delegate) Ownable(delegate) {
        chainId = _chainId;
    }

    ///
    /// Order Hashing
    ///

    function computeOrderHash(CrossChainOrder calldata order) external pure returns (bytes32) {
        return _hashOrder(order);
    }

    function verifySignature(CrossChainOrder calldata order, bytes calldata signature) external view returns (bool) {
        return _verifySignature(order, signature);
    }

    function _hashOrder(CrossChainOrder memory order) internal pure returns (bytes32) {
        return keccak256(abi.encode(order));
    }

    function _verifySignature(CrossChainOrder memory order, bytes memory signature) internal view returns (bool) {
        return _hashOrder(order)
        .toEthSignedMessageHash()
        .recover(signature) == _msgSender();
    }

    ///
    /// Whitelisted Settlement Contracts
    ///

    mapping(address => bool) internal _isSettlementSupported;
    mapping(uint => uint32) internal _chainIdToEid;

    function whitelistSettlementContract(address settlementContract, uint _chainId, uint32 eid) external onlyOwner {
        _isSettlementSupported[settlementContract] = true;
        _chainIdToEid[_chainId]= eid;
    }

    ///
    /// Message Structs
    ///

    enum MessageType {
        AddOrder,
        DeleteOrder,
        MatchOrder,
        ResolveOrder
    }

    struct Message {
        MessageType Type;
        bytes payload;
    }

    function _generateOptions() internal pure returns (bytes memory) {
        return OptionsBuilder.newOptions().addExecutorLzReceiveOption(500_000, 0);
    }

    ///
    /// Order Registration
    ///

    mapping(bytes32 => CrossChainOrder) internal _orders;
    mapping(bytes32 => uint256) internal _destChains;
    mapping(address => uint256) internal _nonceOf;

    event OrderCreated(bytes32 indexed orderHash, CrossChainOrder order);
    event OrderDeleted(bytes32 indexed orderHash);

    // override the strict equality check
    function _payNative(uint256 _nativeFee) internal override returns (uint256 nativeFee) {
        if (msg.value < _nativeFee) revert NotEnoughNative(msg.value);
        return _nativeFee;
    }

    function _broadcastOrder(CrossChainOrder calldata order, uint256 destChainId, uint256 messageFee) internal {
        // broadcast the order to the destination chain
        _lzSend(
            _chainIdToEid[destChainId],
            abi.encode(
                Message(
                    MessageType.AddOrder,
                    abi.encode(order)
                )
            ),
            _generateOptions(),
            MessagingFee(messageFee, 0),
            payable(msg.sender)
        );
    }

    function _broadcastOrderDelete(bytes32 hash, uint256 destChainId, uint256 messageFee) internal {
        // broadcast the order to the destination chain
        _lzSend(
            _chainIdToEid[destChainId],
            abi.encode(
                Message(
                    MessageType.DeleteOrder,
                    abi.encode(hash)
                )
            ),
            _generateOptions(),
            MessagingFee(messageFee, 0),
            payable(msg.sender)
        );
    }

    function _initiateLzOrder(CrossChainOrder memory order) internal {
        bytes32 orderHash = _hashOrder(order);
        _orders[orderHash] = order;
        _destChains[orderHash] = chainId;
        emit OrderCreated(orderHash, order);
    }

    function _deleteLzOrder(bytes32 hash) internal {
        delete _orders[hash];
        delete _destChains[hash];
        delete _matchTimestamps[hash];
        emit OrderDeleted(hash);
    }

    function initiate(CrossChainOrder calldata order, bytes calldata signature, bytes calldata fillerData) external payable nonReentrant {
        // validate the order
        require(_verifySignature(order, signature), "invalid signature");
        require(_isSettlementSupported[order.settlementContract], "settlement not supported");
        require(order.fillDeadline > block.timestamp, "invalid fillDeadline");
        require(order.initiateDeadline > block.timestamp, "invalid initiateDeadline");
        require(order.nonce == _nonceOf[_msgSender()], "invalid nonce");
        require(order.originChainId == chainId, "invalid originChainId");
        require(order.swapper == _msgSender(), "invalid swapper");

        // validate the input amount
        (uint256 inputAmount) = abi.decode(order.orderData, (uint256));
        require(inputAmount > 0, "insufficient input amount");

        // validate the destination chain
        (uint256 destChainId, uint256 messageFee) = abi.decode(fillerData, (uint256, uint256));
        require(destChainId != chainId, "dest chain id must be different");

        // validate msg.value
        require(msg.value == inputAmount + messageFee, "insufficient msg.value");
        require(messageFee > 0, "insufficient message fee");

        // initiate the order
        bytes32 orderHash = _hashOrder(order);
        _orders[orderHash] = order;
        _destChains[orderHash] = destChainId;

        // increase the nonce
        _nonceOf[_msgSender()] += 1;

        // broadcast the order
        _broadcastOrder(order, destChainId, messageFee);
        emit OrderCreated(orderHash, order);
    }

    function deleteOrder(bytes32 hash, uint256 messageFee) external nonReentrant {
        // validate the existence of order
        CrossChainOrder memory order = _orders[hash];
        require(order.swapper == _msgSender(), "invalid swapper");
        require(order.originChainId == chainId, "invalid origin chain");
        require(_matchedOrders[hash] == bytes32(0), "order is matched");
        require(messageFee > 0, "insufficient message fee");

        // refund the input amount
        (uint256 inputAmount) = abi.decode(order.orderData, (uint256));
        payable(order.swapper).transfer(inputAmount);

        // delete the order
        uint256 destChainId = _destChains[hash];
        delete _orders[hash];
        delete _destChains[hash];
        delete _matchedOrders[hash];
        delete _matchTimestamps[hash];

        // broadcast the order deletion
        _broadcastOrderDelete(hash, destChainId, messageFee);
        emit OrderDeleted(hash);
    }

    function nonceOf(address user) external view returns (uint256) {
        return _nonceOf[user];
    }

    ///
    /// Order Matching
    ///

    mapping(bytes32 => uint256) internal _matchTimestamps;
    mapping(bytes32 => bytes32) internal _matchedOrders;

    event OrdersMatched(bytes32 indexed orderHashA, bytes32 indexed orderHashB, uint256 timestamp);
    event MatchDestroyed(bytes32 indexed orderHashA, bytes32 indexed orderHashB);

    function _broadcastMatch(bytes32 orderHashA, bytes32 orderHashB, uint256 matchTimestamp, uint256 destChainId, uint256 messageFee) internal {
        // broadcast match to the destination chain
        _lzSend(
            _chainIdToEid[destChainId],
            abi.encode(
                Message(
                    MessageType.MatchOrder,
                    abi.encode(orderHashA, orderHashB, matchTimestamp)
                )
            ),
            _generateOptions(),
            MessagingFee(messageFee, 0),
            payable(msg.sender)
        );
    }

    function _broadcastUnmatch(bytes32 orderHashA, bytes32 orderHashB) internal {
        // todo: Implement LayerZero sending logic
    }

    function _matchOrdersLz(bytes32 orderHashA, bytes32 orderHashB, uint256 matchTimestamp) internal {
        _matchTimestamps[orderHashA] = matchTimestamp;
        _matchTimestamps[orderHashB] = matchTimestamp;
        _matchedOrders[orderHashA] = orderHashB;
        _matchedOrders[orderHashB] = orderHashA;
        emit OrdersMatched(orderHashA, orderHashB, matchTimestamp);
    }

    function _unmatchOrdersLz(bytes32 orderHashA, bytes32 orderHashB) internal {
        delete _matchTimestamps[orderHashA];
        delete _matchTimestamps[orderHashB];
        delete _matchedOrders[orderHashA];
        delete _matchedOrders[orderHashB];
        emit MatchDestroyed(orderHashA, orderHashB);
    }

    function matchOrders(bytes32 orderHashA, bytes32 orderHashB, uint256 messageFee) external payable {
        // validate the existence of orders
        CrossChainOrder memory orderA = _orders[orderHashA];
        require(orderA.swapper != address(0), "order A doesn't exist");
        CrossChainOrder memory orderB = _orders[orderHashB];
        require(orderB.swapper != address(0), "order B doesn't exist");

        // validate the orders are not already matched
        require(_matchedOrders[orderHashA] == bytes32(0), "order A already matched");
        require(_matchedOrders[orderHashB] == bytes32(0), "order B already matched");

        // validate the orders are not expired
        require(orderA.fillDeadline > block.timestamp, "invalid fillDeadline A");
        require(orderB.fillDeadline > block.timestamp, "invalid fillDeadline B");
        require(orderA.initiateDeadline > block.timestamp, "invalid initiateDeadline A");
        require(orderB.initiateDeadline > block.timestamp, "invalid initiateDeadline B");

        // validate msg.value
        require(msg.value == messageFee, "insufficient message fee");

        // validate the input amounts are compatible
        (uint256 inputAmountA) = abi.decode(orderA.orderData, (uint256));
        (uint256 inputAmountB) = abi.decode(orderB.orderData, (uint256));
        require(inputAmountA == inputAmountB, "input amounts mismatch");

        // validate the destination chains are compatible
        require(
            _destChains[orderHashA] == orderB.originChainId &&
            _destChains[orderHashB] == orderA.originChainId,
            "destination chains mismatch"
        );

        // match the orders
        uint256 matchTimestamp = block.timestamp;
        _matchTimestamps[orderHashA] = matchTimestamp;
        _matchTimestamps[orderHashB] = matchTimestamp;
        _matchedOrders[orderHashA] = orderHashB;
        _matchedOrders[orderHashB] = orderHashA;

        // broadcast the match
        _broadcastMatch(orderHashA, orderHashB, matchTimestamp, orderB.originChainId, messageFee);
        emit OrdersMatched(orderHashA, orderHashB, matchTimestamp);
    }

    function destroyExpiredMatch(bytes32 orderHash) external {
        // validate the existence of the match
        bytes32 matchedOrderHash = _matchedOrders[orderHash];
        require(matchedOrderHash != bytes32(0), "order not matched");

        // validate the match is expired
        uint256 matchTimestamp = _matchTimestamps[orderHash];
        require(block.timestamp > matchTimestamp + 5 minutes, "match not expired");

        // unmatch the orders
        delete _matchTimestamps[orderHash];
        delete _matchTimestamps[matchedOrderHash];
        delete _matchedOrders[orderHash];
        delete _matchedOrders[matchedOrderHash];

        // broadcast the unmatch
        _broadcastUnmatch(orderHash, matchedOrderHash);
        emit MatchDestroyed(orderHash, matchedOrderHash);
    }

    ///
    /// Order Resolving
    ///

    event OrderResolved(bytes32 indexed orderHash, bytes32 indexed matchedOrderHash, ResolvedCrossChainOrder resolvedOrder);

    function _broadcastResolve(CrossChainOrder memory orderA, CrossChainOrder memory orderB, uint256 destChainId, uint256 messageFee) internal {
        // broadcast resolve to the destination chain
        _lzSend(
            _chainIdToEid[destChainId],
            abi.encode(
                Message(
                    MessageType.ResolveOrder,
                    abi.encode(orderB, orderA)
                )
            ),
            _generateOptions(),
            MessagingFee(messageFee, 0),
            payable(msg.sender)
        );
    }

    function _receiveLzResolve(CrossChainOrder memory orderA, CrossChainOrder memory orderB) internal {
        require(_orders[_hashOrder(orderA)].swapper != address(0), "order A does not exist");
        require(_orders[_hashOrder(orderB)].swapper != address(0), "order B does not exist");
        require(orderA.originChainId == chainId, "invalid origin chain id");

        // transfer the input amount to transfer matcher orders swapper
        (uint256 inputAmount) = abi.decode(orderA.orderData, (uint256));
        payable(orderB.swapper).transfer(inputAmount);

        // create the resolve struct
        Output[] memory fillerOutputs = new Output[](1);
        fillerOutputs[0] = Output({
            token: address(0),
            amount: inputAmount,
            recipient: orderB.swapper,
            chainId: uint32(chainId)
        });
        Output[] memory swapperOutputs = new Output[](1);
        swapperOutputs[0] = Output({
            token: address(0),
            amount: inputAmount,
            recipient: orderA.swapper,
            chainId: orderA.originChainId
        });
        Input[] memory swapperInputs = new Input[](1);
        swapperInputs[0] = Input({
            token: address(0),
            amount: inputAmount
        });
        ResolvedCrossChainOrder memory resolvedOrder = ResolvedCrossChainOrder({
            settlementContract: address(this),
            swapper: orderA.swapper,
            nonce: orderA.nonce,
            originChainId: orderA.originChainId,
            initiateDeadline: orderA.initiateDeadline,
            fillDeadline: orderA.fillDeadline,
            swapperInputs: swapperInputs,
            swapperOutputs: swapperOutputs,
            fillerOutputs: fillerOutputs
        });
        emit OrderResolved(_hashOrder(orderA), _hashOrder(orderB), resolvedOrder);
    }

    function resolve(CrossChainOrder calldata order, bytes calldata fillData) external payable
        nonReentrant returns (ResolvedCrossChainOrder memory resolvedOrder)
    {
        // validate the orders does exist and matched
        bytes32 orderHash = _hashOrder(order);
        require(_orders[orderHash].swapper != address(0), "order not found");
        CrossChainOrder memory matchedOrder = _orders[_matchedOrders[orderHash]];
        require(matchedOrder.swapper != address(0), "order not matched");

        // validate that the order exist in this chain
        require(order.originChainId == chainId, "invalid origin chain");

        // transfer the input amount to the matched order's swapper
        (uint256 inputAmount) = abi.decode(order.orderData, (uint256));
        payable(matchedOrder.swapper).transfer(inputAmount);

        // broadcast the resolve to do the same at other chain.
        (uint256 messageFee) = abi.decode(fillData, (uint256));
        require(messageFee > 0, "insufficient message fee");
        _broadcastResolve(order, matchedOrder, _destChains[orderHash], messageFee);

        // create the resolve struct
        Input[] memory swapperInputs = new Input[](1);
        swapperInputs[0] = Input({
            token: address(0),
            amount: inputAmount
        });
        Output[] memory fillerOutputs = new Output[](1);
        fillerOutputs[0] = Output({
            token: address(0),
            amount: inputAmount,
            recipient: matchedOrder.swapper,
            chainId: uint32(chainId)
        });
        Output[] memory swapperOutputs = new Output[](1);
        swapperOutputs[0] = Output({
            token: address(0),
            amount: inputAmount,
            recipient: order.swapper,
            chainId: matchedOrder.originChainId
        });
        resolvedOrder = ResolvedCrossChainOrder({
            settlementContract: address(this),
            swapper: order.swapper,
            nonce: order.nonce,
            originChainId: order.originChainId,
            initiateDeadline: order.initiateDeadline,
            fillDeadline: order.fillDeadline,
            swapperInputs: swapperInputs,
            swapperOutputs: swapperOutputs,
            fillerOutputs: fillerOutputs
        });
        emit OrderResolved(orderHash, _hashOrder(matchedOrder), resolvedOrder);
    }

    ///
    /// LayerZero Quote
    ///

    function quoteInitialize(CrossChainOrder calldata order, uint32 dstEid) external view returns (MessagingFee memory) {
        return _quote(
            dstEid,
            abi.encode(
                Message(
                    MessageType.AddOrder,
                    abi.encode(order)
                )
            ),
            _generateOptions(),
            false
        );
    }

    function quoteDeleteOrder(bytes32 orderHash) external view returns (MessagingFee memory) {
        require(_orders[orderHash].originChainId == chainId, "order does not exist");
        return _quote(
            _chainIdToEid[_destChains[orderHash]],
            abi.encode(
                Message(
                    MessageType.DeleteOrder,
                    abi.encode(orderHash)
                )
            ),
            _generateOptions(),
            false
        );
    }

    function quoteMatch(bytes32 orderHashA, bytes32 orderHashB) external view returns (MessagingFee memory) {
        require(_orders[orderHashA].swapper != address(0), "order A does not exist");
        require(_orders[orderHashB].swapper != address(0), "order B does not exist");
        return _quote(
            _chainIdToEid[_destChains[
                _destChains[orderHashA] == chainId ? orderHashB : orderHashA
            ]],
            abi.encode(
                Message(
                    MessageType.MatchOrder,
                    abi.encode(orderHashA, orderHashB, block.timestamp)
                )
            ),
            _generateOptions(),
            false
        );
    }

    function quoteResolve(bytes32 orderHashA, bytes32 orderHashB) external view returns (MessagingFee memory) {
        CrossChainOrder memory orderA = _orders[orderHashA];
        CrossChainOrder memory orderB = _orders[orderHashB];
        require(orderA.swapper != address(0), "order A does not exist");
        require(orderB.swapper != address(0), "order B does not exist");
        return _quote(
            _chainIdToEid[_destChains[
                orderA.originChainId == chainId ? orderHashA : orderHashB
            ]],
            abi.encode(
                Message(
                    MessageType.ResolveOrder,
                    abi.encode(orderB, orderA)
                )
            ),
            _generateOptions(),
            false
        );
    }

    ///
    /// LayerZero Receive
    ///

    function _lzReceive(
        Origin calldata /*_origin*/,
        bytes32 /*_guid*/,
        bytes calldata payload,
        address /*_executor*/,
        bytes calldata /*_extraData*/
    ) internal override {
        // decode the message
        Message memory message = abi.decode(payload, (Message));

        if (message.Type == MessageType.AddOrder) {
            CrossChainOrder memory order = abi.decode(message.payload, (CrossChainOrder));
            _initiateLzOrder(order);
        } else if (message.Type == MessageType.DeleteOrder) {
            bytes32 orderHash = abi.decode(message.payload, (bytes32));
            _deleteLzOrder(orderHash);
        } else if (message.Type == MessageType.MatchOrder) {
            (bytes32 orderHashA, bytes32 orderHashB, uint256 matchTimestamp) = abi.decode(message.payload, (bytes32, bytes32, uint256));
            _matchOrdersLz(orderHashA, orderHashB, matchTimestamp);
        } else if (message.Type == MessageType.ResolveOrder) {
            (CrossChainOrder memory orderA, CrossChainOrder memory orderB) = abi.decode(message.payload, (CrossChainOrder, CrossChainOrder));
            _receiveLzResolve(orderA, orderB);
        } else {
            revert("invalid message type");
        }
    }
}