import { describe, expect, it } from 'vitest'
import { sharedHost } from './host'

const at = (url: string) => {
  const u = new URL(url)
  return sharedHost({ hostname: u.hostname, pathname: u.pathname })
}

describe('sharedHost', () => {
  it('allows a dedicated origin and subdomain gateways', () => {
    expect(at('https://bridge.badkids.example/')).toBeNull()
    expect(at('https://bridge.badkids.example/index.html')).toBeNull()
    expect(at('http://localhost:5173/')).toBeNull()
    expect(at('https://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi.ipfs.dweb.link/')).toBeNull()
    expect(at('https://k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8.ipns.dweb.link/')).toBeNull()
    expect(at('https://user.github.io/')).toBeNull()
  })

  it('refuses /ipfs/ and /ipns/ paths on any host', () => {
    expect(at('https://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/')).toBe('ipfs-path')
    expect(at('https://gateway.pinata.cloud/ipfs/Qm123/index.html')).toBe('ipfs-path')
    expect(at('https://my-node.example/ipns/bridge.eth/')).toBe('ipfs-path')
    expect(at('https://dweb.link/IPFS/Qm123/')).toBe('ipfs-path')
  })

  it('refuses known path gateways even off an /ipfs/ path', () => {
    for (const host of ['ipfs.io', 'dweb.link', 'www.dweb.link', 'gateway.pinata.cloud', 'cloudflare-ipfs.com', 'IPFS.IO', 'ipfs.io.']) {
      expect(at(`https://${host}/`), host).toBe('path-gateway')
    }
  })

  it('refuses a GitHub project page, but not a user page at the root', () => {
    expect(at('https://user.github.io/bad-bridge/')).toBe('github-pages')
    expect(at('https://user.github.io/bad-bridge/index.html')).toBe('github-pages')
    expect(at('https://user.github.io/index.html')).toBeNull()
  })

  it("doesn't match look-alikes", () => {
    expect(at('https://notipfs.io/')).toBeNull()
    expect(at('https://ipfs.io.example/')).toBeNull()
    expect(at('https://bridge.example/ipfsx/')).toBeNull()
    expect(at('https://github.io.example/app/')).toBeNull()
  })
})
