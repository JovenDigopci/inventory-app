# Business Requirements Document - Decant Perfume Inventory Management System

## Project Overview

The shop owner needs a web-based inventory management system for a perfume business that sells decants now and may sell full bottles in the future. The business buys full perfume bottles or bulk fragrance, sells smaller decants by milliliter size, may sell unopened bottles as whole units, and needs automatic inventory deduction, cost tracking, profit tracking, and operational visibility.

## Business Problem

Spreadsheets or manual tracking are not reliable enough for decant perfume inventory because the shop does not only sell whole items. It sells partial liquid volume from source bottles. Without a system that tracks milliliters, the owner cannot accurately know:

- How much fragrance is left.
- How many decants can still be sold.
- Which orders consumed which volume.
- How much each sold decant cost.
- Whether each perfume, size, and order is profitable.
- Which stock movements caused inventory differences.

## Business Goals

1. Track all perfume stock by milliliters.
2. Add fragrances, product pictures, bottle stock, full-bottle sellable variants, decant sizes, and packaging materials.
3. Record orders and automatically deduct sold ml for decants or sold bottle units for full bottles.
4. Track purchase cost, landed cost, packaging cost, COGS, gross profit, and margin.
5. Prevent overselling by checking available ml, finished decant stock, and unopened bottle units.
6. Show low-stock alerts for fragrance liquid and packaging supplies.
7. Provide reports for inventory value, sales, profit, wastage, and slow-moving stock.
8. Maintain an audit trail for every inventory-changing action.
9. Keep the technology stack beginner-friendly and affordable.

## Stakeholders

- Owner/Admin: Manages business settings, costs, users, suppliers, reports, and sensitive adjustments.
- Inventory Staff: Receives stock, updates bottles, creates decant batches, performs counts, and handles adjustments.
- Order/Packing Staff: Views orders, reserves stock, picks items, packs orders, and completes fulfillment.
- Optional Customer: Browses available decants and checks order status in a later release.

## In Scope

- Login and user roles.
- Fragrance product catalog.
- Product picture upload and display.
- Source bottle inventory by ml.
- Sellable variants for decants and full bottles.
- Decant batch production.
- Sales/order entry.
- Automatic ml deduction.
- Packaging supply tracking.
- Cost and profit tracking.
- Low-stock alerts.
- Purchase orders and suppliers.
- Inventory adjustments with reason codes.
- Cycle counts.
- Audit logs.
- Reports and CSV exports.

## Out of Scope for MVP

- Full accounting system.
- Native mobile app.
- Advanced forecasting.
- Multi-warehouse optimization.
- Marketplace/ecommerce sync.
- Online payment processing.
- Automated tax filing.
- Loyalty/CRM automation.

## Recommended Stack

- Frontend: HTML, CSS, JavaScript.
- Backend: Node.js with Express.
- Database: MySQL Community Server.
- Authentication: Session-based login with hashed passwords.
- Deployment: Any Node.js-compatible hosting with MySQL support.

Node.js/Express is recommended because it uses JavaScript on the backend, matching the frontend language and making the project easier for a beginner to learn. MySQL is recommended because inventory, orders, stock movements, costs, and audit logs fit well in a relational database.

## Success Metrics

- Inventory accuracy reaches at least 95% after first month and targets 98% after stabilization.
- 100% of sellable decants and full bottles are linked to a fragrance and stock record.
- 100% of inventory-changing events have an audit record.
- Owner can see gross profit and margin per order, fragrance, decant size, and bottle size.
- Staff can record a decant batch in under 3 minutes for common workflows.
- Low-stock alerts reduce unexpected stockouts by at least 30% after 60 days.

## Assumptions

- The first release is for one shop or one small business operation.
- The system is web-based and responsive for desktop, tablet, and mobile browsers.
- The owner wants open-source and beginner-friendly technology.
- Perfume liquid is tracked in ml, and unopened full bottles are also tracked as sellable units.
- Packaging supplies are tracked in units.
- Payment processing is outside the MVP.
