// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {GraveFactory} from "../src/GraveFactory.sol";

/// @notice Deploys the GRAVE Factory to Robinhood Chain.
/// Usage:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url robinhood_testnet --broadcast --private-key $PRIVATE_KEY
contract Deploy is Script {
    function run() external returns (GraveFactory factory) {
        vm.startBroadcast();
        factory = new GraveFactory();
        vm.stopBroadcast();
        console.log("GraveFactory deployed at:", address(factory));
    }
}
