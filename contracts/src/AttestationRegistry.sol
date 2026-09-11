// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AttestationRegistry
/// @notice On-chain track record for x402 services. Whitelisted probers pay
///         services out-of-band (x402), then attest the outcome here. Each
///         attestation carries a chain-qualified payment reference so every
///         probe is auditable back to a real payment.
contract AttestationRegistry is Ownable {
    struct ServiceStats {
        uint64 probeCount;
        uint64 deliveredCount;
        uint64 honestCount;
        uint64 lastProbedAt;
    }

    mapping(address => bool) public isProber;

    /// @dev keyed by the ENS labelhash of the service subname
    mapping(bytes32 => ServiceStats) private _stats;

    event ProberUpdated(address indexed prober, bool allowed);

    event ProbeResult(
        bytes32 indexed node,
        address indexed prober,
        bool delivered,
        bool honest,
        uint32 latencyMs,
        bytes32 responseHash,
        uint256 amountPaid,
        string paymentRef,
        uint64 timestamp
    );

    error NotProber(address caller);

    modifier onlyProber() {
        if (!isProber[msg.sender]) revert NotProber(msg.sender);
        _;
    }

    constructor(address initialProber) Ownable(msg.sender) {
        if (initialProber != address(0)) {
            isProber[initialProber] = true;
            emit ProberUpdated(initialProber, true);
        }
    }

    function setProber(address prober, bool allowed) external onlyOwner {
        isProber[prober] = allowed;
        emit ProberUpdated(prober, allowed);
    }

    /// @param node ENS labelhash of the service subname
    /// @param delivered whether the service returned a usable response after payment
    /// @param honest whether the response matched the service's claimed spec
    /// @param latencyMs round-trip time of the paid request
    /// @param responseHash keccak256 of the raw response body
    /// @param amountPaid amount paid for the probe, in the service's quoted token
    /// @param paymentRef payment transaction id/hash (chain-qualified when needed)
    function attest(
        bytes32 node,
        bool delivered,
        bool honest,
        uint32 latencyMs,
        bytes32 responseHash,
        uint256 amountPaid,
        string calldata paymentRef
    ) external onlyProber {
        ServiceStats storage s = _stats[node];
        s.probeCount += 1;
        if (delivered) s.deliveredCount += 1;
        if (honest) s.honestCount += 1;
        s.lastProbedAt = uint64(block.timestamp);

        emit ProbeResult(
            node,
            msg.sender,
            delivered,
            honest,
            latencyMs,
            responseHash,
            amountPaid,
            paymentRef,
            uint64(block.timestamp)
        );
    }

    function statsOf(bytes32 node) external view returns (ServiceStats memory) {
        return _stats[node];
    }

    /// @return rate delivery rate in basis points (0 if never probed)
    function deliveryRateBps(bytes32 node) external view returns (uint256 rate) {
        ServiceStats storage s = _stats[node];
        if (s.probeCount == 0) return 0;
        return (uint256(s.deliveredCount) * 10_000) / s.probeCount;
    }
}
