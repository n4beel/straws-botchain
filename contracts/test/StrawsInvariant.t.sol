// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Straws} from "../src/Straws.sol";

contract StrawsHandler is Test {
    Straws public straws;
    address[] internal users;
    uint256[] internal createdIds;

    constructor(Straws _straws) {
        straws = _straws;
        users.push(address(0x1111));
        users.push(address(0x2222));
        users.push(address(0x3333));
        users.push(address(0x4444));
        users.push(address(0x5555));
    }

    function createDraw(uint8 slotsSeed, uint64 joinSecsSeed, uint64 revealSecsSeed) external {
        uint8 slots = uint8(bound(slotsSeed, 2, 5));
        uint64 joinSecs = uint64(bound(joinSecsSeed, 300, 3600));
        uint64 revealSecs = uint64(bound(revealSecsSeed, 300, 3600));

        uint256 id = straws.create("Invariant Draw", slots, joinSecs, revealSecs);
        createdIds.push(id);
    }

    function joinDraw(uint256 idSeed, uint256 userSeed, uint256 secretSeed) external {
        if (createdIds.length == 0) return;
        uint256 id = createdIds[idSeed % createdIds.length];
        address user = users[userSeed % users.length];
        bytes32 secret = keccak256(abi.encode(secretSeed + 1));

        bytes32 commitment = straws.commitmentFor(id, user, secret);

        vm.prank(user);
        try straws.join(id, commitment) {} catch {}
    }

    function revealDraw(uint256 idSeed, uint256 userSeed, uint256 secretSeed) external {
        if (createdIds.length == 0) return;
        uint256 id = createdIds[idSeed % createdIds.length];
        address user = users[userSeed % users.length];
        bytes32 secret = keccak256(abi.encode(secretSeed + 1));

        vm.prank(user);
        try straws.reveal(id, secret) {} catch {}
    }

    function drawDraw(uint256 idSeed) external {
        if (createdIds.length == 0) return;
        uint256 id = createdIds[idSeed % createdIds.length];

        try straws.draw(id) {} catch {}
    }

    function warpTime(uint256 secondsToWarp) external {
        vm.warp(block.timestamp + bound(secondsToWarp, 1, 7200));
    }
}

contract StrawsInvariantTest is Test {
    Straws public straws;
    StrawsHandler public handler;

    function setUp() public {
        straws = new Straws();
        handler = new StrawsHandler(straws);

        targetContract(address(handler));
    }

    function invariant_ContractBalanceZero() public view {
        assertEq(address(straws).balance, 0);
    }

    function invariant_RevealedBoundedByJoined() public view {
        uint256 count = straws.drawCount();
        for (uint256 i = 1; i <= count; i++) {
            Straws.Draw memory d = straws.drawOf(i);
            assertLe(d.revealed, d.joined);
            assertLe(d.joined, d.slots);
            assertLe(d.slots, 16);
            assertGe(d.slots, 2);
        }
    }

    function invariant_WinnerIsRevealedEntrant() public view {
        uint256 count = straws.drawCount();
        for (uint256 i = 1; i <= count; i++) {
            (bool isDrawn, address winner) = straws.winnerOf(i);
            if (isDrawn && winner != address(0)) {
                assertTrue(straws.hasRevealed(i, winner));
            }
        }
    }
}
