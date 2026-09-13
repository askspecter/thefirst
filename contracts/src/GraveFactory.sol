// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {GraveVault} from "./GraveVault.sol";

/// @title GRAVE Factory
/// @notice Deploys and indexes one GRAVE Vault per owner on Robinhood Chain.
contract GraveFactory {
    mapping(address => address) public vaultOf;
    address[] public allVaults;

    event VaultCreated(address indexed owner, address indexed vault);

    /// @param checkInInterval seconds the owner may go silent before grace begins
    /// @param gracePeriod     extra seconds after the interval before execution unlocks
    /// @param accounts        beneficiary addresses
    /// @param bps             beneficiary shares in basis points (must sum to 10_000)
    /// @param guardians       optional addresses allowed to check in on the owner's behalf
    function createVault(
        uint64 checkInInterval,
        uint64 gracePeriod,
        address[] calldata accounts,
        uint16[] calldata bps,
        address[] calldata guardians
    ) external returns (address vault) {
        require(vaultOf[msg.sender] == address(0), "VAULT_EXISTS");
        vault = address(
            new GraveVault(msg.sender, checkInInterval, gracePeriod, accounts, bps, guardians)
        );
        vaultOf[msg.sender] = vault;
        allVaults.push(vault);
        emit VaultCreated(msg.sender, vault);
    }

    function vaultCount() external view returns (uint256) {
        return allVaults.length;
    }
}
