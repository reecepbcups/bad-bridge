// Small display helpers shared by views.

/** "cosmos1q8m…3fxl" / "0x8f3a…c21d": enough to recognise, short enough for a chip. */
export function shortAddress(address: string): string {
  const head = address.startsWith('0x') ? 6 : address.indexOf('1') + 4
  return address.length > head + 6 ? `${address.slice(0, head)}…${address.slice(-4)}` : address
}

export function kidWord(n: number): string {
  return n === 1 ? 'kid' : 'kids'
}
