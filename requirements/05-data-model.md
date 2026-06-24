# Data Model Requirements

## Core Entities

### users

Stores individual login accounts.

Fields:

- id
- name
- email
- password_hash
- role_id
- status
- last_login_at
- created_at
- updated_at

### roles

Stores role names and permission grouping.

Fields:

- id
- name
- description
- created_at
- updated_at

### fragrances

Stores fragrance master records.

Fields:

- id
- brand
- name
- concentration
- category
- top_notes
- middle_notes
- base_notes
- description
- image_url
- image_alt_text
- active
- created_at
- updated_at

### product_images

Stores optional uploaded product image metadata if the implementation keeps images in a separate table instead of a single `image_url` field.

Fields:

- id
- fragrance_id
- file_name
- file_path
- mime_type
- file_size_bytes
- alt_text
- is_primary
- uploaded_by_user_id
- created_at

### product_variants

Stores sellable fragrance variants. A variant can be a decant or a full bottle.

Fields:

- id
- fragrance_id
- sku
- barcode
- variant_type
- size_ml
- selling_price
- active
- low_stock_threshold_units
- created_at
- updated_at

Allowed `variant_type` values:

- decant
- full_bottle

### suppliers

Stores supplier details.

Fields:

- id
- name
- contact_person
- email
- phone
- address
- lead_time_days
- payment_terms
- notes
- created_at
- updated_at

### source_bottles

Stores purchased perfume bottles or bulk fragrance containers.

Fields:

- id
- fragrance_id
- supplier_id
- lot_code
- bottle_size_ml
- remaining_ml
- reserved_ml
- sellable_as_full_bottle
- full_bottle_status
- purchase_cost
- landed_cost
- cost_per_ml
- purchase_date
- opened_at
- opened_by_user_id
- location_id
- status
- created_at
- updated_at

### packaging_items

Stores atomizers, caps, labels, pouches, boxes, and other packaging supplies.

Fields:

- id
- sku
- name
- category
- unit_cost
- quantity_on_hand
- low_stock_threshold
- active
- created_at
- updated_at

### inventory_movements

Stores every stock-changing event. This is the core audit and stock ledger table.

Fields:

- id
- movement_type
- item_type
- fragrance_id
- source_bottle_id
- product_variant_id
- packaging_item_id
- quantity_delta
- unit
- cost_delta
- reference_type
- reference_id
- reason_code
- notes
- created_by_user_id
- created_at

Movement types:

- receive
- reserve
- release_reservation
- decant_production
- sale
- return
- adjustment
- cycle_count
- wastage
- transfer
- void

### decant_batches

Stores production events from source bottle to finished decants.

Fields:

- id
- batch_number
- fragrance_id
- source_bottle_id
- product_variant_id
- planned_quantity
- completed_quantity
- required_ml
- wastage_ml
- total_deducted_ml
- status
- created_by_user_id
- completed_by_user_id
- created_at
- completed_at

### decant_batch_packaging

Stores packaging consumed by each decant batch.

Fields:

- id
- decant_batch_id
- packaging_item_id
- quantity_used
- unit_cost_at_time
- created_at

### finished_decant_stock

Stores available units created from decant batches.

Fields:

- id
- product_variant_id
- decant_batch_id
- location_id
- quantity_on_hand
- reserved_quantity
- unit_liquid_cost
- unit_packaging_cost
- created_at
- updated_at

### full_bottle_stock

Stores unopened full bottles that are available for sale as units.

Fields:

- id
- product_variant_id
- source_bottle_id
- location_id
- quantity_on_hand
- reserved_quantity
- unit_cost
- status
- created_at
- updated_at

### orders

Stores customer or manual order header.

Fields:

- id
- order_number
- customer_name
- customer_phone
- customer_email
- channel
- status
- subtotal
- total_cogs
- gross_profit
- gross_margin_percent
- notes
- created_by_user_id
- created_at
- fulfilled_at

### order_lines

Stores ordered sellable variants.

Fields:

- id
- order_id
- product_variant_id
- quantity
- unit_price
- discount_amount
- sold_ml
- liquid_cogs
- packaging_cogs
- total_cogs
- gross_profit
- source_bottle_id
- decant_batch_id
- status
- created_at

### purchase_orders

Stores supplier purchase order header.

Fields:

- id
- po_number
- supplier_id
- status
- ordered_at
- expected_at
- received_at
- notes
- created_by_user_id
- created_at
- updated_at

### purchase_order_lines

Stores purchase order items.

Fields:

- id
- purchase_order_id
- item_type
- fragrance_id
- packaging_item_id
- ordered_quantity
- received_quantity
- unit
- unit_cost
- created_at
- updated_at

### stock_counts

Stores cycle count or physical count headers.

Fields:

- id
- count_number
- scope
- status
- started_by_user_id
- approved_by_user_id
- started_at
- approved_at
- notes

### stock_count_lines

Stores counted quantities and variance.

Fields:

- id
- stock_count_id
- item_type
- source_bottle_id
- product_variant_id
- packaging_item_id
- expected_quantity
- counted_quantity
- variance_quantity
- unit
- adjustment_movement_id
- notes

### audit_logs

Stores security and business audit events.

Fields:

- id
- actor_user_id
- action
- entity_type
- entity_id
- before_summary
- after_summary
- ip_address
- user_agent
- created_at

## Important Data Rules

- Source bottle `remaining_ml` must never drop below zero unless admin override is enabled and logged.
- An unopened source bottle can be sold as a full bottle or opened for decanting, but not both at the same time.
- A source bottle marked opened must be removed from full-bottle sellable availability.
- Full-bottle order lines should store unit cost at sale time so later supplier cost changes do not rewrite history.
- `cost_per_ml` should be calculated when stock is received and preserved for historical costing.
- Order lines should store costing values at sale time so later cost changes do not rewrite history.
- Inventory movements should be append-only. Do not edit historical movement quantities; use correction movements.
- All money values should use decimal fields, not floating point.
- All ml values should use decimal fields to support fractional loss or overfill rules.
- Product image uploads should store file metadata and should only allow approved image MIME types such as JPEG, PNG, and WebP.
