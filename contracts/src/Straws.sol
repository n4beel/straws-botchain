// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/**
 * @title Straws
 * @notice Draw straws without a referee. Multi-party commit-reveal randomness over 2-16 entrants.
 * @dev Multi-party randomness by commit-reveal over a group. No funds ever enter; no payable function; no receive.
 */
contract Straws {
    struct Draw {
        address creator;
        uint64 joinEnd; // joining closes (or earlier, when full)
        uint64 revealEnd;
        uint8 slots; // 2..16
        uint8 joined;
        uint8 revealed;
        bool drawn;
        uint8 winnerIndex; // index into the join order; valid only if drawn and revealed >= 2
        string title; // <= 64 bytes
    }

    struct DrawView {
        uint256 id;
        address creator;
        uint64 joinEnd;
        uint64 revealEnd;
        uint8 slots;
        uint8 joined;
        uint8 revealed;
        bool drawn;
        uint8 winnerIndex;
        string title;
    }

    uint8 public constant MIN_SLOTS = 2;
    uint8 public constant MAX_SLOTS = 16;
    uint256 public constant MAX_TITLE = 64;
    uint64 public constant MIN_JOIN = 5 minutes;
    uint64 public constant MAX_JOIN = 7 days;
    uint64 public constant MIN_REVEAL = 5 minutes;
    uint64 public constant MAX_REVEAL = 3 days;
    uint256 public constant MAX_PAGE = 50;

    mapping(uint256 => Draw) private _draws;
    mapping(uint256 => address[]) private _entrants; // join order, <= 16
    mapping(uint256 => mapping(address => bytes32)) private _commit;
    mapping(uint256 => mapping(address => bytes32)) private _secret; // revealed secret (0 = not revealed)
    uint256 public drawCount; // ids start at 1

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

    error TitleTooLong();
    error BadSlots();
    error BadWindow();
    error Closed();
    error AlreadyJoined();
    error ZeroCommitment();
    error NotRevealPhase();
    error NotEntrant();
    error AlreadyRevealed();
    error BadReveal();
    error TooEarly();
    error AlreadyDrawn();
    error NoSuchDraw();

    /**
     * @notice Creates a new draw. The creator does not automatically join.
     * @param title Title of the draw (max 64 bytes)
     * @param slots Target entrant count (2..16)
     * @param joinSecs Duration of join window in seconds (5m..7d)
     * @param revealSecs Duration of reveal window in seconds (5m..3d)
     * @return id The identifier of the created draw
     */
    function create(
        string calldata title,
        uint8 slots,
        uint64 joinSecs,
        uint64 revealSecs
    ) external returns (uint256 id) {
        if (bytes(title).length > MAX_TITLE) revert TitleTooLong();
        if (slots < MIN_SLOTS || slots > MAX_SLOTS) revert BadSlots();
        if (
            joinSecs < MIN_JOIN ||
            joinSecs > MAX_JOIN ||
            revealSecs < MIN_REVEAL ||
            revealSecs > MAX_REVEAL
        ) {
            revert BadWindow();
        }

        id = ++drawCount;
        uint64 jEnd = uint64(block.timestamp + joinSecs);
        uint64 rEnd = uint64(jEnd + revealSecs);

        _draws[id] = Draw({
            creator: msg.sender,
            joinEnd: jEnd,
            revealEnd: rEnd,
            slots: slots,
            joined: 0,
            revealed: 0,
            drawn: false,
            winnerIndex: 0,
            title: title
        });

        emit Created(id, msg.sender, slots, jEnd, rEnd, title);
    }

    /**
     * @notice Join a draw by committing to a sealed secret.
     * @param id The draw identifier
     * @param commitment Hash of (id, entrant, secret)
     */
    function join(uint256 id, bytes32 commitment) external {
        if (id == 0 || id > drawCount) revert NoSuchDraw();
        Draw storage d = _draws[id];

        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp >= d.joinEnd || d.joined >= d.slots) revert Closed();
        if (_commit[id][msg.sender] != bytes32(0)) revert AlreadyJoined();
        if (commitment == bytes32(0)) revert ZeroCommitment();

        uint8 index = d.joined;
        _commit[id][msg.sender] = commitment;
        _entrants[id].push(msg.sender);
        d.joined = index + 1;

        if (d.joined == d.slots) {
            uint64 revealDuration = d.revealEnd - d.joinEnd;
            d.joinEnd = uint64(block.timestamp);
            d.revealEnd = uint64(block.timestamp + revealDuration);
        }

        emit Joined(id, msg.sender, index);
    }

    /**
     * @notice Reveal the sealed secret for an entrant during the reveal phase.
     * @param id The draw identifier
     * @param secret The pre-image secret
     */
    function reveal(uint256 id, bytes32 secret) external {
        if (id == 0 || id > drawCount) revert NoSuchDraw();
        Draw storage d = _draws[id];

        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < d.joinEnd || block.timestamp >= d.revealEnd) {
            revert NotRevealPhase();
        }
        if (_commit[id][msg.sender] == bytes32(0)) revert NotEntrant();
        if (_secret[id][msg.sender] != bytes32(0)) revert AlreadyRevealed();
        if (
            secret == bytes32(0) ||
            keccak256(abi.encode(id, msg.sender, secret)) != _commit[id][msg.sender]
        ) {
            revert BadReveal();
        }

        _secret[id][msg.sender] = secret;
        d.revealed++;

        emit Revealed(id, msg.sender);
    }

    /**
     * @notice Resolves the draw and picks a winner from revealed secrets.
     * @dev Anyone can call once revealEnd passes or all joined entrants have revealed.
     * @param id The draw identifier
     */
    function draw(uint256 id) external {
        if (id == 0 || id > drawCount) revert NoSuchDraw();
        Draw storage d = _draws[id];

        if (d.drawn) revert AlreadyDrawn();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < d.revealEnd && d.revealed < d.joined) {
            revert TooEarly();
        }

        d.drawn = true;
        uint8 revCount = d.revealed;

        if (revCount < 2) {
            emit Void(id);
            return;
        }

        bytes32[] memory revealedSecrets = new bytes32[](revCount);
        uint8[] memory originalIndices = new uint8[](revCount);
        uint8 count = 0;
        address[] storage entrants = _entrants[id];
        uint256 totalEntrants = entrants.length;

        for (uint256 i = 0; i < totalEntrants; i++) {
            address entrant = entrants[i];
            bytes32 s = _secret[id][entrant];
            if (s != bytes32(0)) {
                revealedSecrets[count] = s;
                // Entrants are capped at MAX_SLOTS = 16, so i fits in uint8
                // forge-lint: disable-next-line(unsafe-typecast)
                originalIndices[count] = uint8(i);
                count++;
            }
        }

        bytes32 seed = keccak256(abi.encode(id, revealedSecrets));
        uint256 winningPos = uint256(seed) % revCount;
        uint8 winnerIdx = originalIndices[winningPos];
        d.winnerIndex = winnerIdx;
        address winner = entrants[winnerIdx];

        emit Drawn(id, winner, revCount);
    }

    // --- Views ---

    function drawOf(uint256 id) external view returns (Draw memory) {
        if (id == 0 || id > drawCount) revert NoSuchDraw();
        return _draws[id];
    }

    function entrantsOf(uint256 id) external view returns (address[] memory) {
        if (id == 0 || id > drawCount) revert NoSuchDraw();
        return _entrants[id];
    }

    function hasRevealed(uint256 id, address addr) external view returns (bool) {
        return _secret[id][addr] != bytes32(0);
    }

    function secretOf(uint256 id, address addr) external view returns (bytes32) {
        return _secret[id][addr];
    }

    function commitmentOf(uint256 id, address addr) external view returns (bytes32) {
        return _commit[id][addr];
    }

    function winnerOf(uint256 id) external view returns (bool isDrawn, address winner) {
        if (id == 0 || id > drawCount) return (false, address(0));
        Draw storage d = _draws[id];
        if (!d.drawn || d.revealed < 2) return (d.drawn, address(0));
        return (true, _entrants[id][d.winnerIndex]);
    }

    function commitmentFor(
        uint256 id,
        address entrant,
        bytes32 secret
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(id, entrant, secret));
    }

    function latest(uint256 offset, uint256 count) external view returns (DrawView[] memory) {
        if (offset >= drawCount) return new DrawView[](0);
        if (count > MAX_PAGE) count = MAX_PAGE;
        uint256 available = drawCount - offset;
        uint256 n = count < available ? count : available;

        DrawView[] memory items = new DrawView[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 id = drawCount - offset - i;
            Draw storage d = _draws[id];
            items[i] = DrawView({
                id: id,
                creator: d.creator,
                joinEnd: d.joinEnd,
                revealEnd: d.revealEnd,
                slots: d.slots,
                joined: d.joined,
                revealed: d.revealed,
                drawn: d.drawn,
                winnerIndex: d.winnerIndex,
                title: d.title
            });
        }
        return items;
    }
}
