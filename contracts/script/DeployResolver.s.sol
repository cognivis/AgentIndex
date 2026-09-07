// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {IStandardRegistry} from "@ens/registry/interfaces/IStandardRegistry.sol";
import {PermissionedResolverLib} from "@ens/resolver/libraries/PermissionedResolverLib.sol";

interface IVerifiableFactory {
    function deployProxy(address implementation, uint256 salt, bytes memory data)
        external
        returns (address proxy);
}

/// Deploys our PermissionedResolver proxy for ENSv2-native records.
/// (PublicResolverV2 authorizes via the v1 NameWrapper, which doesn't know
/// v2-native names — so records for *.agentindex.eth live here instead.)
/// Also re-points agentindex.eth at the new resolver.
contract DeployResolver is Script {
    address constant ETH_REGISTRY = 0x67b728a792e789a8978b30cF1b3b641f19354b43;
    address constant RESOLVER_IMPL = 0x7E4B2d59938930168024201752EE5503df402303;
    address constant VERIFIABLE_FACTORY = 0x118Bc31A50d559F7015a8Da26d54B3b030CdB70F;

    uint256 constant SALT = uint256(keccak256("agentindex resolver v1"));

    uint256 constant RESOLVER_ROLES = PermissionedResolverLib.ROLE_SET_ADDR
        | PermissionedResolverLib.ROLE_SET_ADDR_ADMIN | PermissionedResolverLib.ROLE_SET_TEXT
        | PermissionedResolverLib.ROLE_SET_TEXT_ADMIN | PermissionedResolverLib.ROLE_CLEAR
        | PermissionedResolverLib.ROLE_CLEAR_ADMIN;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        bytes[] memory noSetters = new bytes[](0);
        address resolver = IVerifiableFactory(VERIFIABLE_FACTORY).deployProxy(
            RESOLVER_IMPL,
            SALT,
            abi.encodeWithSignature(
                "initialize(address,uint256,bytes[])", deployer, RESOLVER_ROLES, noSetters
            )
        );
        console.log("PermissionedResolver proxy:", resolver);

        // point agentindex.eth itself at it (deployer holds SET_RESOLVER from registration)
        IStandardRegistry(ETH_REGISTRY).setResolver(
            uint256(keccak256(bytes("agentindex"))), resolver
        );
        console.log("agentindex.eth resolver updated");

        vm.stopBroadcast();

        console.log("");
        console.log("env update: AGENTINDEX_RESOLVER=", resolver);
    }
}
