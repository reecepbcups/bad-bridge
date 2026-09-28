import type { KidId } from '../chain/types'
import { deployment as activeDeployment, type Deployment } from '../config/deployments'

// The only place that knows where kid pictures live. Swap sources here.

const BUCKET_256 = 'https://badkidsweb.storage.googleapis.com/badkids/images/256'
const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs'
const IPFS_IMAGES = 'QmbGvE3wmxex8KiBbbvMjR8f9adR28s3XkiZSTuGmHoMHV'

/** Kids with a picture in public/demo-kids/ (copied from the mockup). The demo never touches the network. */
const DEMO_KIDS: ReadonlySet<KidId> = new Set([663, 3838, 4801, 6413, 8073, 8783, 9176, 9254])

/**
 * Picture URLs for a kid, best first: badkids.com's 256px thumbnail, then the original on IPFS.
 * Try them in order and fall back on error. Empty means no picture: show the blank art box.
 */
export function kidImage(id: KidId, deployment: Deployment = activeDeployment): string[] {
  if (!Number.isInteger(id) || id < 0) return []
  if (deployment.demo) {
    return DEMO_KIDS.has(id) ? [`${import.meta.env.BASE_URL}demo-kids/${id}.jpg`] : []
  }
  return [`${BUCKET_256}/${id}.jpg`, `${IPFS_GATEWAY}/${IPFS_IMAGES}/${id}.jpg`]
}
