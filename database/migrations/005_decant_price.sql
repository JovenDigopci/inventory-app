USE inventory_app;

-- Add a manual decant price-per-ml to fragrances (idempotent).
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fragrances' AND COLUMN_NAME = 'decant_price_per_ml');
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE fragrances ADD COLUMN decant_price_per_ml DECIMAL(12,2) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
