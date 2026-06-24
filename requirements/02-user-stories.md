# User Stories and Acceptance Criteria

## Epic 1 - Product Catalog

### Story 1: Create Fragrance Records

As an owner, I want to create fragrance records so all bottles, decants, and orders use consistent product information.

Acceptance criteria:

- Given I am an admin, when I create a fragrance, then I can enter brand, fragrance name, concentration, category, notes, description, and image.
- Given I add or edit a fragrance, when I upload a product picture, then the picture is saved and displayed in the product list, product details, order creation, and stock screens.
- Given I upload an invalid image file, then the system rejects it and explains the accepted file types and size limit.
- Given a fragrance already exists, when I create the same brand, name, and concentration, then the system warns me before saving.
- Given a fragrance is inactive, when staff search sellable products, then inactive products are hidden from selling workflows.

### Story 2: Manage Sellable Variants

As an owner, I want to define decant sizes and full-bottle variants so the system can sell perfume by ml or by bottle.

Acceptance criteria:

- Given a fragrance exists, when I add variants, then I can define decant sizes such as 1ml, 2ml, 3ml, 5ml, and 10ml, and full-bottle sizes such as 50ml and 100ml.
- Given a variant is created, when I save it, then SKU, variant type, size ml, selling price, and active status are required.
- Given a 10ml decant is sold, when inventory is posted, then the system deducts 10ml plus configured allowance from available fragrance stock.
- Given a full bottle is sold, when inventory is posted, then the system deducts one unopened bottle unit and marks that bottle unavailable for decanting.

## Epic 2 - Source Bottle Inventory

### Story 3: Add Source Bottle Stock

As an owner, I want to add source bottle stock so I know how much perfume is available for decanting.

Acceptance criteria:

- Given I receive a bottle, when I add stock, then I can enter supplier, purchase date, bottle size, purchase cost, landed cost, batch code, remaining ml, and location.
- Given multiple bottles exist for the same fragrance, when I view inventory, then each bottle is shown separately with remaining ml.
- Given a bottle is opened, when staff marks it opened, then opened date and opened-by user are recorded.
- Given a bottle is reserved for full-bottle sale, when staff attempts to use it for decanting, then the system blocks the action unless the reservation is released.

### Story 4: Track Remaining Volume

As an owner, I want remaining ml tracked per bottle so I can avoid overselling.

Acceptance criteria:

- Given a bottle has 42ml remaining, when staff produces or sells a 10ml decant, then the bottle balance decreases correctly.
- Given a bottle has insufficient ml, when staff tries to use it, then the system blocks the transaction unless admin override is enabled.
- Given a manual correction is saved, then a reason code and audit record are required.

### Story 5: Recommend FIFO Bottle Usage

As an owner, I want older opened bottles recommended first so stock is used consistently.

Acceptance criteria:

- Given multiple opened bottles exist, when staff creates a decant batch, then the system recommends the oldest opened bottle with enough ml.
- Given the recommended bottle does not have enough ml, then the system recommends the next eligible bottle.
- Given staff overrides the recommendation, then the reason and user are logged.

## Epic 3 - Decant Production

### Story 6: Create Decant Batch

As staff, I want to create a decant batch so filled atomizers are traceable.

Acceptance criteria:

- Given I start a batch, when I select fragrance, source bottle, decant size, and quantity, then the system calculates required ml.
- Given required ml exceeds available ml, when I save, then the system blocks the batch.
- Given a batch is completed, then source ml decreases and finished decant stock increases.

### Story 7: Account for Wastage

As an owner, I want wastage rules so inventory reflects real decanting loss.

Acceptance criteria:

- Given wastage is 3%, when staff produces ten 5ml decants, then the system deducts 51.5ml.
- Given a fixed overfill allowance is configured, when a decant is produced or sold, then the allowance is included in deduction.
- Given wastage is disabled, then only exact sold or produced ml is deducted.

### Story 8: Track Packaging Supplies

As an owner, I want atomizers, labels, caps, and pouches tracked so supplies do not run out.

Acceptance criteria:

- Given a batch uses 20 atomizers and 20 labels, when completed, then packaging stock decreases by 20 each.
- Given packaging is below threshold, then it appears in low-stock alerts.
- Given packaging is unavailable, then production shows a warning before completion.

## Epic 4 - Orders and Sales

### Story 9: Create Order

As staff, I want to create an order so the system can reserve and deduct stock.

Acceptance criteria:

- Given staff creates an order, when variants and quantities are added, then the system checks available stock.
- Given stock is available, then the order can be saved and stock becomes reserved.
- Given stock is unavailable, then the system blocks overselling unless admin override is enabled.

