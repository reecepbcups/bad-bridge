// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console } from "forge-std/Script.sol";
import { BadBridge, IRouter } from "../src/BadBridge.sol";

/// Production deploy. The owner can only set the royalty and contractURI.
/// env: ESCROW (raw 32-byte Hub escrow address), OWNER, ROYALTY_BPS, CONTRACT_URI, optional ROYALTY_RECEIVER
contract Deploy is Script {
    IRouter constant ROUTER = IRouter(0x3aF134307D5Ee90faa2ba9Cdba14ba66414CF1A7);

    function run() external {
        bytes32 escrow = vm.envBytes32("ESCROW");
        require(escrow != bytes32(0), "ESCROW unset");
        address owner = vm.envAddress("OWNER");
        require(owner != address(0), "OWNER unset");
        // no default, so nobody ships a 0% royalty by accident. Checked before the uint96 cast so a typo can't wrap
        uint256 bps = vm.envUint("ROYALTY_BPS");
        require(bps <= 1000, "ROYALTY_BPS above 1000 (10%)");
        uint96 royaltyBps = uint96(bps);
        address royaltyReceiver = vm.envOr("ROYALTY_RECEIVER", owner);
        string memory contractURI = vm.envString("CONTRACT_URI");

        vm.startBroadcast();
        BadBridge bridge = new BadBridge(
            ROUTER,
            "cosmoshub-0",
            escrow,
            vm.envOr("NAME", string("Bad Kids")),
            vm.envOr("SYMBOL", string("BADKIDS")),
            vm.envOr("BASE_URI", string("ipfs://QmUoHk4hY6mNoHgNEJDcy94APUky6o8xVmyD3YzddJtUWe/")),
            owner,
            royaltyReceiver,
            royaltyBps,
            contractURI
        );
        vm.stopBroadcast();

        (address receiver, uint256 perEth) = bridge.royaltyInfo(0, 1 ether);
        console.log("bridge", address(bridge));
        console.log("light client", address(bridge.lightClient()));
        console.log("owner", bridge.owner());
        console.log("royalty receiver", receiver);
        console.log("royalty wei per 1 ETH", perEth);
        console.log("contractURI", bridge.contractURI());
    }
}
