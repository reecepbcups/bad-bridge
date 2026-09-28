import { expect, test } from '@playwright/test'
import {
  BRIDGE,
  DEMO,
  DEMO_ETH,
  DEMO_HUB,
  DEMO_OFF,
  demoReady,
  MULTICALL3,
  pickAndReview,
  sendButton,
  skipAhead,
  trackErrors,
} from './support'

// The bridge flow end to end on the demo adapter: pick → review → crossing → claim → done, and the ways
// Send refuses or fails.

test('send and claim say where the transaction is, from the writers’ own progress', async ({ page }) => {
  // no `instant`: the demo wallet takes a moment to "sign", like a real one
  const errors = trackErrors(page)
  await page.goto('./?demo=paused#/')
  await demoReady(page)
  await pickAndReview(page, [9176])
  await page.getByLabel('Got it, one way only').check()
  await expect(sendButton(page)).toHaveText('Send 1 kid')
  await sendButton(page).click()
  // pending: the button says where it is, keeps focus (no drop to <body>), and a status line announces it
  await expect(sendButton(page)).toHaveText('Check Keplr…')
  await expect(sendButton(page)).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: 'Approve it in Keplr. Once signed, it lands on the Hub in a few seconds.' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Crossing the bridge…' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Now: waiting for Ethereum to catch up' })).toBeAttached()
  await expect(page).toHaveTitle('Crossing… · Bad Bridge')

  await skipAhead(page)
  await expect(page.getByRole('status').filter({ hasText: 'Now: Ethereum caught up, now being proven' })).toBeAttached()
  await skipAhead(page)
  await expect(page.getByRole('heading', { level: 2, name: 'It made it across!' })).toBeVisible()
  await page.getByRole('button', { name: 'Claim 1 kid' }).click()
  const claiming = page.getByRole('button', { name: 'Check MetaMask…' })
  await expect(claiming).toBeDisabled()
  await expect(claiming).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: 'Approve it in MetaMask.' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Welcome to Ethereum, #9176' })).toBeVisible()
  expect(errors).toEqual([])
})