### Story 10: Automatic Ml Deduction

As an owner, I want sales to deduct fragrance ml or full bottle units automatically so inventory stays accurate.

Acceptance criteria:

- Given an order includes one 5ml decant, when the order is fulfilled, then 5ml plus allowance is deducted from source ml or finished stock is consumed.
- Given an order includes one 100ml full bottle, when the order is fulfilled, then one unopened 100ml bottle is deducted from sellable bottle stock.
- Given an order is cancelled before fulfillment, then reserved stock returns to available stock.
- Given an order is returned, then staff can choose whether returned stock is sellable, damaged, or discarded.

### Story 11: Made-to-Order Decants

As an owner, I want made-to-order decants so I can sell from source bottles without pre-filling all sizes.

Acceptance criteria:

- Given a variant has no finished stock but enough source ml, when an order is created, then the item is marked needs production.
- Given production is completed, then the order becomes fulfillable.
- Given source ml is insufficient, then the order cannot be accepted for that variant.

## Epic 5 - Costing and Profit

### Story 12: Track Bottle Cost

As an owner, I want to enter perfume purchase cost so cost per ml is calculated.

Acceptance criteria:

- Given I receive a 100ml bottle costing 2000, then cost per ml is 20 before wastage adjustment.
- Given landed costs are added, then cost per ml includes them.
- Given cost is missing, then reports flag the item as incomplete.

### Story 13: Track Profit Per Sale

As an owner, I want sales margin reports so I know if I am earning.

Acceptance criteria:

- Given an order is fulfilled, then the system calculates liquid COGS, packaging COGS, total COGS, gross profit, and margin.
- Given a full bottle is sold, then the system uses the bottle's unit cost plus direct selling or packaging cost to calculate COGS.
- Given I filter by fragrance, size, or date, then the report shows revenue, COGS, profit, and margin.
- Given a product is selling at low or negative margin, then it can be identified in reports.

## Epic 6 - Stock Control and Purchasing

### Story 14: Low-Stock Alerts

As an owner, I want low-stock alerts so I can reorder before stockouts.

Acceptance criteria:

- Given fragrance available ml falls below threshold, then it appears on the dashboard.
- Given unopened full-bottle units fall below threshold, then the bottle variant appears on the dashboard.
- Given finished decant stock falls below threshold, then it appears separately from source bottle alerts.
- Given packaging stock falls below threshold, then it appears in packaging alerts.

### Story 15: Purchase Orders

As an owner, I want purchase orders so buying stock is tracked.

Acceptance criteria:

- Given a low-stock item exists, when I create a purchase order, then supplier, item, last cost, and suggested quantity can be prefilled.
- Given items are received, then only received quantities increase stock.
- Given received quantity differs from ordered quantity, then the PO status shows partial, complete, or over-received.

## Epic 7 - Audit and Security

### Story 16: Inventory Adjustments

As staff, I want to adjust inventory with reasons so stock remains accurate.

Acceptance criteria:

- Given staff adjusts stock, then reason is required.
- Given staff lacks permission, then the adjustment is blocked.
- Given an adjustment is saved, then old value, new value, reason, user, and timestamp are logged.

### Story 17: Cycle Counts

As an owner, I want cycle counts so stock can be verified without closing the shop.

Acceptance criteria:

- Given I create a count, then I can select category, brand, location, or SKU range.
- Given staff submits counted quantities, then the system shows variance before posting.
- Given variances are approved, then stock movements are created and logged.

### Story 18: Roles and Permissions

As an owner, I want role-based access so sensitive actions are protected.

Acceptance criteria:

- Given I am admin, then I can manage users, roles, costs, suppliers, settings, and reports.
- Given I am staff, then I can only access assigned workflows.
- Given permissions change, then the change applies on the user's next request.

## Epic 8 - Reports and Exports

### Story 19: Inventory Reports

As an owner, I want inventory reports so I understand current stock and value.

Acceptance criteria:

- Given I open stock report, then I see source bottle ml, unopened full bottles, finished decants, packaging stock, reserved stock, and stock value.
- Given I filter by brand, fragrance, location, or status, then results update.
- Given I export the report, then a CSV file is generated.

### Story 20: Sales and Margin Reports

As an owner, I want sales and margin reports so I can make pricing and buying decisions.

Acceptance criteria:

- Given sales exist, then the report shows revenue, ml sold, bottles sold, COGS, gross profit, and margin.
- Given I filter by date, fragrance, size, channel, or staff, then the report updates.
- Given a fragrance is slow-moving or low-margin, then it can be identified from the report.
