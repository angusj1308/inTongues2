import assert from 'node:assert/strict'
import { calculatePassNavLayout } from '../src/components/listen/passNavLayout.js'

const cases = [
  {
    input: { playerBottom: 200, viewportHeight: 800, navHeight: 40 },
    expectedTop: 500,
    expectedReserve: 64,
  },
  {
    input: { playerBottom: -20, viewportHeight: 200, navHeight: 180 },
    expectedTop: 8,
    expectedReserve: 204,
  },
  {
    input: { playerBottom: 760, viewportHeight: 800, navHeight: 60 },
    expectedTop: 772,
    expectedReserve: 84,
  },
]

cases.forEach(({ input, expectedTop, expectedReserve }) => {
  const result = calculatePassNavLayout(input)
  assert.equal(result.top, expectedTop)
  assert.equal(result.reserve, expectedReserve)
})

console.log('pass nav layout calculation ok')
