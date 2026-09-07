// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPermissionedRegistry} from "@ens/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ens/registry/interfaces/IRegistry.sol";

/// @dev Minimal stand-in for ENSv2's PermissionedRegistry covering only what
///      ServiceRegistrar touches: register / renew / unregister / getStatus /
///      getExpiry, keyed by labelhash, with the same expiry semantics.
contract MockPermissionedRegistry {
    error LabelAlreadyRegistered(string label);
    error CannotReduceExpiry(uint64 oldExpiry, uint64 newExpiry);

    struct Entry {
        address owner;
        address resolver;
        uint256 roleBitmap;
        uint64 expiry;
        bool exists;
    }

    mapping(uint256 => Entry) public entries;
    uint256 public nextTokenId = 1;

    function register(
        string calldata label,
        address owner,
        IRegistry, /* subregistry */
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 tokenId) {
        uint256 id = uint256(keccak256(bytes(label)));
        Entry storage e = entries[id];
        if (e.exists && e.expiry > block.timestamp) revert LabelAlreadyRegistered(label);
        entries[id] = Entry(owner, resolver, roleBitmap, expiry, true);
        tokenId = nextTokenId++;
    }

    function renew(uint256 anyId, uint64 newExpiry) external {
        Entry storage e = entries[anyId];
        if (newExpiry < e.expiry) revert CannotReduceExpiry(e.expiry, newExpiry);
        e.expiry = newExpiry;
    }

    function unregister(uint256 anyId) external {
        delete entries[anyId];
    }

    function getStatus(uint256 anyId) external view returns (IPermissionedRegistry.Status) {
        Entry storage e = entries[anyId];
        if (!e.exists || e.expiry <= block.timestamp) {
            return IPermissionedRegistry.Status.AVAILABLE;
        }
        return IPermissionedRegistry.Status.REGISTERED;
    }

    function getExpiry(uint256 anyId) external view returns (uint64) {
        return entries[anyId].expiry;
    }
}
