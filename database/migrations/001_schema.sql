CREATE DATABASE IF NOT EXISTS inventory_app;
USE inventory_app;

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_roles FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fragrances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand VARCHAR(120) NOT NULL,
  name VARCHAR(160) NOT NULL,
  concentration VARCHAR(80),
  category VARCHAR(80),
  top_notes TEXT,
  middle_notes TEXT,
  base_notes TEXT,
  description TEXT,
  image_url VARCHAR(500),
  image_alt_text VARCHAR(255),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fragrance (brand, name, concentration)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fragrance_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size_bytes INT NOT NULL,
  alt_text VARCHAR(255),
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by_user_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_images_fragrance FOREIGN KEY (fragrance_id) REFERENCES fragrances(id),
  CONSTRAINT fk_product_images_user FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_variants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fragrance_id INT NOT NULL,
  sku VARCHAR(80) NOT NULL UNIQUE,
  barcode VARCHAR(120),
  variant_type ENUM('decant','full_bottle') NOT NULL,
  size_ml DECIMAL(10,3) NOT NULL,
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  low_stock_threshold_units DECIMAL(12,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_variants_fragrance FOREIGN KEY (fragrance_id) REFERENCES fragrances(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  contact_person VARCHAR(120),
  email VARCHAR(160),
  phone VARCHAR(80),
  address TEXT,
  lead_time_days INT DEFAULT 0,
  payment_terms VARCHAR(160),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description VARCHAR(255)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS source_bottles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fragrance_id INT NOT NULL,
  supplier_id INT,
  lot_code VARCHAR(120),
  bottle_size_ml DECIMAL(10,3) NOT NULL,
  remaining_ml DECIMAL(10,3) NOT NULL,
  reserved_ml DECIMAL(10,3) NOT NULL DEFAULT 0,
  sellable_as_full_bottle BOOLEAN NOT NULL DEFAULT FALSE,
  full_bottle_status ENUM('not_sellable','available','reserved','sold','opened') NOT NULL DEFAULT 'not_sellable',
  purchase_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  landed_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost_per_ml DECIMAL(12,4) NOT NULL DEFAULT 0,
  purchase_date DATE,
  opened_at DATETIME,
  opened_by_user_id INT,
  location_id INT,
  status ENUM('unopened','opened','empty','archived') NOT NULL DEFAULT 'unopened',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bottles_fragrance FOREIGN KEY (fragrance_id) REFERENCES fragrances(id),
  CONSTRAINT fk_bottles_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_bottles_location FOREIGN KEY (location_id) REFERENCES locations(id),
  CONSTRAINT fk_bottles_opened_by FOREIGN KEY (opened_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS packaging_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(80),
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  quantity_on_hand DECIMAL(12,3) NOT NULL DEFAULT 0,
  low_stock_threshold DECIMAL(12,3) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  movement_type ENUM('receive','reserve','release_reservation','decant_production','sale','return','adjustment','cycle_count','wastage','transfer','void') NOT NULL,
  item_type ENUM('source_bottle','product_variant','packaging_item') NOT NULL,
  fragrance_id INT,
  source_bottle_id INT,
  product_variant_id INT,
  packaging_item_id INT,
  quantity_delta DECIMAL(12,3) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  cost_delta DECIMAL(12,2) NOT NULL DEFAULT 0,
  reference_type VARCHAR(80),
  reference_id INT,
  reason_code VARCHAR(80),
  notes TEXT,
  created_by_user_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_movement_created (created_at),
  INDEX idx_movement_reference (reference_type, reference_id),
  CONSTRAINT fk_movements_fragrance FOREIGN KEY (fragrance_id) REFERENCES fragrances(id),
  CONSTRAINT fk_movements_bottle FOREIGN KEY (source_bottle_id) REFERENCES source_bottles(id),
  CONSTRAINT fk_movements_variant FOREIGN KEY (product_variant_id) REFERENCES product_variants(id),
  CONSTRAINT fk_movements_packaging FOREIGN KEY (packaging_item_id) REFERENCES packaging_items(id),
  CONSTRAINT fk_movements_user FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS decant_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_number VARCHAR(80) NOT NULL UNIQUE,
  fragrance_id INT NOT NULL,
  source_bottle_id INT NOT NULL,
  product_variant_id INT NOT NULL,
  planned_quantity INT NOT NULL,
  completed_quantity INT NOT NULL DEFAULT 0,
  required_ml DECIMAL(12,3) NOT NULL DEFAULT 0,
  wastage_ml DECIMAL(12,3) NOT NULL DEFAULT 0,
  total_deducted_ml DECIMAL(12,3) NOT NULL DEFAULT 0,
  status ENUM('draft','completed','void') NOT NULL DEFAULT 'draft',
  created_by_user_id INT,
  completed_by_user_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  CONSTRAINT fk_batches_fragrance FOREIGN KEY (fragrance_id) REFERENCES fragrances(id),
  CONSTRAINT fk_batches_bottle FOREIGN KEY (source_bottle_id) REFERENCES source_bottles(id),
  CONSTRAINT fk_batches_variant FOREIGN KEY (product_variant_id) REFERENCES product_variants(id),
  CONSTRAINT fk_batches_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_batches_completed_by FOREIGN KEY (completed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS decant_batch_packaging (
  id INT AUTO_INCREMENT PRIMARY KEY,
  decant_batch_id INT NOT NULL,
  packaging_item_id INT NOT NULL,
  quantity_used DECIMAL(12,3) NOT NULL,
  unit_cost_at_time DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_batch_packaging_batch FOREIGN KEY (decant_batch_id) REFERENCES decant_batches(id),
  CONSTRAINT fk_batch_packaging_item FOREIGN KEY (packaging_item_id) REFERENCES packaging_items(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS finished_decant_stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_variant_id INT NOT NULL,
  decant_batch_id INT,
  location_id INT,
  quantity_on_hand DECIMAL(12,3) NOT NULL DEFAULT 0,
  reserved_quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit_liquid_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  unit_packaging_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_finished_variant FOREIGN KEY (product_variant_id) REFERENCES product_variants(id),
  CONSTRAINT fk_finished_batch FOREIGN KEY (decant_batch_id) REFERENCES decant_batches(id),
  CONSTRAINT fk_finished_location FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS full_bottle_stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_variant_id INT NOT NULL,
  source_bottle_id INT NOT NULL UNIQUE,
  location_id INT,
  quantity_on_hand DECIMAL(12,3) NOT NULL DEFAULT 1,
  reserved_quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('available','reserved','sold','opened','archived') NOT NULL DEFAULT 'available',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_full_stock_variant FOREIGN KEY (product_variant_id) REFERENCES product_variants(id),
  CONSTRAINT fk_full_stock_bottle FOREIGN KEY (source_bottle_id) REFERENCES source_bottles(id),
  CONSTRAINT fk_full_stock_location FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(80) NOT NULL UNIQUE,
  customer_name VARCHAR(160),
  customer_phone VARCHAR(80),
  customer_email VARCHAR(160),
  channel VARCHAR(80) NOT NULL DEFAULT 'manual',
  status ENUM('draft','reserved','needs_production','fulfilled','cancelled','returned') NOT NULL DEFAULT 'draft',
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_cogs DECIMAL(12,2) NOT NULL DEFAULT 0,
  gross_profit DECIMAL(12,2) NOT NULL DEFAULT 0,
  gross_margin_percent DECIMAL(8,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by_user_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fulfilled_at DATETIME,
  CONSTRAINT fk_orders_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_variant_id INT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  sold_ml DECIMAL(12,3) NOT NULL DEFAULT 0,
  liquid_cogs DECIMAL(12,2) NOT NULL DEFAULT 0,
  packaging_cogs DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_cogs DECIMAL(12,2) NOT NULL DEFAULT 0,
  gross_profit DECIMAL(12,2) NOT NULL DEFAULT 0,
  source_bottle_id INT,
  decant_batch_id INT,
  status ENUM('reserved','needs_production','fulfilled','cancelled','returned') NOT NULL DEFAULT 'reserved',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_lines_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_order_lines_variant FOREIGN KEY (product_variant_id) REFERENCES product_variants(id),
  CONSTRAINT fk_order_lines_bottle FOREIGN KEY (source_bottle_id) REFERENCES source_bottles(id),
  CONSTRAINT fk_order_lines_batch FOREIGN KEY (decant_batch_id) REFERENCES decant_batches(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  po_number VARCHAR(80) NOT NULL UNIQUE,
  supplier_id INT NOT NULL,
  status ENUM('draft','ordered','partial','complete','cancelled') NOT NULL DEFAULT 'draft',
  ordered_at DATE,
  expected_at DATE,
  received_at DATE,
  notes TEXT,
  created_by_user_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_po_user FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_order_id INT NOT NULL,
  item_type ENUM('fragrance','packaging') NOT NULL,
  fragrance_id INT,
  packaging_item_id INT,
  ordered_quantity DECIMAL(12,3) NOT NULL,
  received_quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit VARCHAR(20) NOT NULL,
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_po_lines_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
  CONSTRAINT fk_po_lines_fragrance FOREIGN KEY (fragrance_id) REFERENCES fragrances(id),
  CONSTRAINT fk_po_lines_packaging FOREIGN KEY (packaging_item_id) REFERENCES packaging_items(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_counts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  count_number VARCHAR(80) NOT NULL UNIQUE,
  scope VARCHAR(160),
  status ENUM('open','submitted','approved','cancelled') NOT NULL DEFAULT 'open',
  started_by_user_id INT,
  approved_by_user_id INT,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME,
  notes TEXT,
  CONSTRAINT fk_counts_started FOREIGN KEY (started_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_counts_approved FOREIGN KEY (approved_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_count_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  stock_count_id INT NOT NULL,
  item_type ENUM('source_bottle','product_variant','packaging_item') NOT NULL,
  source_bottle_id INT,
  product_variant_id INT,
  packaging_item_id INT,
  expected_quantity DECIMAL(12,3) NOT NULL,
  counted_quantity DECIMAL(12,3) NOT NULL,
  variance_quantity DECIMAL(12,3) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  adjustment_movement_id INT,
  notes TEXT,
  CONSTRAINT fk_count_lines_count FOREIGN KEY (stock_count_id) REFERENCES stock_counts(id),
  CONSTRAINT fk_count_lines_bottle FOREIGN KEY (source_bottle_id) REFERENCES source_bottles(id),
  CONSTRAINT fk_count_lines_variant FOREIGN KEY (product_variant_id) REFERENCES product_variants(id),
  CONSTRAINT fk_count_lines_packaging FOREIGN KEY (packaging_item_id) REFERENCES packaging_items(id),
  CONSTRAINT fk_count_lines_movement FOREIGN KEY (adjustment_movement_id) REFERENCES inventory_movements(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_user_id INT,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id INT,
  before_summary JSON,
  after_summary JSON,
  ip_address VARCHAR(80),
  user_agent VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
