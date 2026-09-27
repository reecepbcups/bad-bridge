import { expect, test } from '@playwright/test'
import { BRIDGE, DEMO, DEMO_ETH, DEMO_OFF, OTHER_HUB, skipAhead, trackErrors } from './support'

// My kids: lookups, live rows, claim-all in one tx, share links, the single-kid page and About.

test('look up an address, then claim everything that is ready in one tx', async ({ page, context }) => {
  const errors = trackErrors(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(`${DEMO_OFF}#/kids`)
  await expect(page.getByText('Who are we looking for?')).toBeVisible()

  // lowercase works; the URL gets the checksummed form
  await page.getByLabel('Ethereum address, Hub address or kid number').fill(DEMO_ETH.toLowerCase())
  await page.getByRole('button', { name: 'Look up' }).click()
  await expect(page).toHaveURL(new RegExp(`#/kids/${DEMO_ETH}$`))
  await expect(page.getByRole('heading', { level: 2, name: 'Kids for 0x8f3a…c21d' })).toBeVisible()

  const list = page.getByRole('list', { name: 'Kids on the bridge' })
  const row = (id: number) => list.getByRole('listitem').filter({ hasText: `#${id}` }).first()
  await expect(row(9254).getByText('ready to claim', { exact: true })).toBeVisible()
  await expect(row(8783).getByText('crossing', { exact: true })).toBeVisible()
  await expect(row(8073).getByText('home on Ethereum', { exact: true })).toBeVisible()
  await expect(row(8783)).toContainText('Sent 22 min ago · Making the proof')
  await expect(row(9254)).toContainText('Sent Sep 26, 9:12 pm')
  await expect(row(8073).getByRole('link', { name: 'View #8073 on Etherscan' })).toHaveAttribute(
    'href',
    `https://etherscan.io/nft/${BRIDGE}/8073`,
  )

  // what's happening, in detail
  await row(8783).getByText("What's happening?").click()
  await expect(row(8783).locator('[aria-current="step"]')).toContainText('Making the proof')

  // the proof for #8783 lands: two ready, one tx claims both
  await skipAhead(page)
  await expect(page.getByText('2 ready', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Claim all 2' }).click()
  // no Ethereum wallet yet: the sheet asks for one first
  await page.getByRole('dialog', { name: 'Connect Ethereum' }).getByRole('button', { name: 'Connect MetaMask' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'My kids' })).toBeVisible()
  await page.getByRole('button', { name: 'Claim all 2' }).click()
  await expect(page.getByText('3 home', { exact: true })).toBeVisible()
  await expect(page.getByRole('status').getByText('Claimed #8783 & #9254')).toBeVisible()
  await expect(page.getByRole('button', { name: /Claim/ })).toHaveCount(0)

  // share link
  await page.getByRole('button', { name: 'Copy share link' }).click()
  await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toMatch(new RegExp(`\\?demo=paused,instant,disconnected#/kids/${DEMO_ETH}$`))
  expect(errors).toEqual([])
})

test('look up by Hub address and by kid number', async ({ page }) => {
  await page.goto(`${DEMO}#/kids`)
  const box = page.getByLabel('Ethereum address, Hub address or kid number')

  await box.fill('hello')
  await page.getByRole('button', { name: 'Look up' }).click()
  await expect(page.getByRole('alert')).toContainText('Paste an Ethereum address (0x…), a Hub address (cosmos1…) or a kid number')
  await expect(box).toHaveAttribute('aria-invalid', 'true')

  await box.fill(OTHER_HUB)
  await page.getByRole('button', { name: 'Look up' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Kids for cosmos1qa3…lqk8' })).toBeVisible()
  await expect(page.getByText('Every kid this Hub address sent', { exact: false })).toBeVisible()
  for (const id of [9254, 8783, 1234, 42]) await expect(page.getByRole('link', { name: `#${id}`, exact: true })).toBeVisible()

  await box.fill('#1234')
  await page.getByRole('button', { name: 'Look up' }).click()
  await expect(page).toHaveURL(/#\/kid\/1234$/)
  await expect(page.getByRole('heading', { level: 2, name: '#1234' })).toBeVisible()
  await expect(page.getByText('home on Ethereum', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'OpenSea ↗' })).toHaveAttribute('href', `https://opensea.io/assets/ethereum/${BRIDGE}/1234`)
})

test('a bad address in the URL says so instead of searching', async ({ page }) => {
  await page.goto(`${DEMO}#/kids/0x1234`)
  await expect(page.getByRole('alert')).toContainText("That doesn't look like an Ethereum address")
  await expect(page.getByRole('list', { name: 'Kids on the bridge' })).toHaveCount(0)
})

test('an address with nothing on the bridge gets an empty state', async ({ page }) => {
  await page.goto(`${DEMO}#/kids/0x000000000000000000000000000000000000dEaD`)
  await expect(page.getByText('No kids on the bridge for this address')).toBeVisible()
})

test('network trouble shows a friendly error with a retry', async ({ page }) => {
  await page.goto(`${DEMO}#/kid/8783`)
  await expect(page.getByText('crossing', { exact: true })).toBeVisible()
  await page.evaluate(() => window.badBridgeDemo?.setOffline(true))
  // same page, new route: this kid's reads all fail
  await page.getByRole('navigation', { name: 'Demo controls' }).getByRole('link', { name: 'about' }).click()
  await page.evaluate(() => (location.hash = '#/kid/9254'))
  await expect(page.getByText("Can't reach the chains")).toBeVisible()
  // still offline: Try again tries, fails the same way
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText("Can't reach the chains")).toBeVisible()
  // back online: the next refresh recovers on its own
  await page.evaluate(() => window.badBridgeDemo?.setOffline(false))
  await expect(page.getByText('ready to claim', { exact: true })).toBeVisible()
  await expect(page.getByText("Can't reach the chains")).toHaveCount(0)
})

test('a single kid page works for anyone, with its facts and a claim button', async ({ page }) => {
  await page.goto(`${DEMO_OFF}#/kid/42`)
  await expect(page.getByRole('heading', { level: 2, name: '#42' })).toBeVisible()
  await expect(page.getByText('ready to claim', { exact: true })).toBeVisible()
  await expect(page.getByText('Headed to')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Every kid headed there' })).toHaveAttribute('href', /#\/kids\/0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed$/)
  await expect(page.getByRole('button', { name: 'Claim #42' })).toBeVisible()
  await expect(page.getByText('Anyone can claim; it always goes to 0x5aAe…eAed.')).toBeVisible()
})

test('stuck prover: after 30 minutes proving, a friendly note links the README', async ({ page }) => {
  const start = new Date('2026-09-27T17:00:00Z')
  await page.clock.setFixedTime(start)
  await page.goto(`${DEMO}#/kid/8783`)
  await expect(page.locator('[aria-current="step"]')).toContainText('Making the proof')
  await expect(page.getByText('The prover looks slow')).toHaveCount(0)
  // this browser first saw it proving at `start`; 31 minutes later it still is
  await page.clock.setFixedTime(new Date(start.getTime() + 31 * 60_000))
  await page.evaluate(() => window.badBridgeDemo?.advance(0))
  await expect(page.getByText('The prover looks slow right now.', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'How to run a prover ↗' })).toHaveAttribute('href', 'https://github.com/reecepbcups/bad-bridge#readme')
})

test('About lists the contracts from the deployment, with live health', async ({ page }) => {
  await page.goto(`${DEMO}#/about`)
  const contracts = page.locator('dl.addrs')
  await expect(contracts.getByRole('link', { name: 'cosmos1zr8k7ch8e9g7lqcgcd0peaklj43ymxvcusvqk7ver4zaqgdvragq8gumtv' })).toHaveAttribute(
    'href',
    'https://www.mintscan.io/cosmos/wasm/contract/cosmos1zr8k7ch8e9g7lqcgcd0peaklj43ymxvcusvqk7ver4zaqgdvragq8gumtv',
  )
  await expect(contracts.getByRole('link', { name: BRIDGE })).toHaveAttribute('href', `https://etherscan.io/address/${BRIDGE}`)
  await expect(contracts.getByRole('link', { name: '0x4bB8A05D5b40dF7a3B97770E1943461B681B62E9' })).toBeVisible()
  await expect(contracts.getByText('Bad Kids (Cosmos Hub)')).toBeVisible()
  await expect(contracts.getByRole('link', { name: 'github.com/reecepbcups/bad-bridge' })).toBeVisible()
  await expect(page.getByText('This is the demo: nothing here touches a real chain.', { exact: false })).toBeVisible()

  const health = page.getByLabel('Bridge health')
  await expect(health).toContainText('Running')
  await expect(health).toContainText('Ethereum is about 10 min behind the Hub')
  await page.getByText('Why does it take a while?').click()
  await expect(page.getByText("right now that's about 10 min.", { exact: false })).toBeVisible()
})
