USE inventory_app;

CREATE TABLE IF NOT EXISTS product_accessories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fragrance_id INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  quantity DECIMAL(12,3) NOT NULL DEFAULT 1,
  total_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_accessories_fragrance FOREIGN KEY (fragrance_id) REFERENCES fragrances(id)
) ENGINE=InnoDB;
