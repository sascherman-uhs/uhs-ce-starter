import { strict as assert } from 'node:assert'
import { getPublicAppUrl } from './public-url'

// getPublicAppUrl() reads process.env.CE_PUBLIC_APP_URL at CALL time (by design —
// see public-url.ts doc comment), so we can mutate the env between invocations.

const PROD = 'https://ce.example.com'

// Test 1: unset -> production fallback (zero-config correctness)
delete process.env.CE_PUBLIC_APP_URL
assert.equal(getPublicAppUrl(), PROD, 'unset -> production fallback')

// Test 2: explicit non-local override is honored
process.env.CE_PUBLIC_APP_URL = 'https://staging.example.com'
assert.equal(getPublicAppUrl(), 'https://staging.example.com', 'honors override')

// Test 3: localhost -> THROWS, message includes "localhost" AND "durable"
process.env.CE_PUBLIC_APP_URL = 'http://localhost:3001'
assert.throws(
  () => getPublicAppUrl(),
  (e: unknown) =>
    e instanceof Error &&
    e.message.includes('localhost') &&
    e.message.includes('durable'),
  'localhost -> throws with localhost+durable message'
)

// Test 4: 127.0.0.1 loopback -> THROWS
process.env.CE_PUBLIC_APP_URL = 'http://127.0.0.1:3001'
assert.throws(() => getPublicAppUrl(), /localhost/, '127.0.0.1 -> throws')

// Test 5: 0.0.0.0 -> THROWS
process.env.CE_PUBLIC_APP_URL = 'http://0.0.0.0:3001'
assert.throws(() => getPublicAppUrl(), /localhost/, '0.0.0.0 -> throws')

// Test 6: trailing slash stripped so callers can template `${url}/path`
process.env.CE_PUBLIC_APP_URL = 'https://ce.example.com/'
assert.equal(getPublicAppUrl(), PROD, 'trailing slash stripped')

// cleanup
delete process.env.CE_PUBLIC_APP_URL

console.log('lib/public-url.ts: all assertions passed')
