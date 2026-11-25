// Runs tests/index.html in headless Chrome and exits with 1 if a test fails.
// Uses the installed Chrome (preinstalled on GitHub's ubuntu runners), so no
// browser is downloaded. Usage: node tests/run.mjs
import { chromium } from 'playwright-core'

const testPage = new URL('index.html', import.meta.url).href
const browser = await chromium.launch({ channel: 'chrome' })
let result
try {
  const page = await browser.newPage()
  page.on('pageerror', error => console.error('Page error:', error.message))
  await page.goto(testPage)
  const handle = await page.waitForFunction(() => globalThis.qunitResult, null, {
    timeout: 60_000
  })
  result = await handle.jsonValue()
} finally {
  await browser.close()
}

for (const test of result.failures) {
  console.log(`\n✗ ${test.fullName.join(' › ')}`)
  for (const error of test.errors) {
    console.log(`  ${error.message ?? 'failed'}`)
    console.log(`    expected: ${JSON.stringify(error.expected)}`)
    console.log(`    actual:   ${JSON.stringify(error.actual)}`)
  }
}

const { passed, failed, skipped, total } = result.testCounts
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped, ${total} total`)
process.exit(result.status === 'passed' ? 0 : 1)
