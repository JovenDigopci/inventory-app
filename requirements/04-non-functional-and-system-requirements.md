# Non-Functional and System Requirements

## Technology Requirements

- Frontend shall be built with HTML, CSS, and JavaScript.
- Backend shall use Node.js with Express.
- Database shall use MySQL Community Server or another MySQL-compatible open-source database.
- The application shall use a responsive web interface for desktop, tablet, and mobile browsers.
- The first implementation shall avoid frontend frameworks unless the owner later approves them.

## Usability

- Common staff workflows shall be short and easy to understand.
- Staff should be able to search, scan, adjust, receive, produce, and fulfill with minimal page changes.
- Tables shall support filtering, sorting, and clear status labels.
- Forms shall validate required fields before submission.
- Error messages shall explain what the user needs to fix.
- Product pictures shall use consistent thumbnails in lists so staff can quickly identify perfumes without disrupting table layout.

## Performance

- Common pages should load within 1-2 seconds for normal small-shop data volumes.
- Product search and barcode lookup should feel immediate.
- Reports with large date ranges may run asynchronously or show loading states.

## Data Integrity

- Stock balances shall be produced from stock movement records or reconciled against movement records.
- Inventory-changing actions shall use database transactions.
- The system shall not allow negative stock unless an admin override is explicitly enabled and logged.
- Historical purchase costs shall not be overwritten by later supplier price changes.

## Security

- Passwords shall be hashed using a modern password hashing algorithm.
- Admin and owner accounts should support multi-factor authentication in a later release.
- Authorization shall be checked on the server for every protected action.
- The system shall use deny-by-default permissions.
- Sensitive actions such as role changes, bulk adjustments, cost edits, and backdated changes shall be logged.
- The system shall not store payment card numbers, CVV, or raw payment credentials.

## Auditability

Audit logs must answer:

- Who performed the action?
- What changed?
- When did it happen?
- Why did it happen?
- Which order, product, bottle, batch, or adjustment caused it?

The system shall avoid logging passwords, tokens, secrets, and payment card data.

## Backup and Recovery

- Database backups shall run at least daily.
- If the system becomes business-critical, backups should run hourly or use point-in-time recovery.
- Backups shall include database data, uploaded images, configuration, and export records.
- Backups shall be stored outside the application server.
- Restore testing shall be performed before production launch and periodically after launch.
- Target recovery point objective: less than 24 hours for MVP.
- Target recovery time objective: same business day for MVP.

## Availability

- The system should be available during business hours.
- Planned maintenance should be scheduled outside shop operating hours.
- If external integrations fail, the system should show clear error states and allow manual recovery where possible.

## Accessibility

- Forms, buttons, navigation, and tables should be keyboard usable.
- Labels shall be associated with form fields.
- Color shall not be the only indicator of status.
- Text contrast should be readable in normal shop lighting.

## Maintainability

The backend should be organized into clear modules:

- Authentication and users.
- Products and variants.
- Source bottles and batches.
- Inventory movements.
- Orders and fulfillment.
- Suppliers and purchase orders.
- Reports.
- Audit logs.

## System Requirements

### Development Environment

- Node.js LTS.
- npm.
- MySQL Community Server.
- MySQL Workbench or another database client.
- Git.
- Modern browser such as Chrome, Edge, or Firefox.

### Server Environment

- Operating system capable of running Node.js and MySQL.
- HTTPS in production.
- Environment variables for database credentials and session secrets.
- Scheduled backup process.
- Log retention and monitoring.

### Database Requirements

- Use InnoDB tables.
- Use foreign keys for related records.
- Use decimal types for money and ml values.
- Use timestamps for created and updated records.
- Use indexes for SKU, barcode, product name, order number, movement date, and audit date.