test('happy path: connect both wallets, send 2 kids, cross, claim in one tx, done', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto(`${DEMO_OFF}#/`)

  // Hub wallet: the pick screen offers the wallets inline, with install links for missing ones
  const hubWallets = page.getByRole('list', { name: 'Cosmos Hub wallets' })
  await expect(hubWallets.getByRole('link', { name: /Get it.*Cosmostation/ })).toBeVisible()
  await hubWallets.getByRole('button', { name: 'Connect Keplr' }).click()
  await expect(page.getByRole('button', { name: /Cosmos Hub cosmos1q8m…3fxl/ })).toBeVisible()
  // the list went away with the connect: focus lands on the heading above the kids
  await expect(page.getByRole('heading', { level: 2, name: "Who's crossing?" })).toBeFocused()

  // pick two; #8073 already crossed, so it isn't in the pick at all
  await expect(page.getByRole('button', { name: /#8073/ })).toHaveCount(0)
  const kid = page.getByRole('button', { name: /^#9176 on the Hub/ })
  await kid.click()
  await expect(kid).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /^#6413 on the Hub/ }).click()
  await expect(page.getByText('2 kids picked')).toBeVisible()
  await page.getByRole('button', { name: 'Next →' }).click()

  // review: focus moves to the new heading, Send says why it's off
  const heading = page.getByRole('heading', { level: 2, name: 'Where do they land?' })
  await expect(heading).toBeFocused()
  await expect(sendButton(page)).toBeDisabled()
  await expect(page.getByText('Add the Ethereum address your kids should land at.')).toBeVisible()

  // Ethereum wallet through the connect sheet fills the recipient
  await page.getByRole('button', { name: 'Connect Ethereum to fill it in' }).click()
  await page.getByRole('dialog', { name: 'Connect Ethereum' }).getByRole('button', { name: 'Connect MetaMask' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Ethereum address')).toHaveValue(DEMO_ETH)
  // the connect button is gone: focus lands on the address it filled in
  await expect(page.getByLabel('Ethereum address')).toBeFocused()
  await expect(page.getByText('Filled in from MetaMask.')).toBeVisible()
  await expect(page.getByText('Tick “Got it, one way only” to send.')).toBeVisible()

  await page.getByLabel('Got it, one way only').check()
  await expect(page.getByText('≈ 0.00175 ATOM network fee.')).toBeVisible()
  await expect(page.getByText('Keplr asks you to sign once, for both kids.')).toBeVisible()
  await expect(sendButton(page)).toHaveText('Send 2 kids')
  await sendButton(page).click()

  // crossing: real stage details and a way back from any device
  await expect(page.getByRole('heading', { level: 2, name: 'Crossing the bridge…' })).toBeFocused()
  const steps = page.getByRole('region', { name: 'Bridge steps' })
  await expect(steps.locator('[aria-current="step"]')).toContainText('Cross')
  await expect(page.getByText('Right now Ethereum is about 10 min behind the Hub.', { exact: false })).toBeVisible()
  await expect(page.locator('a[href^="https://www.mintscan.io/cosmos/tx/"]').first()).toBeVisible()
  await expect(page.getByText(/\d+ blocks to go\./)).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'My kids' })).toHaveAttribute('href', `#/kids/${DEMO_ETH}`)
  await expect(page.getByRole('img', { name: /Your 2 kids on the bridge.*waiting for Ethereum to catch up/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy a link to check later' })).toBeVisible()

  // the demo relays, then proves
  await skipAhead(page)
  await expect(page.getByRole('img', { name: /now being proven/ })).toBeVisible()
  await expect(page.getByText('Ethereum has caught up; now the proof is being made.', { exact: false })).toBeVisible()
  await skipAhead(page)

  // claim: one tx for both
  await expect(page.getByRole('heading', { level: 2, name: 'They made it across!' })).toBeVisible()
  await expect(steps.locator('[aria-current="step"]')).toContainText('Claim')
  await expect(page.getByText('One Ethereum transaction claims both.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Claim 2 kids' }).click()

  // done: stamp, explorer links from the deployment
  await expect(page.getByRole('heading', { level: 2, name: 'Welcome to Ethereum, #9176 & #6413' })).toBeVisible()
  await expect(page.getByText('minted on Ethereum', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /^View on Etherscan/ })).toHaveAttribute('href', /^https:\/\/etherscan\.io\/tx\/0x[0-9a-f]{64}$/)
  await expect(page.getByRole('link', { name: /^#9176\b/ })).toHaveAttribute('href', `https://opensea.io/assets/ethereum/${BRIDGE}/9176`)
  await expect(page.getByRole('status').getByText(/Claimed (#9176 & #6413|#6413 & #9176)/)).toBeVisible()

  // bridge another: they've crossed, so they're gone from the pick entirely
  await page.getByRole('button', { name: 'Bridge another' }).click()
  await expect(page.getByRole('heading', { level: 2, name: "Who's crossing?" })).toBeVisible()
  await expect(page.getByRole('link', { name: /^#9176/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^#9176/ })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a batcher that claims for you skips straight to done', async ({ page }) => {
  await page.goto(`${DEMO}#/`)
  await pickAndReview(page, [663])
  await page.getByLabel('Got it, one way only').check()
  await sendButton(page).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Crossing the bridge…' })).toBeVisible()
  await skipAhead(page)
  await skipAhead(page)
  await expect(page.getByRole('heading', { level: 2, name: 'It made it across!' })).toBeVisible()
  // someone else claims #663
  await page.getByRole('link', { name: /My kids/ }).first().click()
  await page.getByRole('listitem').filter({ hasText: '#663' }).getByRole('button', { name: 'Claim' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: '#663' }).getByText('home on Ethereum', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Bridge a kid' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Welcome to Ethereum, #663' })).toBeVisible()
})

test.describe('Send refuses or fails', () => {
  test('UserRejected: a calm note, nothing sent, Send works again', async ({ page }) => {
    await page.goto(`${DEMO}#/`)
    await demoReady(page)
    await pickAndReview(page, [9176])
    await page.getByLabel('Got it, one way only').check()
    await expect(sendButton(page)).toHaveText('Send 1 kid')
    await page.evaluate(() => window.badBridgeDemo?.setFailNext('UserRejected'))
    await sendButton(page).click()
    const note = page.getByRole('alert').filter({ hasText: 'No worries' })
    await expect(note).toContainText('You said no in Keplr, so nothing happened.')
    await expect(page.getByRole('heading', { level: 2, name: 'Where do they land?' })).toBeVisible()
    await expect(sendButton(page)).toBeEnabled()
    await sendButton(page).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Crossing the bridge…' })).toBeVisible()
  })

  test('AlreadyBridged: the simulation says no, the wallet never opens, and the kid can be taken out', async ({ page }) => {
    await page.goto(`${DEMO}#/`)
    await demoReady(page)
    await pickAndReview(page, [9176, 6413])
    await page.getByLabel('Got it, one way only').check()
    await expect(sendButton(page)).toBeEnabled()
    // #9176 leaves from another tab
    await page.evaluate(
      ([hub, eth]) => window.badBridgeDemo?.commitSend(hub, [9176], eth),
      [DEMO_HUB, DEMO_ETH] as const,
    )
    await expect(page.getByRole('alert').filter({ hasText: '#9176 already crossed' })).toBeVisible()
    await expect(sendButton(page)).toBeDisabled()
    await expect(page.getByText('The Hub said no to this send (see above).')).toBeVisible()
    await page.getByRole('button', { name: 'Take #9176 out' }).click()
    await expect(sendButton(page)).toHaveText('Send 1 kid')
    await expect(sendButton(page)).toBeEnabled()
  })

  test('a frozen light client shows the stuck banner and hard-disables Send', async ({ page }) => {
    await page.goto(`${DEMO}#/`)
    await pickAndReview(page, [9176])
    await page.getByLabel('Got it, one way only').check()
    await expect(sendButton(page)).toBeEnabled()

    const bar = page.getByRole('navigation', { name: 'Demo controls' })
    await bar.getByRole('button', { name: 'more' }).click()
    await bar.getByRole('button', { name: 'frozen' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'The bridge is stuck for now' })).toBeVisible()
    await expect(sendButton(page)).toBeDisabled()
    await expect(page.getByText('The bridge is stuck for now, so sending is off.')).toBeVisible()

    await bar.getByRole('button', { name: 'frozen' }).click()
    await expect(page.getByText('The bridge is stuck for now')).toHaveCount(0)
    await expect(sendButton(page)).toBeEnabled()
  })

  test('a contract recipient needs the second checkbox', async ({ page }) => {
    await page.goto(`${DEMO}#/`)
    await pickAndReview(page, [9176])
    await page.getByLabel('Got it, one way only').check()
    await page.getByLabel('Ethereum address').fill(MULTICALL3)
    await expect(page.getByText("That's a contract, not a wallet.")).toBeVisible()
    await expect(page.getByText("This isn't your connected wallet")).toBeVisible()
    await expect(sendButton(page)).toBeDisabled()
    await expect(page.getByText('Tick “This address can hold NFTs” to send to a contract.')).toBeVisible()
    await page.getByLabel('This address can hold NFTs').check()
    // "Got it" was for the old address, so it un-ticked when the address changed
    await expect(page.getByLabel('Got it, one way only')).not.toBeChecked()
    await page.getByLabel('Got it, one way only').check()
    await expect(sendButton(page)).toBeEnabled()
    // changing the address un-ticks it
    await page.getByLabel('Ethereum address').fill(BRIDGE)
    await expect(page.getByLabel('This address can hold NFTs')).not.toBeChecked()
    await expect(sendButton(page)).toBeDisabled()
  })

  test('bad addresses are blocked on every keystroke', async ({ page }) => {
    await page.goto(`${DEMO}#/`)
    await pickAndReview(page, [9176])
    await page.getByLabel('Got it, one way only').check()
    const input = page.getByLabel('Ethereum address')

    // one character's case flipped: fails EIP-55
    await input.fill('0x8f3a41b7e2D09C6A5E1f7b3C2d9A0e4f6b8Cc21D')
    await expect(page.getByText("The capital letters don't match this address's checksum", { exact: false })).toBeVisible()
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(sendButton(page)).toBeDisabled()
    await expect(page.getByText('Fix the Ethereum address first.')).toBeVisible()

    await input.fill(`0x${'0'.repeat(40)}`)
    await expect(page.getByText("That's the zero address. Kids sent there are gone forever.")).toBeVisible()
    await input.fill('0x8f3a')
    await expect(page.getByText("That doesn't look like an Ethereum address (0x + 40 characters).")).toBeVisible()
    await expect(sendButton(page)).toBeDisabled()

    // all-lowercase has no checksum to fail
    await input.fill(DEMO_ETH.toLowerCase())
    await expect(input).toHaveAttribute('aria-invalid', 'false')
    await expect(sendButton(page)).toBeEnabled()
  })
})

test('claim on the wrong network: switch, then claim', async ({ page }) => {
  await page.goto('./?demo=paused,instant,wrongchain#/kids')
  const row = page.getByRole('listitem').filter({ hasText: '#9254' })
  await expect(page.getByText('MetaMask is on another network.')).toBeVisible()
  await expect(row.getByRole('button', { name: 'Claim' })).toBeDisabled()
  await page.getByRole('button', { name: 'Switch to Ethereum' }).click()
  await expect(row.getByRole('button', { name: 'Claim' })).toBeEnabled()
  await row.getByRole('button', { name: 'Claim' }).click()
  await expect(row.getByText('home on Ethereum', { exact: true })).toBeVisible()
})

test('a claim that fails with WrongChain explains itself', async ({ page }) => {
  await page.goto(`${DEMO}#/kids`)
  await demoReady(page)
  await page.evaluate(() => window.badBridgeDemo?.setFailNext('WrongChain'))
  await page.getByRole('listitem').filter({ hasText: '#9254' }).getByRole('button', { name: 'Claim' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Wrong network' })).toContainText('Switch it to Ethereum mainnet')
})

test('keyboard: tiles toggle with Space, focus lands on each new heading', async ({ page }) => {
  await page.goto(`${DEMO}#/`)
  const tile = page.getByRole('button', { name: /^#663 on the Hub/ })
  await tile.focus()
  await page.keyboard.press('Space')
  await expect(tile).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Space')
  await expect(tile).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Space')
  await page.getByRole('button', { name: 'Next →' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 2, name: 'Where do they land?' })).toBeFocused()
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'About' }).click()
  await expect(page.getByRole('heading', { level: 2, name: "What's the Bad Bridge?" })).toBeFocused()
})

test('big wallets: 60 tiles, then "show more"', async ({ page }) => {
  await page.goto('./?demo=paused,instant,many#/')
  const tiles = page.getByRole('group', { name: 'Your kids' }).locator('.kid')
  await expect(tiles).toHaveCount(60)
  await expect(page.getByText('95 more in this wallet')).toBeVisible()
  await page.getByRole('button', { name: 'Show 60 more' }).click()
  await expect(tiles).toHaveCount(120)
  await page.getByRole('button', { name: 'Show 35 more' }).click()
  await expect(tiles).toHaveCount(155)
  // pictures load lazily; kids without one get a doodle
  await expect(page.locator('.kids img').first()).toHaveAttribute('loading', 'lazy')
  await expect(page.getByRole('img', { name: 'Bad Kid #1000' })).toHaveCount(0) // decorative inside a labelled tile
  await expect(page.getByRole('button', { name: /^#1000 on the Hub/ }).locator('svg.doodle')).toBeVisible()
})

test.describe('big wallets on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('Next stays in reach while scrolling the grid', async ({ page }) => {
    await page.goto('./?demo=paused,instant,many#/')
    const next = page.getByRole('button', { name: 'Next →' })
    await page.getByRole('button', { name: /^#1003 on the Hub/ }).click()
    for (const y of [0, 1500, 4000]) {
      await page.evaluate((top) => window.scrollTo({ top }), y)
      await expect(next).toBeInViewport({ ratio: 1 })
    }
    await expect(page.getByText('1 kid picked')).toBeInViewport()
  })

  test('find a kid by number, and pick at most 100', async ({ page }) => {
    await page.goto('./?demo=paused,instant,many#/')
    const find = page.getByLabel('Find a kid by number')
    const grid = page.getByRole('group', { name: 'Your kids' })
    await find.fill('#104')
    await expect(grid.locator('.kid')).toHaveCount(11) // #1040–#1049 and #1104
    await find.fill('77777')
    await expect(page.getByRole('status').filter({ hasText: 'No kid #77777 in this wallet.' })).toBeVisible()
    await find.fill('')

    await page.getByRole('button', { name: 'Show 60 more' }).click()
    const home = grid.getByRole('button', { name: / on the Hub/ })
    for (let i = 0; i < 100; i++) await home.nth(i).click()
    await expect(page.getByText('100 kids picked')).toBeVisible()
    await expect(page.getByText('· Up to 100 at a time')).toBeVisible()
    // the 101st is refused, and says why
    const extra = home.nth(100)
    await expect(extra).toHaveAttribute('aria-disabled', 'true')
    await extra.click({ force: true }) // aria-disabled: Playwright won't click it unforced
    await expect(extra).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByText('100 kids picked')).toBeVisible()
    // letting one go makes room again
    await home.nth(0).click()
    await expect(page.getByText('99 kids picked')).toBeVisible()
    await expect(page.getByText('Up to 100 at a time')).toHaveCount(0)
  })
})

test('not live yet: no escrow, no sending', async ({ page }) => {
  await page.goto('./?demo=paused,instant,notlive#/')
  await expect(page.getByRole('heading', { level: 2, name: "The bridge isn't open yet" })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next →' })).toHaveCount(0)
  // no steps to show for a bridge that isn't there, and real kids instead of doodles
  await expect(page.getByRole('region', { name: 'Bridge steps' })).toHaveCount(0)
  await expect(page.locator('.celebrate img')).toHaveCount(3)
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'About' }).click()
  await expect(page.getByText('not live yet')).toHaveCount(2)
})

test('reduced motion: walkers stand still at their stage', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${DEMO}#/`)
  await pickAndReview(page, [663])
  await page.getByLabel('Got it, one way only').check()
  await sendButton(page).click()
  const walker = page.locator('.scene .walker').first()
  // no tween: already at the catching-up anchor on first paint
  await expect(walker).toHaveAttribute('transform', /^translate\(196\.0,/)
  const animation = await page.locator('.scene .bob').first().evaluate((el) => getComputedStyle(el).animationName)
  expect(animation).toBe('none')
})
