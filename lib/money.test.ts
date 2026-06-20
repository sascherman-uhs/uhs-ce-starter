import { strict as assert } from 'node:assert'
import { formatCents, dollarsToCents, MINUS_SIGN } from './money'

// formatCents
assert.equal(formatCents(0), '$0.00', 'zero')
assert.equal(formatCents(500), '$5.00', 'five dollars')
assert.equal(formatCents(2500), '$25.00', '25 dollars')
assert.equal(formatCents(2599), '$25.99', '25.99')
assert.equal(formatCents(1), '$0.01', 'one cent')
assert.equal(formatCents(99), '$0.99', '99 cents')
assert.equal(formatCents(100000), '$1000.00', '1000 dollars no separator')

// dollarsToCents
assert.equal(dollarsToCents('25'), 2500, 'integer dollars')
assert.equal(dollarsToCents('25.00'), 2500, 'two decimals')
assert.equal(dollarsToCents('25.99'), 2599, 'cents')
assert.equal(dollarsToCents('0'), 0, 'zero string')
assert.equal(dollarsToCents(''), 0, 'empty string')
assert.equal(dollarsToCents('$25.00'), 2500, 'leading dollar sign tolerated')
assert.equal(dollarsToCents('invalid'), 0, 'NaN guard')

// MINUS_SIGN
assert.equal(MINUS_SIGN, '−', 'is unicode minus U+2212')
assert.notEqual(MINUS_SIGN, '-', 'is NOT hyphen-minus')

console.log('lib/money.ts: all assertions passed')
