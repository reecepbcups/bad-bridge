import './Stepper.css'

/** 0 = Send, 1 = Cross, 2 = Claim, 3 = all done. */
export type Step = 0 | 1 | 2 | 3

// COPY: stepper subtitles
const STEPS = [
  { title: 'Send', sub: 'from the Hub' },
  { title: 'Cross', sub: 'catch up, prove' },
  { title: 'Claim', sub: 'on Ethereum' },
] as const

/** The three-step progress strip above the bridge card. Its own landmark, since it sits outside <main>. */
export function Stepper({ current }: { current: Step }) {
  return (
    <section className="steps-wrap" aria-label="Bridge steps">
      <ol className="steps">
        {STEPS.map((s, i) => {
          const state = i < current ? 'past' : i === current ? 'now' : undefined
          return (
            <li key={s.title} className={state} aria-current={state === 'now' ? 'step' : undefined}>
              <span className="n" aria-hidden="true">
                {state === 'past' ? '✓' : i + 1}
              </span>
              <span>
                {s.title}
                {state === 'past' && <span className="sr-only"> (done)</span>}
                <small>{s.sub}</small>
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
