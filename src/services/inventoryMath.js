function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function roundMl(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

function calculateCostPerMl(purchaseCost, landedCost, usableMl) {
  if (Number(usableMl) <= 0) return 0;
  return roundMoney((Number(purchaseCost || 0) + Number(landedCost || 0)) / Number(usableMl));
}

function calculateDecantDeduction(sizeMl, quantity, wastagePercent = 0, fixedAllowanceMl = 0) {
  const baseMl = Number(sizeMl) * Number(quantity);
  const wastageMl = baseMl * (Number(wastagePercent || 0) / 100);
  const allowanceMl = Number(fixedAllowanceMl || 0) * Number(quantity);
  return {
    baseMl: roundMl(baseMl),
    wastageMl: roundMl(wastageMl + allowanceMl),
    totalMl: roundMl(baseMl + wastageMl + allowanceMl)
  };
}

function calculateMargin(unitPrice, quantity, liquidCogs, packagingCogs = 0) {
  const revenue = Number(unitPrice || 0) * Number(quantity || 0);
  const totalCogs = Number(liquidCogs || 0) + Number(packagingCogs || 0);
  const grossProfit = revenue - totalCogs;
  return {
    revenue: roundMoney(revenue),
    totalCogs: roundMoney(totalCogs),
    grossProfit: roundMoney(grossProfit),
    grossMarginPercent: revenue > 0 ? roundMoney((grossProfit / revenue) * 100) : 0
  };
}

module.exports = {
  roundMoney,
  roundMl,
  calculateCostPerMl,
  calculateDecantDeduction,
  calculateMargin
};
