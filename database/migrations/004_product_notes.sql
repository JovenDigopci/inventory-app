USE inventory_app;

-- Add a free-text notes column to fragrances (idempotent).
SET @notes_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fragrances' AND COLUMN_NAME = 'notes');
SET @sql := IF(@notes_exists = 0,
  'ALTER TABLE fragrances ADD COLUMN notes TEXT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
