# Implementation Plan

## Recommended Stack

- Frontend: HTML, CSS, JavaScript.
- Backend: Node.js with Express.
- Database: MySQL Community Server.
- Testing: Node.js test runner or Jest for backend logic, manual browser QA for MVP.
- Version control: Git.

Node.js with Express is the recommended backend because it lets a beginner use JavaScript on both frontend and backend. MySQL is recommended because it is open source, relational, and appropriate for structured inventory, orders, costing, and audit records.

## MVP Timeline

Estimated timeline: 12 to 14 weeks.

## Phase 0 - Discovery and Requirements, Week 1

Deliverables:

- Confirm owner workflows for receiving, decanting, selling, wastage, returns, and reports.
- Confirm decant sizes and full-bottle sizes that may be sold.
- Confirm cost formula and wastage rules.
- Confirm user roles.
- Confirm MVP scope.

Exit criteria:

- Requirements approved.
- Data model draft approved.
- MVP backlog approved.

## Phase 1 - Project Setup and Architecture, Week 2

Tasks:

- Initialize Node.js/Express project.
- Create static frontend structure for HTML, CSS, and JavaScript.
- Configure MySQL connection.
- Add environment variable support.
- Add basic folder structure.
- Create database migration scripts.
- Create seed data for roles and admin user.

Suggested folders:

```text
src/
  server.js
  config/
  routes/
  controllers/
  services/
  repositories/
  middleware/
  public/
    index.html
    css/
    js/
database/
  migrations/
  seeds/
tests/
```

Exit criteria:

- App runs locally.
- Backend connects to MySQL.
- First page loads in browser.

## Phase 2 - Authentication and Base UI, Week 3

Tasks:

- Build login/logout.
- Add password hashing.
- Add session handling.
- Add role middleware.
- Build base layout, navigation, dashboard shell, and reusable CSS.

Exit criteria:

- Users can log in and out.
- Unauthorized users cannot access protected pages.
- Admin and staff see role-appropriate navigation.

## Phase 3 - Catalog and Source Bottle Inventory, Weeks 4-5

Tasks:

- Build fragrance CRUD.
- Add product image upload, thumbnail display, replacement, and removal.
- Build sellable variant CRUD for decants and full bottles.
- Build supplier CRUD.
- Build source bottle receiving.
- Add flag for bottles that can be sold whole.
- Calculate cost per ml.
- Add stock movement records for receiving.

Exit criteria:

- Owner can create fragrance and sizes.
- Owner can upload a product picture and see it in catalog and order screens.
- Owner can receive a source bottle.
- Owner can mark unopened bottles as sellable full-bottle stock.
- Bottle remaining ml and cost per ml are visible.

## Phase 4 - Packaging and Decant Production, Weeks 6-7

Tasks:

- Build packaging item CRUD.
- Build decant batch workflow.
- Deduct source bottle ml.
- Deduct packaging units.
- Increase finished decant stock.
- Add wastage rule support.
- Add batch history.

Exit criteria:

- Staff can create a batch such as 10 units of 5ml from a 100ml bottle.
- System deducts correct ml and packaging.
- Batch is traceable to source bottle.

## Phase 5 - Orders, Reservations, and Fulfillment, Weeks 8-9

Tasks:

- Build order creation.
- Add order lines for decant variants and full-bottle variants.
- Add stock reservation.
- Add pick/pack/fulfill status.
- Deduct stock on fulfillment.
- Deduct unopened bottle units for full-bottle sales.
- Release stock on cancellation.
- Store COGS, gross profit, and margin at order line level.

Exit criteria:

- Staff can create and fulfill an order.
- System blocks overselling.
- Sold ml, bottles sold, and profit are calculated.

## Phase 6 - Stock Control, Purchasing, and Counts, Weeks 10-11

Tasks:

- Build inventory adjustment workflow.
- Require reason codes.
- Build low-stock dashboard.
- Build purchase orders.
- Build partial receiving.
- Build cycle count workflow.

Exit criteria:

- Owner can see low-stock fragrance and packaging.
- Staff can adjust inventory with reasons.
- Cycle count variances can be reviewed and posted.

## Phase 7 - Reports, Audit, and Exports, Week 12

Tasks:

- Build stock on hand report.
- Build source bottle remaining ml report.
- Build inventory valuation report.
- Build sales and margin report.
- Build wastage report.
- Build audit log viewer.
- Add CSV export.

Exit criteria:

- Owner can answer: what is in stock, what is low, what sold, what profit was earned, and what changed inventory.

## Phase 8 - QA, UAT, and Hardening, Weeks 13-14

Test scenarios:

- Receive one 100ml bottle with purchase and landed cost.
- Create 10 x 5ml decants with 3% wastage.
- Sell one 5ml decant and verify deduction and profit.
- Sell one full bottle and verify one unopened bottle is deducted and profit is calculated.
- Cancel an order and verify reservation release.
- Record 2ml spill and verify wastage report.
- Receive atomizers and verify packaging stock.
- Trigger low-stock alert.
- Perform cycle count and post variance.
- Verify staff cannot edit cost or roles.

Exit criteria:

- No critical or high defects open.
- Inventory math is correct across receiving, decanting, sales, returns, wastage, and counts.
- Owner signs off on MVP workflows.
- Backup and restore process is tested.

## Release Checklist

- Production database created.
- Admin account created.
- Test users removed.
- Environment variables configured.
- Opening inventory imported and reconciled.
- Roles and permissions checked.
- Low-stock thresholds configured.
- Backup job enabled.
- Restore tested.
- UAT sign-off completed.
- Staff trained.
- Go-live date confirmed.

## Development Priority

Build in this order:

1. Authentication and roles.
2. Fragrance catalog.
3. Source bottle inventory in ml.
4. Sellable variants for decants and full bottles.
5. Packaging inventory.
6. Decant production.
7. Orders and automatic deduction.
8. Costing and profit.
9. Low-stock alerts.
10. Adjustments and cycle counts.
11. Reports and exports.
