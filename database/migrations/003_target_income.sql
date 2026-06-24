USE inventory_app;

-- Add target_income and target_selling_price to fragrances (idempotent).
SET @target_income_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fragrances' AND COLUMN_NAME = 'target_income');
SET @sql := IF(@target_income_exists = 0,
  'ALTER TABLE fragrances ADD COLUMN target_income DECIMAL(12,2) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @target_price_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fragrances' AND COLUMN_NAME = 'target_selling_price');
SET @sql := IF(@target_price_exists = 0,
  'ALTER TABLE fragrances ADD COLUMN target_selling_price DECIMAL(12,2) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
