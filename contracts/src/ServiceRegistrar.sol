// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IPermissionedRegistry} from "@ens/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ens/registry/interfaces/IRegistry.sol";
import {RegistryRolesLib} from "@ens/registry/libraries/RegistryRolesLib.sol";

/// @title ServiceRegistrar
/// @notice Subname registrar for agentindex.eth on ENSv2, adapted from the ENS
///         contract-developer tutorial. x402 services register a subname whose
///         resolver text records hold their manifest (endpoint, price, spec).
///         Names expire, and the registrar owner can delist (revoke) a name —
///         e.g. a service caught defrauding probers.
/// @dev The registrar must hold ROLE_REGISTRAR, ROLE_RENEW and ROLE_UNREGISTER
///      on the registry's root resource (grantRootRoles by the registry admin).
contract ServiceRegistrar is Ownable {
    using SafeERC20 for IERC20;

    /// @dev roles granted to the subname owner. Deliberately excludes
    ///      ROLE_UNREGISTER — delisting stays with the registrar.
    uint256 internal constant SERVICE_OWNER_ROLES = RegistryRolesLib.ROLE_SET_RESOLVER
        | RegistryRolesLib.ROLE_SET_RESOLVER_ADMIN | RegistryRolesLib.ROLE_SET_SUBREGISTRY
        | RegistryRolesLib.ROLE_CAN_TRANSFER_ADMIN;

    IPermissionedRegistry public immutable registry;
    IERC20 public immutable feeToken;
    address public immutable beneficiary;

    uint256 public pricePerYear;
    uint64 public minDuration;
    uint64 public maxDuration;

    event ServiceRegistered(
        bytes32 indexed labelhash, string label, address indexed owner, uint64 expiry, uint256 price
    );
    event ServiceRenewed(bytes32 indexed labelhash, string label, uint64 newExpiry, uint256 price);
    event ServiceDelisted(bytes32 indexed labelhash, string label, string reason);
    event PricingUpdated(uint256 pricePerYear, uint64 minDuration, uint64 maxDuration);

    error LabelNotAvailable(string label);
    error DurationOutOfRange(uint64 duration, uint64 min, uint64 max);
    error EmptyLabel();

    constructor(
        IPermissionedRegistry _registry,
        IERC20 _feeToken,
        address _beneficiary,
        uint256 _pricePerYear,
        uint64 _minDuration,
        uint64 _maxDuration
    ) Ownable(msg.sender) {
        registry = _registry;
        feeToken = _feeToken;
        beneficiary = _beneficiary;
        pricePerYear = _pricePerYear;
        minDuration = _minDuration;
        maxDuration = _maxDuration;
    }

    function available(string calldata label) public view returns (bool) {
        return registry.getStatus(uint256(keccak256(bytes(label))))
            == IPermissionedRegistry.Status.AVAILABLE;
    }

    /// @notice Flat fee, pro-rated by duration.
    function quote(uint64 duration) public view returns (uint256) {
        return (pricePerYear * duration) / 365 days;
    }

    function register(string calldata label, address owner, address resolver, uint64 duration)
        external
        returns (uint256 tokenId)
    {
        if (bytes(label).length == 0) revert EmptyLabel();
        if (duration < minDuration || duration > maxDuration) {
            revert DurationOutOfRange(duration, minDuration, maxDuration);
        }
        if (!available(label)) revert LabelNotAvailable(label);

        uint256 price = _collect(duration);
        uint64 expiry = uint64(block.timestamp) + duration;

        tokenId = registry.register(
            label, owner, IRegistry(address(0)), resolver, SERVICE_OWNER_ROLES, expiry
        );

        emit ServiceRegistered(keccak256(bytes(label)), label, owner, expiry, price);
    }

    function renew(string calldata label, uint64 duration) external {
        if (duration < minDuration || duration > maxDuration) {
            revert DurationOutOfRange(duration, minDuration, maxDuration);
        }
        bytes32 labelhash = keccak256(bytes(label));

        uint256 price = _collect(duration);
        uint64 current = registry.getExpiry(uint256(labelhash));
        uint64 newExpiry = current + duration;

        registry.renew(uint256(labelhash), newExpiry);

        emit ServiceRenewed(labelhash, label, newExpiry, price);
    }

    /// @notice Revoke a service's name. Used when the prober record shows a
    ///         service is defrauding buyers (e.g. taking payment, returning junk).
    function delist(string calldata label, string calldata reason) external onlyOwner {
        bytes32 labelhash = keccak256(bytes(label));
        registry.unregister(uint256(labelhash));
        emit ServiceDelisted(labelhash, label, reason);
    }

    function setPricing(uint256 _pricePerYear, uint64 _minDuration, uint64 _maxDuration)
        external
        onlyOwner
    {
        pricePerYear = _pricePerYear;
        minDuration = _minDuration;
        maxDuration = _maxDuration;
        emit PricingUpdated(_pricePerYear, _minDuration, _maxDuration);
    }

    function _collect(uint64 duration) internal returns (uint256 price) {
        price = quote(duration);
        if (price > 0) {
            feeToken.safeTransferFrom(msg.sender, beneficiary, price);
        }
    }
}
