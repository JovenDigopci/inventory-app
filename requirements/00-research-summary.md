# Research Summary - Decant Perfume Inventory Management

## Purpose

This document summarizes the research used to define the requirements for an inventory management system for a shop selling decant perfumes. The system must track perfume liquid by milliliters, deduct sold volume automatically, track costs, and show whether the shop is earning profit.

## Recommended Operating Model

The system should use a perpetual inventory model. Instead of only storing a final stock number, every inventory change must create a movement record. Receiving perfume, producing decants, selling an order, wasting liquid, correcting a count, or returning stock must all be recorded as traceable events.

For perfume inventory, the base inventory unit for fragrance liquid is milliliters, but the system must also support selling whole bottles in the future. Full bottles can be stored as source stock for decanting, sellable bottle stock, or both depending on owner setup. Decants are sold as variants such as 1ml, 2ml, 3ml, 5ml, and 10ml. Full bottles are sold as unit-based variants such as 50ml bottle or 100ml bottle. When an order sells a 5ml decant, the system deducts 5ml plus any configured wastage or overfill allowance. When an order sells a full bottle, the system deducts one sellable bottle unit and also removes that bottle's ml from available liquid stock if the bottle was tracked as part of liquid inventory.

## Key Findings

### General Inventory Management

- Inventory management should help avoid selling products that are out of stock, show stock levels, allow adjustments, and provide inventory reports.
- Item records should include SKU, barcode, product name, variants, cost, price, supplier, location, and active status.
- Stock adjustments should require reason codes such as stock received, recount, damage, theft/loss, return, spill, evaporation, and admin correction.
- Low-stock thresholds should alert the owner before popular perfumes, atomizers, labels, and packaging materials run out.
- Inventory reports should include stock on hand, stock value, inventory movement history, adjustment history, low-stock items, daily sales, sell-through, and margin.

### Decant Perfume Behavior

- Track each source bottle or flacon separately with total ml, remaining ml, purchase cost, landed cost, supplier, purchase date, opened date, and batch/lot code.
- Track each sellable product as a variant connected to a fragrance master record. Variant types must include decant and full bottle.
- Full bottle variants should track bottle size ml, unit quantity, unit price, and unit cost. A bottle can be reserved for full-bottle sale or opened for decanting, but the system must prevent the same bottle from being sold whole after it has been opened for decants.
- Use cost per ml for perfume costing: `(bottle cost + direct landed costs) / usable ml`.
- Add packaging costs to COGS, including atomizer/vial, cap, label, pouch, box, and other direct fulfillment materials.
- Track wastage separately from sales so the owner can distinguish normal business loss from actual revenue-generating usage.
- Separate physical ml, sellable ml, reserved ml, wasted ml, and accounting cost.

## Recommended Formula Rules

```text
available_decants(size_ml) = floor((remaining_ml - reserved_ml - safety_buffer_ml) / size_ml)

available_bottles(bottle_size_ml) = count(unopened_sellable_bottles_for_size)

cost_per_ml = (purchase_cost + landed_costs) / usable_ml

usable_ml = bottle_size_ml - expected_wastage_ml

sale_deduction_ml = decant_size_ml + overfill_allowance_ml

full_bottle_sale_deduction = 1 bottle unit and bottle_size_ml liquid availability

liquid_cogs = sold_ml * cost_per_ml

total_cogs = liquid_cogs + atomizer_cost + label_cost + packaging_cost + direct_fulfillment_cost

gross_profit = selling_price - total_cogs

gross_margin_percent = (gross_profit / selling_price) * 100
```

## Recommended Technology Stack

- Frontend: HTML, CSS, and JavaScript.
- Backend: Node.js with Express.
- Database: MySQL Community Server.
- Reason: This keeps frontend and backend development in JavaScript, which is beginner-friendly because the owner/developer does not need to learn separate languages for browser and server work. MySQL is open source, relational, widely documented, and suitable for structured inventory, orders, costing, and audit logs.

## Research Sources

- Shopify inventory management: https://help.shopify.com/en/manual/products/inventory
- Shopify cost per item: https://help.shopify.com/en/manual/products/details/product-pricing/cost-per-item
- Square inventory tracking and adjustment reasons: https://squareup.com/help/us/en/article/8331-set-up-inventory-tracking
- Odoo units of measure: https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/configure/uom.html
- Odoo lot tracking: https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/product_tracking/lots.html
- Odoo reordering rules: https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/reordering_rules.html
- Odoo stock valuation: https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/reporting/aging.html
- MDN Express and Node.js introduction: https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Server-side/Express_Nodejs/Introduction
- MySQL official documentation: https://dev.mysql.com/doc/refman/8.4/en/what-is-mysql.html
- OWASP authentication guidance: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP authorization guidance: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP logging guidance: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- FTC cybersecurity basics for small business: https://www.ftc.gov/business-guidance/small-businesses/cybersecurity/basics
- IRS Publication 583 recordkeeping: https://www.irs.gov/publications/p583
