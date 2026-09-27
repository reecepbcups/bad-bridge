import { Card } from '../chrome/Card'

export function NotFoundView({ path }: { path: string }) {
  return (
    <Card>
      <h2>Nothing here</h2>
      <p className="lede">
        There's no page at <span className="mono">{path}</span>. <a href="#/">Back to the bridge</a>
      </p>
    </Card>
  )
}
