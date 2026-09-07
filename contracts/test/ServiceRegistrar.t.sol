// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPermissionedRegistry} from "@ens/registry/interfaces/IPermissionedRegistry.sol";

import {ServiceRegistrar} from "../src/ServiceRegistrar.sol";
import {MockPermissionedRegistry} from "./mocks/MockPermissionedRegistry.sol";

contract FeeToken is ERC20 {
    constructor() ERC20("Test USDC", "tUSDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract ServiceRegistrarTest is Test {
    MockPermissionedRegistry registry;
    FeeToken token;
    ServiceRegistrar registrar;

    address treasury = makeAddr("treasury");
    address serviceOwner = makeAddr("serviceOwner");
    address resolver = makeAddr("resolver");

    uint256 constant PRICE_PER_YEAR = 10e6; // 10 tUSDC
    uint64 constant MIN_DURATION = 7 days;
    uint64 constant MAX_DURATION = 730 days;

    function setUp() public {
        registry = new MockPermissionedRegistry();
        token = new FeeToken();
        registrar = new ServiceRegistrar(
            IPermissionedRegistry(address(registry)),
            IERC20(address(token)),
            treasury,
            PRICE_PER_YEAR,
            MIN_DURATION,
            MAX_DURATION
        );

        token.mint(serviceOwner, 1_000e6);
        vm.prank(serviceOwner);
        token.approve(address(registrar), type(uint256).max);
    }

    function _register(string memory label) internal returns (uint256) {
        vm.prank(serviceOwner);
        return registrar.register(label, serviceOwner, resolver, 365 days);
    }

    function test_registerCreatesName() public {
        uint256 tokenId = _register("weatherpro");
        assertGt(tokenId, 0);

        uint256 labelhash = uint256(keccak256("weatherpro"));
        (address owner,,, uint64 expiry, bool exists) = registry.entries(labelhash);
        assertTrue(exists);
        assertEq(owner, serviceOwner);
        assertEq(expiry, uint64(block.timestamp) + 365 days);
    }

    function test_registerChargesProRatedFee() public {
        vm.prank(serviceOwner);
        registrar.register("weatherpro", serviceOwner, resolver, 365 days);
        assertEq(token.balanceOf(treasury), PRICE_PER_YEAR);

        vm.prank(serviceOwner);
        registrar.register("pricefeed", serviceOwner, resolver, 730 days);
        assertEq(token.balanceOf(treasury), PRICE_PER_YEAR * 3);
    }

    function test_quoteProRatesByDuration() public view {
        assertEq(registrar.quote(365 days), PRICE_PER_YEAR);
        assertEq(registrar.quote(730 days), PRICE_PER_YEAR * 2);
        assertApproxEqAbs(registrar.quote(182.5 days), PRICE_PER_YEAR / 2, 1);
    }

    function test_registerRevertsWhenTaken() public {
        _register("weatherpro");
        vm.prank(serviceOwner);
        vm.expectRevert(
            abi.encodeWithSelector(ServiceRegistrar.LabelNotAvailable.selector, "weatherpro")
        );
        registrar.register("weatherpro", serviceOwner, resolver, 365 days);
    }

    function test_expiredNameBecomesAvailableAgain() public {
        _register("weatherpro");
        vm.warp(block.timestamp + 366 days);
        assertTrue(registrar.available("weatherpro"));
        _register("weatherpro");
    }

    function test_registerRevertsOnEmptyLabel() public {
        vm.prank(serviceOwner);
        vm.expectRevert(ServiceRegistrar.EmptyLabel.selector);
        registrar.register("", serviceOwner, resolver, 365 days);
    }

    function test_registerRevertsOnDurationBounds() public {
        vm.startPrank(serviceOwner);
        vm.expectRevert(
            abi.encodeWithSelector(
                ServiceRegistrar.DurationOutOfRange.selector, uint64(1 days), MIN_DURATION, MAX_DURATION
            )
        );
        registrar.register("weatherpro", serviceOwner, resolver, 1 days);

        vm.expectRevert(
            abi.encodeWithSelector(
                ServiceRegistrar.DurationOutOfRange.selector, uint64(9999 days), MIN_DURATION, MAX_DURATION
            )
        );
        registrar.register("weatherpro", serviceOwner, resolver, 9999 days);
        vm.stopPrank();
    }

    function test_renewExtendsExpiry() public {
        _register("weatherpro");
        uint256 labelhash = uint256(keccak256("weatherpro"));
        uint64 before = registry.getExpiry(labelhash);

        vm.prank(serviceOwner);
        registrar.renew("weatherpro", 365 days);
        assertEq(registry.getExpiry(labelhash), before + 365 days);
        assertEq(token.balanceOf(treasury), PRICE_PER_YEAR * 2);
    }

    function test_delistRemovesName() public {
        _register("scamco");
        registrar.delist("scamco", "12% delivery rate, spec fraud");
        assertTrue(registrar.available("scamco"));
    }

    function test_delistOnlyOwner() public {
        _register("scamco");
        vm.prank(serviceOwner);
        vm.expectRevert();
        registrar.delist("scamco", "nope");
    }

    function test_delistEmitsReason() public {
        _register("scamco");
        vm.expectEmit(true, false, false, true);
        emit ServiceRegistrar.ServiceDelisted(
            keccak256("scamco"), "scamco", "12% delivery rate, spec fraud"
        );
        registrar.delist("scamco", "12% delivery rate, spec fraud");
    }

    function test_freeRegistrationWhenPriceZero() public {
        registrar.setPricing(0, MIN_DURATION, MAX_DURATION);
        address broke = makeAddr("broke");
        vm.prank(broke);
        registrar.register("freebie", broke, resolver, 30 days);
        assertEq(token.balanceOf(treasury), 0);
    }

    function test_setPricingOnlyOwner() public {
        vm.prank(serviceOwner);
        vm.expectRevert();
        registrar.setPricing(0, 1, 2);
    }

    function test_ownerRolesExcludeUnregister() public {
        _register("weatherpro");
        (,, uint256 roleBitmap,,) = registry.entries(uint256(keccak256("weatherpro")));
        // ROLE_UNREGISTER is nybble 3 (1 << 12) — service owners must not hold it
        assertEq(roleBitmap & (1 << 12), 0);
        // but they can manage their own resolver (nybble 6)
        assertGt(roleBitmap & (1 << 24), 0);
    }

    function testFuzz_quoteMonotonic(uint64 a, uint64 b) public view {
        a = uint64(bound(a, MIN_DURATION, MAX_DURATION));
        b = uint64(bound(b, a, MAX_DURATION));
        assertLe(registrar.quote(a), registrar.quote(b));
    }
}
