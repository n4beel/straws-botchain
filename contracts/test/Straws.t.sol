// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Straws} from "../src/Straws.sol";

contract StrawsTest is Test {
    Straws public straws;

    address internal creator = address(0xC0FFEE);
    address internal alice = address(0xAA11);
    address internal bob = address(0xBB22);
    address internal charlie = address(0xCC33);
    address internal dave = address(0xDD44);

    bytes32 internal secretA = bytes32(uint256(0xA1));
    bytes32 internal secretB = bytes32(uint256(0xB2));
    bytes32 internal secretC = bytes32(uint256(0xC3));
    bytes32 internal secretD = bytes32(uint256(0xD4));

    event Created(
        uint256 indexed id,
        address indexed creator,
        uint8 slots,
        uint64 joinEnd,
        uint64 revealEnd,
        string title
    );
    event Joined(uint256 indexed id, address indexed entrant, uint8 index);
    event Revealed(uint256 indexed id, address indexed entrant);
    event Drawn(uint256 indexed id, address indexed winner, uint8 revealed);
    event Void(uint256 indexed id);

    function _commit(uint256 id, address entrant, bytes32 secret) internal pure returns (bytes32) {
        return keccak256(abi.encode(id, entrant, secret));
    }

    function setUp() public {
        straws = new Straws();
    }

    function test_CreateValidationReverts() public {
        // Bad title length > 64
        string memory longTitle = "12345678901234567890123456789012345678901234567890123456789012345";
        vm.expectRevert(Straws.TitleTooLong.selector);
        straws.create(longTitle, 4, 3600, 3600);

        // Max title length 64 should succeed
        string memory maxTitle = "1234567890123456789012345678901234567890123456789012345678901234";
        uint256 idOk = straws.create(maxTitle, 4, 3600, 3600);
        assertEq(idOk, 1);

        // Bad slots: 1 (< 2)
        vm.expectRevert(Straws.BadSlots.selector);
        straws.create("Title", 1, 3600, 3600);

        // Bad slots: 17 (> 16)
        vm.expectRevert(Straws.BadSlots.selector);
        straws.create("Title", 17, 3600, 3600);

        // Bad joinSecs: < 5 min (299)
        vm.expectRevert(Straws.BadWindow.selector);
        straws.create("Title", 4, 299, 3600);

        // Bad joinSecs: > 7 days (604801)
        vm.expectRevert(Straws.BadWindow.selector);
        straws.create("Title", 4, 604801, 3600);

        // Bad revealSecs: < 5 min (299)
        vm.expectRevert(Straws.BadWindow.selector);
        straws.create("Title", 4, 3600, 299);

        // Bad revealSecs: > 3 days (259201)
        vm.expectRevert(Straws.BadWindow.selector);
        straws.create("Title", 4, 3600, 259201);
    }

    function test_WinnerIsARevealedEntrant() public {
        vm.prank(creator);
        uint256 id = straws.create("Who buys coffee?", 3, 3600, 3600);

        bytes32 commitA = straws.commitmentFor(id, alice, secretA);
        bytes32 commitB = straws.commitmentFor(id, bob, secretB);
        bytes32 commitC = straws.commitmentFor(id, charlie, secretC);

        vm.prank(alice);
        straws.join(id, commitA);
        vm.prank(bob);
        straws.join(id, commitB);
        vm.prank(charlie);
        straws.join(id, commitC);

        // Filling opens reveal immediately
        vm.prank(alice);
        straws.reveal(id, secretA);
        vm.prank(bob);
        straws.reveal(id, secretB);
        vm.prank(charlie);
        straws.reveal(id, secretC);

        straws.draw(id);

        (bool isDrawn, address winner) = straws.winnerOf(id);
        assertTrue(isDrawn);
        assertTrue(winner == alice || winner == bob || winner == charlie);
    }

    function test_UnrevealedNeverWin(uint8 revealMask) public {
        vm.prank(creator);
        uint256 id = straws.create("Lunch draw", 4, 3600, 3600);

        bytes32 commitA = _commit(id, alice, secretA);
        bytes32 commitB = _commit(id, bob, secretB);
        bytes32 commitC = _commit(id, charlie, secretC);
        bytes32 commitD = _commit(id, dave, secretD);

        vm.prank(alice);
        straws.join(id, commitA);
        vm.prank(bob);
        straws.join(id, commitB);
        vm.prank(charlie);
        straws.join(id, commitC);
        vm.prank(dave);
        straws.join(id, commitD);

        // At least 2 must reveal to be valid, say alice always reveals, and others reveal if bit is set
        bool rB = (revealMask & 1) != 0;
        bool rC = (revealMask & 2) != 0;
        bool rD = (revealMask & 4) != 0;

        // Force at least one more to reveal so >= 2 revealed
        if (!rB && !rC && !rD) {
            rB = true;
        }

        vm.prank(alice);
        straws.reveal(id, secretA);
        if (rB) {
            vm.prank(bob);
            straws.reveal(id, secretB);
        }
        if (rC) {
            vm.prank(charlie);
            straws.reveal(id, secretC);
        }
        if (rD) {
            vm.prank(dave);
            straws.reveal(id, secretD);
        }

        // Warp past revealEnd to allow draw
        Straws.Draw memory d = straws.drawOf(id);
        vm.warp(d.revealEnd + 1);

        straws.draw(id);

        (bool isDrawn, address winner) = straws.winnerOf(id);
        assertTrue(isDrawn);
        assertTrue(straws.hasRevealed(id, winner));

        if (!rB) assertTrue(winner != bob);
        if (!rC) assertTrue(winner != charlie);
        if (!rD) assertTrue(winner != dave);
    }

    function test_VoidWhenFewerThanTwoReveal() public {
        vm.prank(creator);
        uint256 id = straws.create("Solo reveal", 3, 3600, 3600);

        vm.prank(alice);
        straws.join(id, _commit(id, alice, secretA));
        vm.prank(bob);
        straws.join(id, _commit(id, bob, secretB));

        // Let join window expire
        vm.warp(block.timestamp + 3601);

        // Only Alice reveals
        vm.prank(alice);
        straws.reveal(id, secretA);

        // Let reveal window expire
        vm.warp(block.timestamp + 3601);

        vm.expectEmit(true, true, true, true);
        emit Void(id);
        straws.draw(id);

        (bool isDrawn, address winner) = straws.winnerOf(id);
        assertTrue(isDrawn);
        assertEq(winner, address(0));
    }

    function test_FillingOpensRevealEarly() public {
        uint256 t0 = block.timestamp;
        vm.prank(creator);
        uint256 id = straws.create("Early fill", 2, 3600, 1800);

        vm.prank(alice);
        straws.join(id, _commit(id, alice, secretA));

        // Not full yet -> reveal not open
        vm.prank(alice);
        vm.expectRevert(Straws.NotRevealPhase.selector);
        straws.reveal(id, secretA);

        // Bob joins -> fills draw
        vm.warp(t0 + 100);
        vm.prank(bob);
        straws.join(id, _commit(id, bob, secretB));

        Straws.Draw memory d = straws.drawOf(id);
        assertEq(d.joinEnd, t0 + 100);
        assertEq(d.revealEnd, t0 + 100 + 1800);

        // Alice can reveal immediately without waiting for original 3600s
        vm.prank(alice);
        straws.reveal(id, secretA);
        assertTrue(straws.hasRevealed(id, alice));
    }

    function test_JoinAfterFullReverts() public {
        vm.prank(creator);
        uint256 id = straws.create("Pair", 2, 3600, 3600);

        vm.prank(alice);
        straws.join(id, _commit(id, alice, secretA));
        vm.prank(bob);
        straws.join(id, _commit(id, bob, secretB));

        // 3rd entrant charlie should revert Closed
        vm.prank(charlie);
        vm.expectRevert(Straws.Closed.selector);
        straws.join(id, _commit(id, charlie, secretC));
    }

    function test_DoubleJoinReverts() public {
        vm.prank(creator);
        uint256 id = straws.create("Test", 4, 3600, 3600);

        bytes32 cA = _commit(id, alice, secretA);
        vm.prank(alice);
        straws.join(id, cA);

        vm.prank(alice);
        vm.expectRevert(Straws.AlreadyJoined.selector);
        straws.join(id, cA);
    }

    function test_ZeroCommitmentReverts() public {
        vm.prank(creator);
        uint256 id = straws.create("Test", 4, 3600, 3600);

        vm.prank(alice);
        vm.expectRevert(Straws.ZeroCommitment.selector);
        straws.join(id, bytes32(0));
    }

    function test_BadRevealReverts() public {
        vm.prank(creator);
        uint256 id = straws.create("Test", 2, 3600, 3600);

        vm.prank(alice);
        straws.join(id, _commit(id, alice, secretA));
        vm.prank(bob);
        straws.join(id, _commit(id, bob, secretB));

        // Wrong secret
        vm.prank(alice);
        vm.expectRevert(Straws.BadReveal.selector);
        straws.reveal(id, bytes32(uint256(0xDEADBEEF)));

        // Zero secret
        vm.prank(alice);
        vm.expectRevert(Straws.BadReveal.selector);
        straws.reveal(id, bytes32(0));
    }

    function test_RevealBeforeJoinEndReverts() public {
        vm.prank(creator);
        uint256 id = straws.create("Test", 4, 3600, 3600);

        vm.prank(alice);
        straws.join(id, _commit(id, alice, secretA));

        // Join phase is open (not full and timestamp < joinEnd)
        vm.prank(alice);
        vm.expectRevert(Straws.NotRevealPhase.selector);
        straws.reveal(id, secretA);
    }

    function test_DrawTooEarlyReverts() public {
        vm.prank(creator);
        uint256 id = straws.create("Test", 2, 3600, 3600);

        vm.prank(alice);
        straws.join(id, _commit(id, alice, secretA));
        vm.prank(bob);
        straws.join(id, _commit(id, bob, secretB));

        // Reveal phase opened, but only Alice revealed and revealEnd not passed
        vm.prank(alice);
        straws.reveal(id, secretA);

        vm.expectRevert(Straws.TooEarly.selector);
        straws.draw(id);
    }

    function test_DrawOnce() public {
        vm.prank(creator);
        uint256 id = straws.create("Test", 2, 3600, 3600);

        vm.prank(alice);
        straws.join(id, _commit(id, alice, secretA));
        vm.prank(bob);
        straws.join(id, _commit(id, bob, secretB));

        vm.prank(alice);
        straws.reveal(id, secretA);
        vm.prank(bob);
        straws.reveal(id, secretB);

        // Everyone revealed -> draw succeeds
        straws.draw(id);

        // Second draw reverts
        vm.expectRevert(Straws.AlreadyDrawn.selector);
        straws.draw(id);
    }

    function test_SeedMatchesOffChainVector() public {
        vm.prank(creator);
        uint256 id = straws.create("Vector Test", 3, 3600, 3600);

        bytes32 s1 = bytes32(uint256(0x1111));
        bytes32 s2 = bytes32(uint256(0x2222));
        bytes32 s3 = bytes32(uint256(0x3333));

        vm.prank(alice);
        straws.join(id, _commit(id, alice, s1));
        vm.prank(bob);
        straws.join(id, _commit(id, bob, s2));
        vm.prank(charlie);
        straws.join(id, _commit(id, charlie, s3));

        vm.prank(alice);
        straws.reveal(id, s1);
        vm.prank(bob);
        straws.reveal(id, s2);
        vm.prank(charlie);
        straws.reveal(id, s3);

        straws.draw(id);

        // Recompute seed off-chain recipe: keccak256(abi.encode(id, secrets))
        bytes32[] memory secretsList = new bytes32[](3);
        secretsList[0] = s1;
        secretsList[1] = s2;
        secretsList[2] = s3;
        bytes32 expectedSeed = keccak256(abi.encode(id, secretsList));

        uint256 winningPos = uint256(expectedSeed) % 3;
        address[3] memory entrantList = [alice, bob, charlie];
        address expectedWinner = entrantList[winningPos];

        (bool isDrawn, address winner) = straws.winnerOf(id);
        assertTrue(isDrawn);
        assertEq(winner, expectedWinner);
    }

    function testFuzz_WinnerUniformEnough() public pure {
        // Run 1,000 simulated draws over 4 entrants
        // Expect ~250 wins per entrant. ±15% of 250 is [212, 288].
        uint256[4] memory wins;
        uint256 iterations = 1000;

        for (uint256 i = 0; i < iterations; i++) {
            bytes32[] memory secrets = new bytes32[](4);
            secrets[0] = keccak256(abi.encode("alice", i));
            secrets[1] = keccak256(abi.encode("bob", i));
            secrets[2] = keccak256(abi.encode("charlie", i));
            secrets[3] = keccak256(abi.encode("dave", i));

            bytes32 seed = keccak256(abi.encode(i + 1, secrets));
            uint256 winningPos = uint256(seed) % 4;
            wins[winningPos]++;
        }

        // Check uniform spread within ±15%
        for (uint256 j = 0; j < 4; j++) {
            assertGe(wins[j], 212, "Win count below -15% tolerance");
            assertLe(wins[j], 288, "Win count above +15% tolerance");
        }
    }

    function test_NoBalance_NoReceive() public {
        assertEq(address(straws).balance, 0);

        // Sending value must fail (no receive/fallback)
        (bool success, ) = address(straws).call{value: 1 ether}("");
        assertFalse(success);
        assertEq(address(straws).balance, 0);
    }

    function test_NoSuchDrawReverts() public {
        vm.expectRevert(Straws.NoSuchDraw.selector);
        straws.drawOf(999);

        vm.expectRevert(Straws.NoSuchDraw.selector);
        straws.join(999, bytes32(uint256(1)));

        vm.expectRevert(Straws.NoSuchDraw.selector);
        straws.reveal(999, bytes32(uint256(1)));

        vm.expectRevert(Straws.NoSuchDraw.selector);
        straws.draw(999);
    }

    function test_LatestPagination() public {
        for (uint256 i = 1; i <= 5; i++) {
            straws.create(string.concat("Draw #", vm.toString(i)), 2, 3600, 3600);
        }

        Straws.DrawView[] memory page1 = straws.latest(0, 3);
        assertEq(page1.length, 3);
        assertEq(page1[0].id, 5);
        assertEq(page1[1].id, 4);
        assertEq(page1[2].id, 3);

        Straws.DrawView[] memory page2 = straws.latest(3, 3);
        assertEq(page2.length, 2);
        assertEq(page2[0].id, 2);
        assertEq(page2[1].id, 1);

        // Exact offset == drawCount returns empty
        Straws.DrawView[] memory exactPage = straws.latest(5, 3);
        assertEq(exactPage.length, 0);

        Straws.DrawView[] memory emptyPage = straws.latest(10, 3);
        assertEq(emptyPage.length, 0);
    }

    function test_ExactBoundaryDurationsSucceed() public {
        // Both exactly at MIN (300s = 5 minutes)
        uint256 id1 = straws.create("Min Windows", 2, 300, 300);
        assertEq(id1, 1);

        // Both exactly at MAX (7 days = 604800, 3 days = 259200)
        uint256 id2 = straws.create("Max Windows", 2, 604800, 259200);
        assertEq(id2, 2);
    }

    function test_RevealAtExactRevealEndReverts() public {
        vm.prank(creator);
        uint256 id = straws.create("Boundary Reveal", 2, 3600, 3600);

        vm.prank(alice);
        straws.join(id, _commit(id, alice, secretA));
        vm.prank(bob);
        straws.join(id, _commit(id, bob, secretB));

        Straws.Draw memory d = straws.drawOf(id);
        // Warp to EXACTLY revealEnd
        vm.warp(d.revealEnd);

        vm.prank(alice);
        vm.expectRevert(Straws.NotRevealPhase.selector);
        straws.reveal(id, secretA);
    }

    function test_JoinAtExactJoinEndReverts() public {
        vm.prank(creator);
        uint256 id = straws.create("Boundary Join", 2, 3600, 3600);

        Straws.Draw memory d = straws.drawOf(id);
        // Warp to EXACTLY joinEnd
        vm.warp(d.joinEnd);

        vm.prank(alice);
        vm.expectRevert(Straws.Closed.selector);
        straws.join(id, _commit(id, alice, secretA));
    }

    function test_DrawAtExactRevealEndSucceeds() public {
        vm.prank(creator);
        uint256 id = straws.create("Boundary Draw", 2, 3600, 3600);

        vm.prank(alice);
        straws.join(id, _commit(id, alice, secretA));
        vm.prank(bob);
        straws.join(id, _commit(id, bob, secretB));

        Straws.Draw memory d = straws.drawOf(id);
        vm.warp(d.joinEnd);
        vm.prank(alice);
        straws.reveal(id, secretA);

        // Warp to EXACTLY revealEnd
        vm.warp(d.revealEnd);
        // With 1 reveal and at revealEnd, draw should succeed (and emit Void)
        straws.draw(id);
        (bool isDrawn, address winner) = straws.winnerOf(id);
        assertTrue(isDrawn);
        assertEq(winner, address(0));
    }

    function test_EntrantsOfReturnsAllEntrants() public {
        vm.prank(creator);
        uint256 id = straws.create("Entrants Test", 2, 3600, 3600);

        vm.prank(alice);
        straws.join(id, _commit(id, alice, secretA));
        vm.prank(bob);
        straws.join(id, _commit(id, bob, secretB));

        // Must succeed on current latest draw (id == drawCount)
        address[] memory entrants = straws.entrantsOf(id);
        assertEq(entrants.length, 2);
        assertEq(entrants[0], alice);
        assertEq(entrants[1], bob);
    }
}
