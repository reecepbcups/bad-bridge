import { describe, expect, it } from 'vitest'
import { DEPLOYMENTS } from '../config/deployments'
import { kidImage } from './image'

describe('kidImage', () => {
  it('tries the badkids thumbnail first, then IPFS', () => {
    expect(kidImage(9254, DEPLOYMENTS['reece-test'])).toEqual([
      'https://badkidsweb.storage.googleapis.com/badkids/images/256/9254.jpg',
      'https://gateway.pinata.cloud/ipfs/QmbGvE3wmxex8KiBbbvMjR8f9adR28s3XkiZSTuGmHoMHV/9254.jpg',
    ])
  })

  it('stays local in demo mode, and has nothing for kids without a demo picture', () => {
    expect(kidImage(9254, DEPLOYMENTS.demo)).toEqual(['/demo-kids/9254.jpg'])
    expect(kidImage(1, DEPLOYMENTS.demo)).toEqual([])
  })

  it('rejects ids that are not token ids', () => {
    expect(kidImage(-1, DEPLOYMENTS.badkids)).toEqual([])
    expect(kidImage(1.5, DEPLOYMENTS.badkids)).toEqual([])
  })
})
