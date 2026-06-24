const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateCostPerMl,
  calculateDecantDeduction,
  calculateMargin
} = require('../src/services/inventoryMath');

test('calculates cost per ml from purchase and landed cost', () => {
  assert.equal(calculateCostPerMl(180, 20, 100), 2);
});

test('calculates decant deduction with wastage and fixed allowance', () => {
  const result = calculateDecantDeduction(5, 10, 3, 0.1);
  assert.equal(result.baseMl, 50);
  assert.equal(result.wastageMl, 2.5);
  assert.equal(result.totalMl, 52.5);
});

test('calculates gross margin', () => {
  const result = calculateMargin(20, 2, 18, 2);
  assert.equal(result.revenue, 40);
  assert.equal(result.totalCogs, 20);
  assert.equal(result.grossProfit, 20);
  assert.equal(result.grossMarginPercent, 50);
});
