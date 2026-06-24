USE inventory_app;

-- Add tiered selling prices (5 ml, 10 ml, full bottle) to fragrances (idempotent).
SET @p5 := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fragrances' AND COLUMN_NAME = 'price_5ml');
SET @sql := IF(@p5 = 0, 'ALTER TABLE fragrances ADD COLUMN price_5ml DECIMAL(12,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @p10 := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fragrances' AND COLUMN_NAME = 'price_10ml');
SET @sql := IF(@p10 = 0, 'ALTER TABLE fragrances ADD COLUMN price_10ml DECIMAL(12,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @pf := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fragrances' AND COLUMN_NAME = 'price_full_bottle');
SET @sql := IF(@pf = 0, 'ALTER TABLE fragrances ADD COLUMN price_full_bottle DECIMAL(12,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
