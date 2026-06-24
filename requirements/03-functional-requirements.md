# Functional Requirements

## FR-001 Authentication and User Roles

The system shall allow users to log in with individual accounts. Roles shall include owner/admin, manager, inventory staff, order staff, and read-only/accounting user.

## FR-002 Fragrance Catalog

The system shall allow admins to create, edit, deactivate, and search fragrance records. Required fields include brand, fragrance name, concentration, category, and active status.

## FR-002A Product Pictures

The system shall allow admins to upload, replace, and remove a product picture for each fragrance. Product pictures shall be displayed in catalog lists, product detail pages, order entry, and inventory screens to help staff identify the perfume quickly.

## FR-003 Sellable Variants

The system shall allow admins to define sellable variants by variant type, ml size, SKU, barcode, price, and active status. Supported variant types shall include decant and full bottle.

## FR-004 Source Bottle Inventory

The system shall track each source bottle separately with fragrance, supplier, purchase date, bottle size ml, remaining ml, purchase cost, landed cost, cost per ml, batch/lot code, opened date, and location.

## FR-004A Full Bottle Sales Stock

The system shall allow unopened bottles to be marked as sellable full-bottle stock. The system shall prevent a bottle from being sold whole after it has been opened or consumed for decanting.

## FR-005 Packaging Inventory

The system shall track packaging supplies such as atomizers, caps, labels, boxes, pouches, and stickers as unit-based inventory items.

## FR-006 Receiving Stock

The system shall support receiving source bottles and packaging supplies. Receiving shall create stock movement records and update available stock.

## FR-007 Decant Batch Production

The system shall allow staff to create decant batches by selecting source bottle, decant size, quantity, wastage rule, and packaging supplies. Completion shall deduct source ml, deduct packaging units, and increase finished decant stock.

## FR-008 Automatic Ml Deduction on Sale

The system shall automatically deduct sold ml or bottle units when an order is fulfilled. If finished decant stock exists, the system shall consume finished stock. If made-to-order is enabled, the system shall reserve or deduct source ml according to the configured workflow. If a full-bottle variant is sold, the system shall deduct one unopened sellable bottle unit.

## FR-009 Wastage and Loss Tracking

The system shall support wastage reasons including spill, evaporation, test spray, overfill, damaged atomizer, contamination, sample/freebie, dead stock, and admin correction.

## FR-010 Orders

The system shall allow staff to create orders with customer details, order lines, sellable variants, quantities, prices, discounts, status, and notes.

## FR-011 Reservations

The system shall reserve stock for open orders to prevent overselling. Cancelling an order shall release reserved stock.

## FR-012 Fulfillment

The system shall support pick, pack, and fulfilled statuses. Fulfillment shall finalize stock consumption and costing.

## FR-013 Cost Tracking

The system shall calculate liquid COGS, packaging COGS, total COGS, gross profit, and gross margin for each order line and report period.

## FR-014 Suppliers

The system shall manage supplier records with name, contact details, lead time, payment terms, preferred items, and notes.

## FR-015 Purchase Orders

The system shall allow admins to create purchase orders, add items, track ordered quantities, receive partial quantities, and close or cancel purchase orders.

## FR-016 Low-Stock Alerts

The system shall show low-stock alerts for source fragrance ml, unopened full-bottle units, finished decants, and packaging supplies based on configurable thresholds.

## FR-017 Inventory Adjustments

The system shall allow permitted users to adjust source ml, finished decant units, and packaging units. A reason code shall be required for every adjustment.

## FR-018 Cycle Counts

The system shall support cycle counts by product, fragrance, category, location, or SKU range. Count variances shall require review before posting adjustments.

## FR-019 Audit Trail

The system shall log every create, update, delete/archive, stock movement, role change, cost change, report export, and sensitive action with user, timestamp, action, entity, reference, and before/after summary.

## FR-020 Reports

The system shall provide reports for:

- Current stock on hand.
- Low-stock and out-of-stock items.
- Source bottle remaining ml.
- Full bottle stock.
- Finished decant stock.
- Packaging stock.
- Inventory valuation.
- Stock movement history.
- Adjustment and wastage history.
- Sales by date, fragrance, size, and channel.
- Gross profit and margin.
- Slow-moving and fast-moving fragrances.
- Purchase order status.
- User activity and audit logs.

## FR-021 CSV Import and Export

The system shall support CSV import for initial products, variants, suppliers, and opening stock. The system shall support CSV export for inventory, orders, sales, reports, and audit data.

## FR-022 Search

The system shall support search by SKU, barcode, fragrance name, brand, supplier, category, order number, and customer details.
