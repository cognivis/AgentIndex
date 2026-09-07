// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";

contract AttestationRegistryTest is Test {
    AttestationRegistry reg;

    address prober = makeAddr("prober");
    address rando = makeAddr("rando");
    bytes32 constant WEATHERPRO = keccak256("weatherpro");
    bytes32 constant SCAMCO = keccak256("scamco");

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

    function setUp() public {
        reg = new AttestationRegistry(prober);
    }

    function _attest(bytes32 node, bool delivered, bool honest) internal {
        vm.prank(prober);
        reg.attest(node, delivered, honest, 120, keccak256("body"), 10_000, "0.0.1234@1757000000.000000001");
    }

    function test_constructorWhitelistsInitialProber() public view {
        assertTrue(reg.isProber(prober));
    }

    function test_constructorAllowsZeroProber() public {
        AttestationRegistry r = new AttestationRegistry(address(0));
        assertFalse(r.isProber(address(0)));
    }

    function test_attestEmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit ProbeResult(
            WEATHERPRO, prober, true, true, 120, keccak256("body"), 10_000,
            "0.0.1234@1757000000.000000001", uint64(block.timestamp)
        );
        _attest(WEATHERPRO, true, true);
    }

    function test_attestRevertsForNonProber() public {
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.NotProber.selector, rando));
        reg.attest(WEATHERPRO, true, true, 1, bytes32(0), 0, "");
    }

    function test_statsAccumulate() public {
        _attest(WEATHERPRO, true, true);
        _attest(WEATHERPRO, true, false);
        _attest(WEATHERPRO, false, false);

        AttestationRegistry.ServiceStats memory s = reg.statsOf(WEATHERPRO);
        assertEq(s.probeCount, 3);
        assertEq(s.deliveredCount, 2);
        assertEq(s.honestCount, 1);
        assertEq(s.lastProbedAt, uint64(block.timestamp));
    }

    function test_statsAreIsolatedPerNode() public {
        _attest(WEATHERPRO, true, true);
        _attest(SCAMCO, false, false);

        assertEq(reg.statsOf(WEATHERPRO).deliveredCount, 1);
        assertEq(reg.statsOf(SCAMCO).deliveredCount, 0);
        assertEq(reg.statsOf(SCAMCO).probeCount, 1);
    }

    function test_deliveryRateBps() public {
        _attest(SCAMCO, true, false);
        _attest(SCAMCO, false, false);
        _attest(SCAMCO, false, false);
        _attest(SCAMCO, false, false);
        assertEq(reg.deliveryRateBps(SCAMCO), 2_500);
    }

    function test_deliveryRateZeroWhenNeverProbed() public view {
        assertEq(reg.deliveryRateBps(keccak256("ghost")), 0);
    }

    function test_ownerCanAddAndRemoveProber() public {
        reg.setProber(rando, true);
        assertTrue(reg.isProber(rando));

        vm.prank(rando);
        reg.attest(WEATHERPRO, true, true, 1, bytes32(0), 0, "ref");

        reg.setProber(rando, false);
        vm.prank(rando);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.NotProber.selector, rando));
        reg.attest(WEATHERPRO, true, true, 1, bytes32(0), 0, "ref");
    }

    function test_nonOwnerCannotSetProber() public {
        vm.prank(rando);
        vm.expectRevert();
        reg.setProber(rando, true);
    }

    function test_lastProbedAtTracksLatestProbe() public {
        _attest(WEATHERPRO, true, true);
        uint64 first = reg.statsOf(WEATHERPRO).lastProbedAt;

        vm.warp(block.timestamp + 1 hours);
        _attest(WEATHERPRO, true, true);
        assertEq(reg.statsOf(WEATHERPRO).lastProbedAt, first + 1 hours);
    }

    function testFuzz_deliveryRateNeverExceedsFull(uint8 delivered, uint8 failed) public {
        vm.assume(uint16(delivered) + failed > 0);
        for (uint256 i = 0; i < delivered; i++) _attest(WEATHERPRO, true, true);
        for (uint256 i = 0; i < failed; i++) _attest(WEATHERPRO, false, false);
        assertLe(reg.deliveryRateBps(WEATHERPRO), 10_000);
    }
}
