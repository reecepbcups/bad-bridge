import { Card } from '../chrome/Card'
import { useTitle } from '../useTitle'

export function NotFoundView({ path }: { path: string }) {
  useTitle('Nothing here')
  return (
    <Card>
      <h2>Nothing here</h2>
      <p className="lede">
        There's no page at <span className="mono">{path}</span>. <a href="#/">Back to the bridge</a>
      </p>
    </Card>
  )
}
