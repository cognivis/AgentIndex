// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPermissionedRegistry} from "@ens/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ens/registry/interfaces/IRegistry.sol";
import {RegistryRolesLib} from "@ens/registry/libraries/RegistryRolesLib.sol";

import {ServiceRegistrar} from "../src/ServiceRegistrar.sol";

interface IVerifiableFactory {
    function deployProxy(address implementation, uint256 salt, bytes memory data)
        external
        returns (address proxy);
}

interface IETHRegistrarMin {
    function commit(bytes32 commitment) external;
    function makeCommitment(
        string calldata label,
        address owner,
        bytes32 secret,
        IRegistry subregistry,
        address resolver,
        uint64 duration,
        bytes32 referrer
    ) external pure returns (bytes32);
    function register(
        string calldata label,
        address owner,
        bytes32 secret,
        IRegistry subregistry,
        address resolver,
        uint64 duration,
        IERC20 paymentToken,
        bytes32 referrer
    ) external returns (uint256 tokenId);
    function isAvailable(string calldata label) external view returns (bool);
    function getRegisterPrice(string calldata label, uint64 duration, IERC20 paymentToken)
        external
        view
        returns (uint256 base, uint256 premium);
    function commitmentAt(bytes32 commitment) external view returns (uint64);
}

interface IMintableERC20 is IERC20 {
    function mint(address to, uint256 amount) external;
}

/// End-to-end ENSv2 Sepolia setup, re-runnable (testnets reset):
///   1. deploy our UserRegistry proxy (holds *.agentindex.eth)
///   2. deploy ServiceRegistrar and grant it registrar/renew/unregister roles
///   3. register agentindex.eth via commit-reveal, pointing its subregistry at (1)
///
/// Addresses pinned from ensdomains/contracts-v2 deployments/sepolia
/// (repo artifacts are the source of truth, docs page was stale on 2026-09-07).
contract DeployEnsV2 is Script {
    // --- pinned ENSv2 Sepolia deployments ---
    address constant ETH_REGISTRY = 0x67b728a792e789a8978b30cF1b3b641f19354b43;
    address constant ETH_REGISTRAR = 0xa4449a0dD2b83007553D9b1d28b583A46A805a30;
    address constant USER_REGISTRY_IMPL = 0x840Fa461059862Ea466A711E8C98c8dE732061C0;
    address constant VERIFIABLE_FACTORY = 0x118Bc31A50d559F7015a8Da26d54B3b030CdB70F;
    address constant PUBLIC_RESOLVER_V2 = 0xd25f66Dd4fF61486c2c5c1E6201A23576698D3df;
    address constant MOCK_USDC = 0xD3322B29a7BdEe707D1684676f149bf41Aa3422f;

    string constant LABEL = "agentindex";
    uint64 constant DURATION = 365 days;
    uint256 constant SALT = uint256(keccak256("agentindex.eth v1"));

    uint256 constant DEPLOYER_ROOT_ROLES = RegistryRolesLib.ROLE_REGISTRAR
        | RegistryRolesLib.ROLE_REGISTRAR_ADMIN | RegistryRolesLib.ROLE_RENEW
        | RegistryRolesLib.ROLE_RENEW_ADMIN | RegistryRolesLib.ROLE_UNREGISTER
        | RegistryRolesLib.ROLE_UNREGISTER_ADMIN | RegistryRolesLib.ROLE_SET_RESOLVER
        | RegistryRolesLib.ROLE_SET_RESOLVER_ADMIN | RegistryRolesLib.ROLE_SET_SUBREGISTRY
        | RegistryRolesLib.ROLE_SET_SUBREGISTRY_ADMIN | RegistryRolesLib.ROLE_UPGRADE
        | RegistryRolesLib.ROLE_UPGRADE_ADMIN;

    uint256 constant REGISTRAR_ROLES = RegistryRolesLib.ROLE_REGISTRAR
        | RegistryRolesLib.ROLE_RENEW | RegistryRolesLib.ROLE_UNREGISTER;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        bytes32 secret = keccak256(abi.encode("agentindex-secret", deployer));

        vm.startBroadcast(pk);

        // 1. our subname registry
        address userRegistry = vm.envOr("AGENTINDEX_REGISTRY_ADDRESS", address(0));
        if (userRegistry == address(0)) {
            userRegistry = IVerifiableFactory(VERIFIABLE_FACTORY).deployProxy(
                USER_REGISTRY_IMPL,
                SALT,
                abi.encodeWithSignature("initialize(address,uint256)", deployer, DEPLOYER_ROOT_ROLES)
            );
            console.log("UserRegistry proxy deployed:", userRegistry);
        } else {
            console.log("UserRegistry proxy reused:  ", userRegistry);
        }

        // 2. our service registrar, authorized on the registry root
        address registrarAddr = vm.envOr("SUBNAME_REGISTRAR_ADDRESS", address(0));
        if (registrarAddr == address(0)) {
            ServiceRegistrar registrar = new ServiceRegistrar(
                IPermissionedRegistry(userRegistry),
                IERC20(MOCK_USDC),
                deployer,
                0, // free listings during the hackathon
                7 days,
                730 days
            );
            registrarAddr = address(registrar);
            (bool ok,) = userRegistry.call(
                abi.encodeWithSignature("grantRootRoles(uint256,address)", REGISTRAR_ROLES, registrarAddr)
            );
            require(ok, "grantRootRoles failed");
            console.log("ServiceRegistrar deployed:  ", registrarAddr);
        } else {
            console.log("ServiceRegistrar reused:    ", registrarAddr);
        }

        // 3. the parent name — commit-reveal needs two runs, since the
        //    pre-broadcast simulation can't age the commitment 60s:
        //      ENS_STEP=commit   → fund, approve, commit
        //      (wait 75s)
        //      ENS_STEP=register → reveal + register
        string memory step = vm.envOr("ENS_STEP", string("commit"));
        IETHRegistrarMin eth = IETHRegistrarMin(ETH_REGISTRAR);
        if (!eth.isAvailable(LABEL)) {
            console.log("agentindex.eth already registered, skipping");
        } else if (keccak256(bytes(step)) == keccak256("commit")) {
            (uint256 base, uint256 premium) =
                eth.getRegisterPrice(LABEL, DURATION, IERC20(MOCK_USDC));
            uint256 price = base + premium;
            console.log("register price (MockUSDC):  ", price);

            IMintableERC20(MOCK_USDC).mint(deployer, price);
            IMintableERC20(MOCK_USDC).approve(ETH_REGISTRAR, price);

            bytes32 commitment = eth.makeCommitment(
                LABEL, deployer, secret, IRegistry(userRegistry), PUBLIC_RESOLVER_V2, DURATION, bytes32(0)
            );
            if (eth.commitmentAt(commitment) == 0) {
                eth.commit(commitment);
            }
            console.log("committed. rerun with ENS_STEP=register after 75s");
        } else {
            uint256 tokenId = eth.register(
                LABEL,
                deployer,
                secret,
                IRegistry(userRegistry),
                PUBLIC_RESOLVER_V2,
                DURATION,
                IERC20(MOCK_USDC),
                bytes32(0)
            );
            console.log("agentindex.eth registered, tokenId:");
            console.log(tokenId);
        }

        vm.stopBroadcast();

        console.log("");
        console.log("env updates:");
        console.log("AGENTINDEX_REGISTRY_ADDRESS=", userRegistry);
        console.log("SUBNAME_REGISTRAR_ADDRESS=", registrarAddr);
    }
}
