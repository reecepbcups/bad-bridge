import './Stepper.css'

/** 0 = Send, 1 = Cross, 2 = Claim, 3 = all done. */
export type Step = 0 | 1 | 2 | 3

const STEPS = [
  { title: 'Send', sub: 'from Cosmos Hub' },
  { title: 'Cross', sub: 'we prove it' },
  { title: 'Claim', sub: 'on Ethereum' },
] as const

/** The three-step progress strip above the bridge card. */
export function Stepper({ current }: { current: Step }) {
  return (
    <ol className="steps" aria-label="Bridge steps">
      {STEPS.map((s, i) => {
        const state = i < current ? 'past' : i === current ? 'now' : undefined
        return (
          <li key={s.title} className={state} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="n" aria-hidden="true">
              {state === 'past' ? '✓' : i + 1}
            </span>
            <span>
              {s.title}
              <small>{s.sub}</small>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
