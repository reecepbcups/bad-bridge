import { parseAbi } from 'viem'

// The slices of eth/src/BadBridge.sol (and the OZ ERC721 errors it inherits) the app calls.
// abi.test.ts pins every selector to `forge inspect BadBridge methodIdentifiers` / `errors`.

/** BadBridge: reads, claim, and the custom errors a claim or ownerOf can revert with. */
export const bridgeAbi = parseAbi([
  'function lightClient() view returns (address)',
  'function proven(uint32 tokenId) view returns (address)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function ESCROW() view returns (bytes32)',
  'function ROUTER() view returns (address)',
  'function clientId() view returns (string)',
  'function claim(uint32 tokenId)',
  'error NotProven(uint32 tokenId)',
  'error ClientFrozen()',
  'error ERC721NonexistentToken(uint256 tokenId)',
  'error ERC721InvalidSender(address sender)',
  'error ERC721InvalidReceiver(address receiver)',
])

/** ISP1ICS07Tendermint.clientState(), the tuple exactly as BadBridge.sol declares it. */
export const lightClientAbi = parseAbi([
  'struct TrustThreshold { uint8 numerator; uint8 denominator; }',
  'struct Height { uint64 revisionNumber; uint64 revisionHeight; }',
  'function clientState() view returns (string chainId, TrustThreshold trustLevel, Height latestHeight, uint32 trustingPeriod, uint32 unbondingPeriod, bool isFrozen, uint8 zkAlgorithm)',
])

/** Multicall3.aggregate3 as a payable write (viem's multicall3Abi marks it view, which writeContract refuses). */
export const multicall3WriteAbi = parseAbi([
  'struct Call3 { address target; bool allowFailure; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate3(Call3[] calls) payable returns (Result[] returnData)',
])
