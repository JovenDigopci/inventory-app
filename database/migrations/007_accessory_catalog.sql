USE inventory_app;

CREATE TABLE IF NOT EXISTS accessory_catalog (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,
  default_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Seed the catalog with accessories already used in products.
INSERT IGNORE INTO accessory_catalog (name, default_cost)
SELECT name, MAX(unit_cost) FROM product_accessories
WHERE name IS NOT NULL AND name <> ''
GROUP BY name;
