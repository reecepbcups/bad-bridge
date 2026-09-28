import { describe, expect, it } from 'vitest'
import { DEPLOYMENTS, selectDeployment } from './deployments'

describe('selectDeployment', () => {
  it('honours ?demo only when the build allows it', () => {
    expect(selectDeployment('reece-test', '?demo', true)).toBe(DEPLOYMENTS.demo)
    expect(selectDeployment('reece-test', '?demo=paused,instant', true)).toBe(DEPLOYMENTS.demo)
    expect(selectDeployment('reece-test', '?demo', false)).toBe(DEPLOYMENTS['reece-test'])
    expect(selectDeployment('badkids', '?demo=paused', false)).toBe(DEPLOYMENTS.badkids)
  })

  it('an explicit demo build is still the demo', () => {
    expect(selectDeployment('demo', '', false)).toBe(DEPLOYMENTS.demo)
  })

  it('refuses an unknown preset', () => {
    expect(() => selectDeployment('mainnet', '', false)).toThrow(/is not one of/)
  })
})

describe('DEPLOYMENTS', () => {
  it('knows each collection size (ids run 1..size)', () => {
    expect(DEPLOYMENTS['reece-test'].collectionSize).toBe(18)
    expect(DEPLOYMENTS.badkids.collectionSize).toBe(9999)
    expect(DEPLOYMENTS.demo.collectionSize).toBe(9999)
  })

  it('pins the Eureka router and client id on every preset', () => {
    for (const d of Object.values(DEPLOYMENTS)) {
      expect(d.eth.router).toBe('0x3aF134307D5Ee90faa2ba9Cdba14ba66414CF1A7')
      expect(d.eth.clientId).toBe('cosmoshub-0')
    }
  })
})
