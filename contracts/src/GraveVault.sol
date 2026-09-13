// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 surface used for Robinhood Chain Stock Tokens (RWAs).
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
}

/// @dev Handles both standard and non-standard (no-return) ERC-20 implementations.
library SafeTransfer {
    function safeTransfer(address token, address to, uint256 value) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, value)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FAILED");
    }

    function safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, value)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FROM_FAILED");
    }
}

/// @title GRAVE Vault
/// @notice The first onchain last-will vault: a non-custodial contract that holds a
///         testator's RWA Stock Tokens and ETH on Robinhood Chain and, once the owner
///         stops proving they are alive (missed check-in + grace period), lets the named
///         beneficiaries permissionlessly claim their pre-defined shares. There is no
///         admin key: only the owner can move funds while active, and once execution is
///         triggered the split is fixed by an onchain balance snapshot.
contract GraveVault {
    using SafeTransfer for address;

    uint16 internal constant BPS_DENOMINATOR = 10_000;

    struct Beneficiary {
        address account;
        uint16 bps; // share in basis points; all beneficiaries sum to 10_000
    }

    address public immutable owner;
    address public immutable factory;

    uint64 public checkInInterval; // seconds the owner may go silent before grace starts
    uint64 public gracePeriod;     // extra seconds after the interval before execution unlocks
    uint64 public lastCheckIn;     // timestamp of the last proof-of-life

    bool public executed;
    uint64 public executedAt;

    Beneficiary[] public beneficiaries;
    mapping(address => uint16) public bpsOf;

    address[] public tokens;
    mapping(address => bool) internal tokenTracked;

    mapping(address => bool) public isGuardian;

    // Fixed at execution so shares don't drift as beneficiaries claim one by one.
    uint256 public ethSnapshot;
    mapping(address => uint256) public tokenSnapshot;
    mapping(address => bool) public claimed;

    uint256 private _lock = 1;

    event CheckedIn(address indexed by, uint64 at);
    event ScheduleUpdated(uint64 checkInInterval, uint64 gracePeriod);
    event BeneficiariesUpdated(uint256 count);
    event GuardianUpdated(address indexed guardian, bool enabled);
    event Deposited(address indexed token, uint256 amount); // token == address(0) for ETH
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event Executed(address indexed by, uint64 at);
    event Claimed(address indexed beneficiary, uint16 bps);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier notExecuted() {
        require(!executed, "EXECUTED");
        _;
    }

    modifier nonReentrant() {
        require(_lock == 1, "REENTRANT");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(
        address _owner,
        uint64 _checkInInterval,
        uint64 _gracePeriod,
        address[] memory _accounts,
        uint16[] memory _bps,
        address[] memory _guardians
    ) {
        require(_owner != address(0), "ZERO_OWNER");
        require(_checkInInterval > 0, "ZERO_INTERVAL");
        owner = _owner;
        factory = msg.sender;
        checkInInterval = _checkInInterval;
        gracePeriod = _gracePeriod;
        lastCheckIn = uint64(block.timestamp);
        _setBeneficiaries(_accounts, _bps);
        for (uint256 i; i < _guardians.length; ++i) {
            require(_guardians[i] != address(0), "ZERO_GUARDIAN");
            isGuardian[_guardians[i]] = true;
            emit GuardianUpdated(_guardians[i], true);
        }
    }

    // --------------------------------------------------------------------- //
    //  Proof of life                                                        //
    // --------------------------------------------------------------------- //

    /// @notice Reset the countdown. The owner, or any appointed guardian, can attest
    ///         the owner is still alive.
    function checkIn() external notExecuted {
        require(msg.sender == owner || isGuardian[msg.sender], "NOT_ALLOWED");
        lastCheckIn = uint64(block.timestamp);
        emit CheckedIn(msg.sender, lastCheckIn);
    }

    function deadline() public view returns (uint64) {
        return lastCheckIn + checkInInterval + gracePeriod;
    }

    /// @notice True once the grace period has fully elapsed and execution can be triggered.
    function isExpired() public view returns (bool) {
        return block.timestamp > deadline();
    }

    // --------------------------------------------------------------------- //
    //  Owner configuration (only while active)                              //
    // --------------------------------------------------------------------- //

    function setSchedule(uint64 _checkInInterval, uint64 _gracePeriod) external onlyOwner notExecuted {
        require(_checkInInterval > 0, "ZERO_INTERVAL");
        checkInInterval = _checkInInterval;
        gracePeriod = _gracePeriod;
        lastCheckIn = uint64(block.timestamp);
        emit ScheduleUpdated(_checkInInterval, _gracePeriod);
    }

    function setBeneficiaries(address[] calldata _accounts, uint16[] calldata _bps)
        external
        onlyOwner
        notExecuted
    {
        _setBeneficiaries(_accounts, _bps);
    }

    function setGuardian(address guardian, bool enabled) external onlyOwner notExecuted {
        require(guardian != address(0), "ZERO_GUARDIAN");
        isGuardian[guardian] = enabled;
        emit GuardianUpdated(guardian, enabled);
    }

    function _setBeneficiaries(address[] memory _accounts, uint16[] memory _bps) internal {
        require(_accounts.length == _bps.length && _accounts.length > 0, "BAD_LENGTH");

        // clear previous set
        for (uint256 i; i < beneficiaries.length; ++i) {
            bpsOf[beneficiaries[i].account] = 0;
        }
        delete beneficiaries;

        uint256 total;
        for (uint256 i; i < _accounts.length; ++i) {
            address acct = _accounts[i];
            uint16 share = _bps[i];
            require(acct != address(0), "ZERO_BENEFICIARY");
            require(share > 0, "ZERO_BPS");
            require(bpsOf[acct] == 0, "DUP_BENEFICIARY");
            bpsOf[acct] = share;
            beneficiaries.push(Beneficiary(acct, share));
            total += share;
        }
        require(total == BPS_DENOMINATOR, "BPS_SUM");
        emit BeneficiariesUpdated(_accounts.length);
    }

    // --------------------------------------------------------------------- //
    //  Deposits & withdrawals                                               //
    // --------------------------------------------------------------------- //

    receive() external payable {
        emit Deposited(address(0), msg.value);
    }

    /// @notice Pull RWA Stock Tokens (or any ERC-20) from the owner into the vault.
    ///         Requires a prior `approve(vault, amount)` on the token.
    function depositToken(address token, uint256 amount) external onlyOwner notExecuted {
        require(token != address(0) && amount > 0, "BAD_DEPOSIT");
        token.safeTransferFrom(msg.sender, address(this), amount);
        _trackToken(token);
        emit Deposited(token, amount);
    }

    /// @notice Register a token the owner transferred in directly (no approve/transferFrom).
    function trackToken(address token) external onlyOwner notExecuted {
        require(token != address(0), "ZERO_TOKEN");
        _trackToken(token);
    }

    function _trackToken(address token) internal {
        if (!tokenTracked[token]) {
            tokenTracked[token] = true;
            tokens.push(token);
        }
    }

    function withdrawETH(uint256 amount, address to) external onlyOwner notExecuted nonReentrant {
        require(to != address(0), "ZERO_TO");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "ETH_SEND_FAIL");
        emit Withdrawn(address(0), to, amount);
    }

    function withdrawToken(address token, uint256 amount, address to) external onlyOwner notExecuted {
        require(to != address(0), "ZERO_TO");
        token.safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    // --------------------------------------------------------------------- //
    //  Execution & claims                                                   //
    // --------------------------------------------------------------------- //

    /// @notice Permissionless once expired: snapshots balances and opens claims.
    function execute() external notExecuted nonReentrant {
        require(isExpired(), "NOT_EXPIRED");
        executed = true;
        executedAt = uint64(block.timestamp);

        ethSnapshot = address(this).balance;
        uint256 len = tokens.length;
        for (uint256 i; i < len; ++i) {
            address token = tokens[i];
            tokenSnapshot[token] = IERC20(token).balanceOf(address(this));
        }
        emit Executed(msg.sender, executedAt);
    }

    /// @notice A beneficiary pulls their fixed share of ETH and every tracked token.
    function claim() external nonReentrant {
        require(executed, "NOT_EXECUTED");
        uint16 share = bpsOf[msg.sender];
        require(share > 0, "NOT_BENEFICIARY");
        require(!claimed[msg.sender], "ALREADY_CLAIMED");
        claimed[msg.sender] = true;

        uint256 ethAmount = (ethSnapshot * share) / BPS_DENOMINATOR;
        if (ethAmount > 0) {
            (bool ok, ) = msg.sender.call{value: ethAmount}("");
            require(ok, "ETH_SEND_FAIL");
        }

        uint256 len = tokens.length;
        for (uint256 i; i < len; ++i) {
            address token = tokens[i];
            uint256 amount = (tokenSnapshot[token] * share) / BPS_DENOMINATOR;
            if (amount > 0) {
                token.safeTransfer(msg.sender, amount);
            }
        }
        emit Claimed(msg.sender, share);
    }

    // --------------------------------------------------------------------- //
    //  Views (for the dApp)                                                 //
    // --------------------------------------------------------------------- //

    function beneficiaryCount() external view returns (uint256) {
        return beneficiaries.length;
    }

    function getBeneficiaries() external view returns (Beneficiary[] memory) {
        return beneficiaries;
    }

    function getTokens() external view returns (address[] memory) {
        return tokens;
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    /// @notice Preview what `account` would receive if they claimed now (post-execution).
    function previewClaim(address account)
        external
        view
        returns (uint256 ethAmount, address[] memory toks, uint256[] memory amounts)
    {
        uint16 share = bpsOf[account];
        uint256 len = tokens.length;
        toks = new address[](len);
        amounts = new uint256[](len);
        if (share == 0 || !executed || claimed[account]) {
            return (0, toks, amounts);
        }
        ethAmount = (ethSnapshot * share) / BPS_DENOMINATOR;
        for (uint256 i; i < len; ++i) {
            toks[i] = tokens[i];
            amounts[i] = (tokenSnapshot[tokens[i]] * share) / BPS_DENOMINATOR;
        }
    }
}
