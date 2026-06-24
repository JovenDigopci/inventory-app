USE inventory_app;

INSERT IGNORE INTO roles (name, description) VALUES
('owner', 'Full system access'),
('admin', 'Administrator access for system security and maintenance'),
('manager', 'Operational manager access'),
('inventory_staff', 'Can manage inventory workflows'),
('order_staff', 'Can manage order workflows'),
('readonly', 'Can view reports and stock only');

INSERT IGNORE INTO locations (name, description) VALUES
('Main Shelf', 'Default shop storage'),
('Back Room', 'Back room storage'),
('Packing Area', 'Order packing area'),
('Damaged', 'Damaged or unsellable stock');
