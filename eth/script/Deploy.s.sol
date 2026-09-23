// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console } from "forge-std/Script.sol";
import { BadBridge, IRouter } from "../src/BadBridge.sol";

/// Production deploy. No owner, nothing to renounce. env: ESCROW (raw 32-byte Hub escrow address)
contract Deploy is Script {
    IRouter constant ROUTER = IRouter(0x3aF134307D5Ee90faa2ba9Cdba14ba66414CF1A7);

    function run() external {
        bytes32 escrow = vm.envBytes32("ESCROW");
        require(escrow != bytes32(0), "ESCROW unset");

        vm.startBroadcast();
        BadBridge bridge = new BadBridge(
            ROUTER,
            "cosmoshub-0",
            escrow,
            vm.envOr("NAME", string("Bad Kids")),
            vm.envOr("SYMBOL", string("BADKIDS")),
            vm.envOr("BASE_URI", string("ipfs://QmUoHk4hY6mNoHgNEJDcy94APUky6o8xVmyD3YzddJtUWe/"))
        );
        vm.stopBroadcast();

        console.log("bridge", address(bridge));
        console.log("light client", address(bridge.lightClient()));
    }
}
