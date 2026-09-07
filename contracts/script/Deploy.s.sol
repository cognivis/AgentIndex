// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPermissionedRegistry} from "@ens/registry/interfaces/IPermissionedRegistry.sol";

import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {ServiceRegistrar} from "../src/ServiceRegistrar.sol";

/// Re-runnable deploy for Sepolia. Testnets reset — never assume prior state.
///
///   forge script script/Deploy.s.sol --rpc-url sepolia --broadcast
///
/// env:
///   DEPLOYER_PRIVATE_KEY   deployer + contract owner
///   PROBER_ADDRESS         initial whitelisted prober
///   ENS_REGISTRY_ADDRESS   ENSv2 PermissionedRegistry for agentindex.eth subnames
///   FEE_TOKEN_ADDRESS      ERC20 for registration fees (optional if price is 0)
///
/// After deploy, the ENSv2 registry admin must grant the registrar root roles:
/// ROLE_REGISTRAR | ROLE_RENEW | ROLE_UNREGISTER via grantRootRoles().
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address proberAddr = vm.envAddress("PROBER_ADDRESS");
        address ensRegistry = vm.envAddress("ENS_REGISTRY_ADDRESS");
        address feeToken = vm.envOr("FEE_TOKEN_ADDRESS", address(0));

        vm.startBroadcast(pk);

        AttestationRegistry attestations = new AttestationRegistry(proberAddr);

        ServiceRegistrar registrar = new ServiceRegistrar(
            IPermissionedRegistry(ensRegistry),
            IERC20(feeToken),
            vm.addr(pk),
            0, // free listings for the hackathon; setPricing() later
            7 days,
            730 days
        );

        vm.stopBroadcast();

        console.log("AttestationRegistry:", address(attestations));
        console.log("ServiceRegistrar:  ", address(registrar));
        console.log("");
        console.log("Next: grantRootRoles(ROLE_REGISTRAR | ROLE_RENEW | ROLE_UNREGISTER)");
        console.log("on the registry to", address(registrar));
    }
}
