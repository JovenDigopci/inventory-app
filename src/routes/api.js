const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { query, transaction } = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { writeAudit } = require('../repositories/auditRepository');
const {
  calculateCostPerMl,
  calculateDecantDeduction,
  calculateMargin,
  roundMoney
} = require('../services/inventoryMath');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'public', 'uploads'),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
    cb(null, true);
  }
});

function userId(req) {
  return req.session.user?.id || null;
}

function orderNumber(prefix) {
  return `${prefix}-${Date.now()}`;
}

function parseAccessories(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        name: String(item.name || '').trim(),
        unit_cost: Number(item.unit_cost || 0),
        quantity: Number(item.quantity || 1)
      }))
      .filter((item) => item.name && item.unit_cost >= 0 && item.quantity > 0)
      .map((item) => ({ ...item, total_cost: roundMoney(item.unit_cost * item.quantity) }));
  } catch (error) {
    return [];
  }
}

async function archiveProduct(connection, fragranceId, req, before = null) {
  await connection.execute('UPDATE fragrances SET active = 0 WHERE id = ?', [fragranceId]);
  await connection.execute('UPDATE product_variants SET active = 0 WHERE fragrance_id = ?', [fragranceId]);
  await connection.execute(
    `UPDATE source_bottles
     SET status = 'archived', full_bottle_status = CASE WHEN full_bottle_status = 'sold' THEN 'sold' ELSE 'opened' END
     WHERE fragrance_id = ?`,
    [fragranceId]
  );
  await connection.execute(
    `UPDATE full_bottle_stock fbs
     JOIN product_variants pv ON pv.id = fbs.product_variant_id
     SET fbs.status = CASE WHEN fbs.status = 'sold' THEN 'sold' ELSE 'archived' END,
       fbs.quantity_on_hand = CASE WHEN fbs.status = 'sold' THEN fbs.quantity_on_hand ELSE 0 END,
       fbs.reserved_quantity = 0
     WHERE pv.fragrance_id = ?`,
    [fragranceId]
  );
  await writeAudit(connection, userId(req), 'archive', 'simple_product', fragranceId, before, { active: 0 }, req);
}

async function getOrCreateOneMlVariant(connection, fragranceId) {
  const [[existing]] = await connection.execute(
    'SELECT id FROM product_variants WHERE fragrance_id = ? AND variant_type = "decant" AND size_ml = 1 LIMIT 1',
    [fragranceId]
  );
  if (existing) return existing.id;

  const sku = `DECANT-${fragranceId}-1ML`;
  const [insert] = await connection.execute(
    `INSERT INTO product_variants
     (fragrance_id, sku, variant_type, size_ml, selling_price, active, low_stock_threshold_units)
     VALUES (?, ?, 'decant', 1, 0, 1, 0)`,
    [fragranceId, sku]
  );
  return insert.insertId;
}

async function getOrCreateFullBottleVariant(connection, fragranceId, sizeMl) {
  const [[existing]] = await connection.execute(
    'SELECT id FROM product_variants WHERE fragrance_id = ? AND variant_type = "full_bottle" AND size_ml = ? LIMIT 1',
    [fragranceId, sizeMl]
  );
  if (existing) return existing.id;

  const sku = `FULL-${fragranceId}-${sizeMl}ML`;
  const [insert] = await connection.execute(
    `INSERT INTO product_variants
     (fragrance_id, sku, variant_type, size_ml, selling_price, active, low_stock_threshold_units)
     VALUES (?, ?, 'full_bottle', ?, 0, 1, 0)`,
    [fragranceId, sku, sizeMl]
  );
  return insert.insertId;
}

router.get('/health', async (req, res) => {
  await query('SELECT 1 AS ok');
  res.json({ ok: true });
});

// ---- Public storefront (no auth) ----
router.get('/shop/products', async (req, res) => {
  const rows = await query(
    `SELECT f.id, f.brand, f.name, f.description, f.top_notes, f.middle_notes, f.base_notes, f.image_url, f.image_alt_text,
       f.target_selling_price, f.price_5ml, f.price_10ml, f.price_full_bottle,
       COALESCE(MAX(sb.bottle_size_ml), 0) AS bottle_size_ml,
       COALESCE(AVG(NULLIF(sb.cost_per_ml, 0)), 0) AS cost_per_ml,
       COALESCE(SUM(CASE WHEN sb.status = 'unopened' THEN 1 ELSE 0 END), 0) AS full_bottles,
       COALESCE(SUM(CASE WHEN sb.status = 'opened' THEN GREATEST(sb.remaining_ml - sb.reserved_ml, 0) ELSE 0 END), 0) AS decant_ml,
       COALESCE(SUM(sb.purchase_cost + sb.landed_cost), 0) AS total_cost
     FROM fragrances f
     LEFT JOIN source_bottles sb ON sb.fragrance_id = f.id AND sb.status <> 'archived'
     WHERE f.active = 1
     GROUP BY f.id
     HAVING full_bottles > 0 OR decant_ml > 0
     ORDER BY f.brand, f.name`
  );
  const products = rows.map((r) => {
    const bottleSizeMl = Number(r.bottle_size_ml);
    const baseBottle = Number(r.target_selling_price) > 0 ? Number(r.target_selling_price) : Number(r.total_cost);
    const perMl = bottleSizeMl > 0 && baseBottle > 0 ? baseBottle / bottleSizeMl : Number(r.cost_per_ml);
    // Use the owner's set tier prices when provided, otherwise fall back to a derived estimate.
    const price5ml = Number(r.price_5ml) > 0 ? Number(r.price_5ml) : roundMoney(perMl * 5);
    const price10ml = Number(r.price_10ml) > 0 ? Number(r.price_10ml) : roundMoney(perMl * 10);
    const bottlePrice = Number(r.price_full_bottle) > 0 ? Number(r.price_full_bottle) : roundMoney(baseBottle);
    const noteParts = [
      r.top_notes ? `Top: ${r.top_notes}` : null,
      r.middle_notes ? `Heart: ${r.middle_notes}` : null,
      r.base_notes ? `Base: ${r.base_notes}` : null
    ].filter(Boolean);
    return {
      id: r.id,
      brand: r.brand,
      name: r.name,
      description: r.description,
      notes: noteParts.join(' · '),
      notes_list: noteParts,
      image_url: r.image_url,
      image_alt_text: r.image_alt_text || `${r.brand} ${r.name}`,
      bottle_size_ml: bottleSizeMl,
      price_5ml: price5ml,
      price_10ml: price10ml,
      bottle_price: bottlePrice,
      full_bottle_available: Number(r.full_bottles) > 0,
      decant_available: Number(r.decant_ml) > 0,
      decant_ml_available: Number(r.decant_ml)
    };
  });
  res.json(products);
});

// Build one order line (variant, price, cost) for a requested item.
async function buildShopLine(connection, item) {
  const fragranceId = Number(item.fragrance_id);
  const orderType = item.order_type === 'bottle' ? 'bottle' : 'decant';
  const ml = Number(item.ml || 0);
  const quantity = Math.max(1, Number.parseInt(item.quantity || '1', 10));
  if (!fragranceId) throw Object.assign(new Error('Please choose a product.'), { status: 400 });
  if (orderType === 'decant' && ml <= 0) throw Object.assign(new Error('Tell us how many ml you would like for a decant.'), { status: 400 });

  const [[fragrance]] = await connection.execute('SELECT * FROM fragrances WHERE id = ? AND active = 1', [fragranceId]);
  if (!fragrance) throw Object.assign(new Error('That product is not available.'), { status: 404 });

  const [[bottle]] = await connection.execute(
    `SELECT * FROM source_bottles WHERE fragrance_id = ? AND status <> 'archived'
     ORDER BY (status = 'opened') DESC, id LIMIT 1`,
    [fragranceId]
  );
  const sizeMl = bottle ? Number(bottle.bottle_size_ml) : 0;
  const costPerMl = bottle ? Number(bottle.cost_per_ml || 0) : 0;
  const bottleCost = bottle ? Number(bottle.purchase_cost || 0) + Number(bottle.landed_cost || 0) : 0;
  const baseBottle = Number(fragrance.target_selling_price) > 0 ? Number(fragrance.target_selling_price) : roundMoney(bottleCost);
  const perMlBase = sizeMl > 0 && baseBottle > 0 ? baseBottle / sizeMl : costPerMl;
  const fullBottlePrice = Number(fragrance.price_full_bottle) > 0 ? Number(fragrance.price_full_bottle) : roundMoney(baseBottle);
  const sourceBottleId = bottle ? bottle.id : null;

  let variantId;
  let lineQty;
  let soldMl;
  let unitPrice;
  let subtotal;
  let totalCogs;
  let label;
  if (orderType === 'bottle') {
    variantId = await getOrCreateFullBottleVariant(connection, fragranceId, sizeMl || 1);
    lineQty = quantity;
    soldMl = sizeMl;
    unitPrice = roundMoney(fullBottlePrice);
    subtotal = roundMoney(unitPrice * quantity);
    totalCogs = roundMoney(bottleCost * quantity);
    label = `${fragrance.brand} ${fragrance.name} - ${quantity} full bottle(s)`;
  } else {
    variantId = await getOrCreateOneMlVariant(connection, fragranceId);
    let tierPrice;
    if (ml === 5 && Number(fragrance.price_5ml) > 0) tierPrice = Number(fragrance.price_5ml);
    else if (ml === 10 && Number(fragrance.price_10ml) > 0) tierPrice = Number(fragrance.price_10ml);
    else tierPrice = roundMoney(perMlBase * ml);
    soldMl = ml * quantity;
    lineQty = ml * quantity;
    unitPrice = ml > 0 ? roundMoney(tierPrice / ml) : 0;
    subtotal = roundMoney(tierPrice * quantity);
    totalCogs = roundMoney(costPerMl * ml * quantity);
    label = `${fragrance.brand} ${fragrance.name} - ${quantity} x ${ml} ml decant`;
  }
  const grossProfit = roundMoney(subtotal - totalCogs);
  return { variantId, lineQty, soldMl, unitPrice, subtotal, totalCogs, grossProfit, sourceBottleId, label };
}

router.post('/shop/orders', async (req, res) => {
  const b = req.body;
  if (!b.customer_name) {
    return res.status(400).json({ error: 'Please enter your name.' });
  }
  // Accept a multi-item cart (b.items) or a single item.
  const items = Array.isArray(b.items) && b.items.length
    ? b.items
    : [{ fragrance_id: b.fragrance_id, order_type: b.order_type, ml: b.ml, quantity: b.quantity }];

  const result = await transaction(async (connection) => {
    const lines = [];
    for (const item of items) {
      lines.push(await buildShopLine(connection, item));
    }
    const subtotal = roundMoney(lines.reduce((sum, l) => sum + l.subtotal, 0));
    const totalCogs = roundMoney(lines.reduce((sum, l) => sum + l.totalCogs, 0));
    const grossProfit = roundMoney(subtotal - totalCogs);
    const margin = subtotal > 0 ? roundMoney((grossProfit / subtotal) * 100) : 0;
    const orderNo = orderNumber('WEB');
    const notesText = [
      `Online order (${lines.length} item${lines.length > 1 ? 's' : ''}):`,
      ...lines.map((l) => `- ${l.label}`),
      b.fulfillment_method ? `Fulfillment: ${b.fulfillment_method}` : null,
      b.customer_address ? `Address: ${b.customer_address}` : null,
      b.notes || null
    ].filter(Boolean).join('\n');

    // Online orders come in as pending ('reserved'); the owner reviews them in admin. No stock is deducted.
    const [order] = await connection.execute(
      `INSERT INTO orders
       (order_number, customer_name, customer_phone, customer_email, channel, status, subtotal, total_cogs,
        gross_profit, gross_margin_percent, notes, created_by_user_id, fulfilled_at)
       VALUES (?, ?, ?, ?, 'online', 'reserved', ?, ?, ?, ?, ?, NULL, NULL)`,
      [orderNo, b.customer_name, b.customer_phone || null, b.customer_email || null, subtotal, totalCogs, grossProfit, margin, notesText]
    );
    for (const l of lines) {
      await connection.execute(
        `INSERT INTO order_lines
         (order_id, product_variant_id, quantity, unit_price, sold_ml, liquid_cogs, total_cogs, gross_profit, source_bottle_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved')`,
        [order.insertId, l.variantId, l.lineQty, l.unitPrice, l.soldMl, l.totalCogs, l.totalCogs, l.grossProfit, l.sourceBottleId]
      );
    }
    return { orderId: order.insertId, orderNumber: orderNo, subtotal };
  });
  res.status(201).json(result);
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const users = await query(
    `SELECT u.id, u.name, u.email, u.password_hash, u.status, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?`,
    [email]
  );
  const user = users[0];
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const valid = await bcrypt.compare(password || '', user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (!['owner', 'admin'].includes(user.role_name)) {
    return res.status(403).json({ error: 'Only owner or admin accounts can access this system' });
  }
  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role_name: user.role_name
  };
  await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  res.json({ user: req.session.user });
});

router.post('/auth/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/auth/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

router.get('/lookups', requireAuth, async (req, res) => {
  const [fragrances, variants, suppliers, locations, packaging] = await Promise.all([
    query('SELECT id, brand, name, image_url FROM fragrances WHERE active = 1 ORDER BY brand, name'),
    query('SELECT id, fragrance_id, sku, variant_type, size_ml, selling_price FROM product_variants WHERE active = 1 ORDER BY sku'),
    query('SELECT id, name FROM suppliers ORDER BY name'),
    query('SELECT id, name FROM locations ORDER BY name'),
    query('SELECT id, sku, name, unit_cost, quantity_on_hand FROM packaging_items WHERE active = 1 ORDER BY name')
  ]);
  res.json({ fragrances, variants, suppliers, locations, packaging });
});

router.get('/simple/products', requireAuth, async (req, res) => {
  const rows = await query(
    `SELECT f.id, f.brand, f.name, f.description, f.top_notes, f.middle_notes, f.base_notes, f.image_url, f.image_alt_text,
      COUNT(sb.id) AS bottle_count,
      SUM(CASE WHEN sb.status = 'opened' THEN 1 ELSE 0 END) AS opened_bottles,
      SUM(CASE WHEN sb.status = 'unopened' THEN 1 ELSE 0 END) AS unopened_bottles,
      COALESCE(SUM(sb.remaining_ml - sb.reserved_ml), 0) AS available_ml,
      COALESCE(SUM(sb.purchase_cost + sb.landed_cost), 0) AS total_cost,
      COALESCE(SUM(sb.bottle_size_ml), 0) AS total_bought_ml,
      COALESCE(MAX(pa.accessory_count), 0) AS accessory_count,
      COALESCE(MAX(pa.accessory_cost), 0) AS accessory_cost
     FROM fragrances f
     LEFT JOIN source_bottles sb ON sb.fragrance_id = f.id AND sb.status <> 'archived'
     LEFT JOIN (
       SELECT fragrance_id, COUNT(*) AS accessory_count, SUM(total_cost) AS accessory_cost
       FROM product_accessories
       GROUP BY fragrance_id
     ) pa ON pa.fragrance_id = f.id
     WHERE f.active = 1
     GROUP BY f.id
     ORDER BY f.brand, f.name`
  );
  res.json(rows);
});

// Options for the product form datalist — from the accessory catalog (with default cost).
router.get('/simple/accessory-options', requireAuth, async (req, res) => {
  const rows = await query('SELECT name, default_cost FROM accessory_catalog ORDER BY name ASC');
  res.json(rows);
});

// Accessories management page: list catalog with how many products use each.
router.get('/simple/accessories', requireAuth, async (req, res) => {
  const rows = await query(
    `SELECT a.id, a.name, a.default_cost,
       (SELECT COUNT(*) FROM product_accessories pa WHERE pa.name = a.name) AS usage_count
     FROM accessory_catalog a
     ORDER BY a.name ASC`
  );
  res.json(rows);
});

router.post('/simple/accessories', requireRole('owner', 'manager'), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const defaultCost = roundMoney(Number(req.body?.default_cost || 0));
  if (!name) return res.status(400).json({ error: 'Accessory name is required.' });
  await query(
    `INSERT INTO accessory_catalog (name, default_cost) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE default_cost = VALUES(default_cost)`,
    [name, defaultCost]
  );
  res.status(201).json({ ok: true });
});

router.delete('/simple/accessories/:id', requireRole('owner', 'manager'), async (req, res) => {
  const id = Number(req.params.id);
  await query('DELETE FROM accessory_catalog WHERE id = ?', [id]);
  res.json({ ok: true });
});

router.post('/simple/products', requireRole('owner', 'manager'), upload.single('image'), async (req, res) => {
  const b = req.body;
  const bottleSizeMl = Number(b.bottle_size_ml || 0);
  const bottleQuantity = Math.max(1, Number.parseInt(b.bottle_quantity || '1', 10));
  const purchaseCost = Number(b.purchase_cost || 0);
  const accessories = parseAccessories(b.accessories_json);
  const accessoryCost = roundMoney(accessories.reduce((sum, item) => sum + item.total_cost, 0));
  if (!b.brand || !b.name || bottleSizeMl <= 0) {
    return res.status(400).json({ error: 'Brand, product name, and product ml are required.' });
  }

  const totalProductCost = roundMoney(purchaseCost * bottleQuantity + accessoryCost);
  const targetIncome = roundMoney(Number(b.target_income || 0));
  const targetSellingPrice = roundMoney(totalProductCost + targetIncome);
  const price5ml = roundMoney(Number(b.price_5ml || 0));
  const price10ml = roundMoney(Number(b.price_10ml || 0));
  const priceFullBottle = roundMoney(Number(b.price_full_bottle || 0));

  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const result = await transaction(async (connection) => {
    const [[duplicate]] = await connection.execute(
      `SELECT id FROM fragrances
       WHERE LOWER(brand) = LOWER(?) AND LOWER(name) = LOWER(?) AND COALESCE(concentration, '') = ''
       LIMIT 1`,
      [b.brand, b.name]
    );
    if (duplicate) {
      throw Object.assign(new Error('This product already exists. Use a different brand or product name.'), { status: 409 });
    }

    const [fragrance] = await connection.execute(
      `INSERT INTO fragrances
       (brand, name, concentration, description, top_notes, middle_notes, base_notes, image_url, image_alt_text, active, target_income, target_selling_price, price_5ml, price_10ml, price_full_bottle)
       VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
      [b.brand, b.name, b.description || null, b.top_notes || null, b.middle_notes || null, b.base_notes || null, imageUrl, b.image_alt_text || `${b.brand} ${b.name}`, targetIncome, targetSellingPrice, price5ml, price10ml, priceFullBottle]
    );
    const fragranceId = fragrance.insertId;
    if (req.file) {
      await connection.execute(
        `INSERT INTO product_images
         (fragrance_id, file_name, file_path, mime_type, file_size_bytes, alt_text, uploaded_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [fragranceId, req.file.originalname, imageUrl, req.file.mimetype, req.file.size, b.image_alt_text || null, userId(req)]
      );
    }

    for (const accessory of accessories) {
      await connection.execute(
        `INSERT INTO product_accessories (fragrance_id, name, unit_cost, quantity, total_cost)
         VALUES (?, ?, ?, ?, ?)`,
        [fragranceId, accessory.name, accessory.unit_cost, accessory.quantity, accessory.total_cost]
      );
      // Keep the accessory catalog in sync so new accessories appear as options next time.
      if (accessory.name) {
        await connection.execute(
          'INSERT IGNORE INTO accessory_catalog (name, default_cost) VALUES (?, ?)',
          [accessory.name, accessory.unit_cost || 0]
        );
      }
    }

    const accessoryCostPerBottle = roundMoney(accessoryCost / bottleQuantity);
    const costPerMl = calculateCostPerMl(purchaseCost, accessoryCostPerBottle, bottleSizeMl);
    const bottleIds = [];
    for (let index = 0; index < bottleQuantity; index += 1) {
      const lotCode = bottleQuantity > 1 && b.lot_code ? `${b.lot_code}-${index + 1}` : b.lot_code || null;
      const [bottle] = await connection.execute(
        `INSERT INTO source_bottles
         (fragrance_id, lot_code, bottle_size_ml, remaining_ml, purchase_cost, landed_cost, cost_per_ml, purchase_date, status, full_bottle_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unopened', 'not_sellable')`,
        [fragranceId, lotCode, bottleSizeMl, bottleSizeMl, purchaseCost, accessoryCostPerBottle, costPerMl, b.purchase_date || null]
      );
      bottleIds.push(bottle.insertId);
      await connection.execute(
        `INSERT INTO inventory_movements
         (movement_type, item_type, fragrance_id, source_bottle_id, quantity_delta, unit, cost_delta, reason_code, notes, created_by_user_id)
         VALUES ('receive', 'source_bottle', ?, ?, ?, 'ml', ?, 'stock_received', ?, ?)`,
        [fragranceId, bottle.insertId, bottleSizeMl, purchaseCost + accessoryCostPerBottle, b.description || null, userId(req)]
      );
    }
    await writeAudit(connection, userId(req), 'create', 'simple_product', fragranceId, null, b, req);
    return {
      fragranceId,
      bottleId: bottleIds[0],
      bottleIds,
      bottleQuantity,
      accessoryCost,
      totalProductCost,
      targetIncome,
      targetSellingPrice
    };
  });
  res.status(201).json(result);
});

router.get('/simple/products/:id', requireAuth, async (req, res) => {
  const fragranceId = Number(req.params.id);
  const rows = await query(
    `SELECT f.*, COUNT(sb.id) AS bottle_quantity,
      COALESCE(MAX(sb.bottle_size_ml), 0) AS bottle_size_ml,
      COALESCE(MAX(sb.purchase_cost), 0) AS purchase_cost,
      DATE_FORMAT(MAX(sb.purchase_date), '%Y-%m-%d') AS purchase_date,
      COALESCE(SUM(sb.purchase_cost + sb.landed_cost), 0) AS total_cost
     FROM fragrances f
     LEFT JOIN source_bottles sb ON sb.fragrance_id = f.id AND sb.status <> 'archived'
     WHERE f.id = ?
     GROUP BY f.id`,
    [fragranceId]
  );
  const product = rows[0];
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const accessories = await query(
    'SELECT id, name, unit_cost, quantity, total_cost FROM product_accessories WHERE fragrance_id = ? ORDER BY id',
    [fragranceId]
  );
  res.json({ product, accessories });
});

router.put('/simple/products/:id', requireRole('owner', 'manager'), upload.single('image'), async (req, res) => {
  const fragranceId = Number(req.params.id);
  const b = req.body;
  const bottleSizeMl = Number(b.bottle_size_ml || 0);
  const bottleQuantity = Math.max(1, Number.parseInt(b.bottle_quantity || '1', 10));
  const purchaseCost = Number(b.purchase_cost || 0);
  const accessories = parseAccessories(b.accessories_json);
  const accessoryCost = roundMoney(accessories.reduce((sum, item) => sum + item.total_cost, 0));
  if (!b.brand || !b.name || bottleSizeMl <= 0) {
    return res.status(400).json({ error: 'Brand, product name, and ml per bottle are required.' });
  }

  const totalProductCost = roundMoney(purchaseCost * bottleQuantity + accessoryCost);
  const targetIncome = roundMoney(Number(b.target_income || 0));
  const targetSellingPrice = roundMoney(totalProductCost + targetIncome);
  const price5ml = roundMoney(Number(b.price_5ml || 0));
  const price10ml = roundMoney(Number(b.price_10ml || 0));
  const priceFullBottle = roundMoney(Number(b.price_full_bottle || 0));

  const result = await transaction(async (connection) => {
    const [[product]] = await connection.execute('SELECT * FROM fragrances WHERE id = ?', [fragranceId]);
    if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });

    const [bottles] = await connection.execute('SELECT id FROM source_bottles WHERE fragrance_id = ? ORDER BY id', [fragranceId]);
    const bottleIds = bottles.map((row) => row.id);
    // If the product has sales history we still allow editing, but we must NOT rebuild the
    // bottles (deleting/resetting them would corrupt sold stock and break order references).
    let hasSales = false;
    if (bottleIds.length) {
      const bottlePlaceholders = bottleIds.map(() => '?').join(',');
      const [[saleUsage]] = await connection.execute(
        `SELECT COUNT(*) AS count FROM order_lines WHERE source_bottle_id IN (${bottlePlaceholders})`,
        bottleIds
      );
      hasSales = Number(saleUsage.count) > 0;
    }

    const [[duplicate]] = await connection.execute(
      `SELECT id FROM fragrances
       WHERE id <> ? AND LOWER(brand) = LOWER(?) AND LOWER(name) = LOWER(?) AND COALESCE(concentration, '') = ''
       LIMIT 1`,
      [fragranceId, b.brand, b.name]
    );
    if (duplicate) {
      throw Object.assign(new Error('Another product already uses this brand and name.'), { status: 409 });
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : product.image_url;
    await connection.execute(
      `UPDATE fragrances SET brand=?, name=?, description=?, top_notes=?, middle_notes=?, base_notes=?, image_url=?, image_alt_text=?, target_income=?, target_selling_price=?, price_5ml=?, price_10ml=?, price_full_bottle=? WHERE id=?`,
      [b.brand, b.name, b.description || null, b.top_notes || null, b.middle_notes || null, b.base_notes || null, imageUrl, b.image_alt_text || `${b.brand} ${b.name}`, targetIncome, targetSellingPrice, price5ml, price10ml, priceFullBottle, fragranceId]
    );
    if (req.file) {
      await connection.execute(
        `INSERT INTO product_images
         (fragrance_id, file_name, file_path, mime_type, file_size_bytes, alt_text, uploaded_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [fragranceId, req.file.originalname, imageUrl, req.file.mimetype, req.file.size, b.image_alt_text || null, userId(req)]
      );
    }

    await connection.execute('DELETE FROM product_accessories WHERE fragrance_id = ?', [fragranceId]);
    for (const accessory of accessories) {
      await connection.execute(
        `INSERT INTO product_accessories (fragrance_id, name, unit_cost, quantity, total_cost)
         VALUES (?, ?, ?, ?, ?)`,
        [fragranceId, accessory.name, accessory.unit_cost, accessory.quantity, accessory.total_cost]
      );
      // Keep the accessory catalog in sync so new accessories appear as options next time.
      if (accessory.name) {
        await connection.execute(
          'INSERT IGNORE INTO accessory_catalog (name, default_cost) VALUES (?, ?)',
          [accessory.name, accessory.unit_cost || 0]
        );
      }
    }

    // Only rebuild bottles when there is no sales history. Editing a product that has been
    // sold updates its details (name, notes, cost target, accessories) but leaves stock intact.
    if (!hasSales) {
      const accessoryCostPerBottle = roundMoney(accessoryCost / bottleQuantity);
      const costPerMl = calculateCostPerMl(purchaseCost, accessoryCostPerBottle, bottleSizeMl);
      if (bottleIds.length) {
        const bottlePlaceholders = bottleIds.map(() => '?').join(',');
        await connection.execute(`DELETE FROM inventory_movements WHERE source_bottle_id IN (${bottlePlaceholders})`, bottleIds);
      }
      if (bottleQuantity < bottleIds.length) {
        const extraIds = bottleIds.slice(bottleQuantity);
        const extraPlaceholders = extraIds.map(() => '?').join(',');
        await connection.execute(`DELETE FROM source_bottles WHERE id IN (${extraPlaceholders})`, extraIds);
        bottleIds.length = bottleQuantity;
      }
      for (let index = 0; index < bottleQuantity; index += 1) {
        const existingId = bottleIds[index];
        const lotCode = bottleQuantity > 1 && b.lot_code ? `${b.lot_code}-${index + 1}` : b.lot_code || null;
        if (existingId) {
          await connection.execute(
            `UPDATE source_bottles
             SET lot_code=?, bottle_size_ml=?, remaining_ml=?, purchase_cost=?, landed_cost=?, cost_per_ml=?, purchase_date=?
             WHERE id=?`,
            [lotCode, bottleSizeMl, bottleSizeMl, purchaseCost, accessoryCostPerBottle, costPerMl, b.purchase_date || null, existingId]
          );
          await connection.execute(
            `INSERT INTO inventory_movements
             (movement_type, item_type, fragrance_id, source_bottle_id, quantity_delta, unit, cost_delta, reason_code, notes, created_by_user_id)
             VALUES ('receive', 'source_bottle', ?, ?, ?, 'ml', ?, 'stock_received', ?, ?)`,
            [fragranceId, existingId, bottleSizeMl, purchaseCost + accessoryCostPerBottle, b.description || null, userId(req)]
          );
        } else {
          const [bottle] = await connection.execute(
            `INSERT INTO source_bottles
             (fragrance_id, lot_code, bottle_size_ml, remaining_ml, purchase_cost, landed_cost, cost_per_ml, purchase_date, status, full_bottle_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unopened', 'not_sellable')`,
            [fragranceId, lotCode, bottleSizeMl, bottleSizeMl, purchaseCost, accessoryCostPerBottle, costPerMl, b.purchase_date || null]
          );
          await connection.execute(
            `INSERT INTO inventory_movements
             (movement_type, item_type, fragrance_id, source_bottle_id, quantity_delta, unit, cost_delta, reason_code, notes, created_by_user_id)
             VALUES ('receive', 'source_bottle', ?, ?, ?, 'ml', ?, 'stock_received', ?, ?)`,
            [fragranceId, bottle.insertId, bottleSizeMl, purchaseCost + accessoryCostPerBottle, b.description || null, userId(req)]
          );
        }
      }
    }
    await writeAudit(connection, userId(req), 'update', 'simple_product', fragranceId, product, b, req);
    return { hasSales };
  });

  res.json({ ok: true, hasSales: result.hasSales });
});

router.post('/simple/products/:id/add-to-decants', requireRole('owner', 'manager', 'inventory_staff'), async (req, res) => {
  const fragranceId = Number(req.params.id);
  const quantity = Math.max(1, Number.parseInt(req.body?.quantity || '1', 10));
  const opened = await transaction(async (connection) => {
    const [bottles] = await connection.execute(
      `SELECT * FROM source_bottles
       WHERE fragrance_id = ? AND status = 'unopened'
       ORDER BY created_at, id
       LIMIT ${quantity} FOR UPDATE`,
      [fragranceId]
    );
    if (!bottles.length) {
      throw Object.assign(new Error('No unopened bottle is available for this product.'), { status: 400 });
    }
    for (const bottle of bottles) {
      await connection.execute(
        `UPDATE source_bottles
         SET status='opened', full_bottle_status='opened', opened_at=NOW(), opened_by_user_id=?
         WHERE id=?`,
        [userId(req), bottle.id]
      );
      await connection.execute(`UPDATE full_bottle_stock SET status='opened', quantity_on_hand=0 WHERE source_bottle_id=?`, [bottle.id]);
      await writeAudit(connection, userId(req), 'open', 'source_bottle', bottle.id, bottle, { status: 'opened' }, req);
    }
    return bottles.length;
  });
  res.json({ ok: true, opened });
});

router.delete('/simple/products/:id', requireRole('owner', 'manager'), async (req, res) => {
  const fragranceId = Number(req.params.id);
  if (!Number.isInteger(fragranceId) || fragranceId <= 0) {
    return res.status(400).json({ error: 'Invalid product id.' });
  }

  const result = await transaction(async (connection) => {
    const [[product]] = await connection.execute('SELECT * FROM fragrances WHERE id = ?', [fragranceId]);
    if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });

    let hasHistory = false;
    const [bottles] = await connection.execute('SELECT id FROM source_bottles WHERE fragrance_id = ?', [fragranceId]);
    const bottleIds = bottles.map((row) => row.id);
    if (bottleIds.length) {
      const bottlePlaceholders = bottleIds.map(() => '?').join(',');
      const [[saleUsage]] = await connection.execute(
        `SELECT COUNT(*) AS count FROM order_lines WHERE source_bottle_id IN (${bottlePlaceholders})`,
        bottleIds
      );
      if (Number(saleUsage.count) > 0) {
        hasHistory = true;
      }
    }

    const [variants] = await connection.execute('SELECT id FROM product_variants WHERE fragrance_id = ?', [fragranceId]);
    const variantIds = variants.map((row) => row.id);
    if (variantIds.length) {
      const variantPlaceholders = variantIds.map(() => '?').join(',');
      const [[variantUsage]] = await connection.execute(
        `SELECT COUNT(*) AS count FROM order_lines WHERE product_variant_id IN (${variantPlaceholders})`,
        variantIds
      );
      if (Number(variantUsage.count) > 0) {
        hasHistory = true;
      }
    }

    const [countLines] = await connection.execute(
      'SELECT id FROM stock_count_lines WHERE source_bottle_id IN (SELECT id FROM source_bottles WHERE fragrance_id = ?) OR product_variant_id IN (SELECT id FROM product_variants WHERE fragrance_id = ?) LIMIT 1',
      [fragranceId, fragranceId]
    );
    if (countLines.length) {
      hasHistory = true;
    }

    const [purchaseLines] = await connection.execute('SELECT id FROM purchase_order_lines WHERE fragrance_id = ? LIMIT 1', [fragranceId]);
    if (purchaseLines.length) {
      hasHistory = true;
    }

    if (hasHistory) {
      await archiveProduct(connection, fragranceId, req, product);
      return { archived: true };
    }

    const [batches] = await connection.execute('SELECT id FROM decant_batches WHERE fragrance_id = ?', [fragranceId]);
    const batchIds = batches.map((row) => row.id);
    if (batchIds.length) {
      const batchPlaceholders = batchIds.map(() => '?').join(',');
      await connection.execute(`DELETE FROM decant_batch_packaging WHERE decant_batch_id IN (${batchPlaceholders})`, batchIds);
      await connection.execute(`DELETE FROM finished_decant_stock WHERE decant_batch_id IN (${batchPlaceholders})`, batchIds);
      await connection.execute(
        `DELETE FROM inventory_movements WHERE reference_type = 'decant_batch' AND reference_id IN (${batchPlaceholders})`,
        batchIds
      );
      await connection.execute(`DELETE FROM decant_batches WHERE id IN (${batchPlaceholders})`, batchIds);
    }

    if (bottleIds.length) {
      const bottlePlaceholders = bottleIds.map(() => '?').join(',');
      await connection.execute(`DELETE FROM inventory_movements WHERE source_bottle_id IN (${bottlePlaceholders})`, bottleIds);
      await connection.execute(`DELETE FROM full_bottle_stock WHERE source_bottle_id IN (${bottlePlaceholders})`, bottleIds);
      await connection.execute(`DELETE FROM source_bottles WHERE id IN (${bottlePlaceholders})`, bottleIds);
    }
    if (variantIds.length) {
      const variantPlaceholders = variantIds.map(() => '?').join(',');
      await connection.execute(`DELETE FROM inventory_movements WHERE product_variant_id IN (${variantPlaceholders})`, variantIds);
      await connection.execute(`DELETE FROM finished_decant_stock WHERE product_variant_id IN (${variantPlaceholders})`, variantIds);
      await connection.execute(`DELETE FROM full_bottle_stock WHERE product_variant_id IN (${variantPlaceholders})`, variantIds);
      await connection.execute(`DELETE FROM product_variants WHERE id IN (${variantPlaceholders})`, variantIds);
    }
    await connection.execute('DELETE FROM product_accessories WHERE fragrance_id = ?', [fragranceId]);
    await connection.execute('DELETE FROM product_images WHERE fragrance_id = ?', [fragranceId]);
    await connection.execute('DELETE FROM inventory_movements WHERE fragrance_id = ?', [fragranceId]);
    await connection.execute('DELETE FROM audit_logs WHERE entity_type IN ("fragrance", "simple_product") AND entity_id = ?', [fragranceId]);
    await connection.execute('DELETE FROM fragrances WHERE id = ?', [fragranceId]);
    return { archived: false };
  });

  res.json({ ok: true, ...result });
});

router.get('/simple/decants', requireAuth, async (req, res) => {
  const rows = await query(
    `SELECT sb.id AS source_bottle_id, sb.fragrance_id, sb.lot_code, sb.bottle_size_ml, sb.remaining_ml,
      sb.reserved_ml, sb.cost_per_ml, sb.purchase_cost, sb.landed_cost,
      CONCAT(f.brand, ' ', f.name) AS product_name, f.image_url
     FROM source_bottles sb
     JOIN fragrances f ON f.id = sb.fragrance_id
     WHERE f.active = 1 AND sb.status = 'opened' AND sb.remaining_ml - sb.reserved_ml > 0
     ORDER BY f.brand, f.name, sb.opened_at DESC`
  );
  res.json(rows);
});

const SALE_STATUS_MAP = {
  completed: { order: 'fulfilled', line: 'fulfilled' },
  pending: { order: 'reserved', line: 'reserved' },
  cancelled: { order: 'cancelled', line: 'cancelled' }
};

router.post('/simple/decant-sales', requireRole('owner', 'manager', 'order_staff'), async (req, res) => {
  const b = req.body;
  const soldMl = Number(b.sold_ml || 0);
  const soldPrice = Number(b.sold_price || 0);
  if (!b.source_bottle_id || soldMl <= 0 || soldPrice < 0) {
    return res.status(400).json({ error: 'Select a decant product, sold ml, and selling price.' });
  }
  const statusKey = String(b.status || 'completed').toLowerCase();
  const status = SALE_STATUS_MAP[statusKey] || SALE_STATUS_MAP.completed;
  const isCompleted = statusKey === 'completed';
  const isCancelled = statusKey === 'cancelled';

  const result = await transaction(async (connection) => {
    const [[bottle]] = await connection.execute(
      `SELECT sb.*, f.brand, f.name
       FROM source_bottles sb
       JOIN fragrances f ON f.id = sb.fragrance_id
       WHERE sb.id = ? FOR UPDATE`,
      [b.source_bottle_id]
    );
    if (!bottle) throw Object.assign(new Error('Bottle not found'), { status: 404 });
    // Only completed and pending need real, sellable stock; cancelled is just a record.
    if (!isCancelled) {
      if (bottle.status !== 'opened') throw Object.assign(new Error('Open this bottle for decanting before selling.'), { status: 400 });
      const availableMl = Number(bottle.remaining_ml) - Number(bottle.reserved_ml);
      if (availableMl < soldMl) throw Object.assign(new Error('Not enough ml available for this sale.'), { status: 400 });
    }

    const variantId = await getOrCreateOneMlVariant(connection, bottle.fragrance_id);
    const totalCogs = roundMoney(soldMl * Number(bottle.cost_per_ml || 0));
    const grossProfit = roundMoney(soldPrice - totalCogs);
    const marginPercent = soldPrice > 0 ? roundMoney((grossProfit / soldPrice) * 100) : 0;
    const orderNo = orderNumber('DECANT');
    const notes = [
      b.fulfillment_method ? `Fulfillment: ${b.fulfillment_method}` : null,
      b.customer_address ? `Address: ${b.customer_address}` : null,
      b.notes || null
    ].filter(Boolean).join('\n');

    const [order] = await connection.execute(
      `INSERT INTO orders
       (order_number, customer_name, customer_phone, customer_email, channel, status, subtotal, total_cogs,
        gross_profit, gross_margin_percent, notes, created_by_user_id, fulfilled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNo,
        b.customer_name || null,
        b.customer_phone || null,
        b.customer_email || null,
        b.fulfillment_method || 'manual',
        status.order,
        roundMoney(soldPrice),
        totalCogs,
        grossProfit,
        marginPercent,
        notes || null,
        userId(req),
        isCompleted ? new Date() : null
      ]
    );
    await connection.execute(
      `INSERT INTO order_lines
       (order_id, product_variant_id, quantity, unit_price, sold_ml, liquid_cogs, total_cogs, gross_profit, source_bottle_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [order.insertId, variantId, soldMl, soldMl > 0 ? roundMoney(soldPrice / soldMl) : 0, soldMl, totalCogs, totalCogs, grossProfit, bottle.id, status.line]
    );
    // Only a completed sale deducts ml and records a stock movement.
    if (isCompleted) {
      await connection.execute(
        'UPDATE source_bottles SET remaining_ml = remaining_ml - ? WHERE id = ?',
        [soldMl, bottle.id]
      );
      await connection.execute(
        `INSERT INTO inventory_movements
         (movement_type, item_type, fragrance_id, source_bottle_id, product_variant_id, quantity_delta, unit, cost_delta,
          reference_type, reference_id, reason_code, notes, created_by_user_id)
         VALUES ('sale', 'source_bottle', ?, ?, ?, ?, 'ml', ?, 'order', ?, 'decant_sale', ?, ?)`,
        [bottle.fragrance_id, bottle.id, variantId, -soldMl, -totalCogs, order.insertId, notes || null, userId(req)]
      );
    }
    await writeAudit(connection, userId(req), 'sell', 'decant', order.insertId, null, b, req);
    return { orderId: order.insertId, orderNumber: orderNo, status: status.order };
  });
  res.status(201).json(result);
});

router.put('/simple/decant-sales/:id', requireRole('owner', 'manager', 'order_staff'), async (req, res) => {
  const orderId = Number(req.params.id);
  const b = req.body;
  const soldMl = Number(b.sold_ml || 0);
  const soldPrice = Number(b.sold_price || 0);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ error: 'Invalid sale id.' });
  }
  if (soldMl <= 0 || soldPrice < 0) {
    return res.status(400).json({ error: 'Sold ml and selling price are required.' });
  }
  const statusKey = String(b.status || 'completed').toLowerCase();
  const status = SALE_STATUS_MAP[statusKey] || SALE_STATUS_MAP.completed;
  const isCompleted = statusKey === 'completed';

  await transaction(async (connection) => {
    const [[order]] = await connection.execute('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order) throw Object.assign(new Error('Sale not found'), { status: 404 });
    const [[line]] = await connection.execute(
      'SELECT * FROM order_lines WHERE order_id = ? ORDER BY id LIMIT 1',
      [orderId]
    );
    if (!line || !line.source_bottle_id) throw Object.assign(new Error('This sale cannot be edited here.'), { status: 400 });
    const [[bottle]] = await connection.execute('SELECT * FROM source_bottles WHERE id = ? FOR UPDATE', [line.source_bottle_id]);
    if (!bottle) throw Object.assign(new Error('Bottle not found'), { status: 404 });

    // Reverse the old stock effect, then apply the new one.
    const oldDeducted = line.status === 'fulfilled' ? Number(line.sold_ml || 0) : 0;
    const newDeducted = isCompleted ? soldMl : 0;
    const availableAfterRestore = Number(bottle.remaining_ml) + oldDeducted - Number(bottle.reserved_ml);
    if (isCompleted && availableAfterRestore < soldMl) {
      throw Object.assign(new Error('Not enough ml available for this sale.'), { status: 400 });
    }

    const totalCogs = roundMoney(soldMl * Number(bottle.cost_per_ml || 0));
    const grossProfit = roundMoney(soldPrice - totalCogs);
    const marginPercent = soldPrice > 0 ? roundMoney((grossProfit / soldPrice) * 100) : 0;
    const notes = [
      b.fulfillment_method ? `Fulfillment: ${b.fulfillment_method}` : null,
      b.customer_address ? `Address: ${b.customer_address}` : null,
      b.notes || null
    ].filter(Boolean).join('\n');

    const netDelta = oldDeducted - newDeducted;
    if (netDelta !== 0) {
      await connection.execute('UPDATE source_bottles SET remaining_ml = remaining_ml + ? WHERE id = ?', [netDelta, line.source_bottle_id]);
    }
    // Rebuild this order's sale movement so reports stay correct.
    await connection.execute("DELETE FROM inventory_movements WHERE reference_type = 'order' AND reference_id = ?", [orderId]);
    if (isCompleted) {
      await connection.execute(
        `INSERT INTO inventory_movements
         (movement_type, item_type, fragrance_id, source_bottle_id, product_variant_id, quantity_delta, unit, cost_delta,
          reference_type, reference_id, reason_code, notes, created_by_user_id)
         VALUES ('sale', 'source_bottle', ?, ?, ?, ?, 'ml', ?, 'order', ?, 'decant_sale', ?, ?)`,
        [bottle.fragrance_id, bottle.id, line.product_variant_id, -soldMl, -totalCogs, orderId, notes || null, userId(req)]
      );
    }

    await connection.execute(
      `UPDATE order_lines
       SET quantity = ?, unit_price = ?, sold_ml = ?, liquid_cogs = ?, total_cogs = ?, gross_profit = ?, status = ?
       WHERE id = ?`,
      [soldMl, soldMl > 0 ? roundMoney(soldPrice / soldMl) : 0, soldMl, totalCogs, totalCogs, grossProfit, status.line, line.id]
    );
    await connection.execute(
      `UPDATE orders
       SET customer_name = ?, customer_phone = ?, customer_email = ?, channel = ?, status = ?,
         subtotal = ?, total_cogs = ?, gross_profit = ?, gross_margin_percent = ?, notes = ?, fulfilled_at = ?
       WHERE id = ?`,
      [
        b.customer_name || null,
        b.customer_phone || null,
        b.customer_email || null,
        b.fulfillment_method || 'manual',
        status.order,
        roundMoney(soldPrice),
        totalCogs,
        grossProfit,
        marginPercent,
        notes || null,
        isCompleted ? new Date() : null,
        orderId
      ]
    );
    await writeAudit(connection, userId(req), 'update', 'decant_sale', orderId, order, b, req);
  });
  res.json({ ok: true });
});

router.post('/simple/bottle-sales', requireRole('owner', 'manager', 'order_staff'), async (req, res) => {
  const b = req.body;
  const soldPrice = Number(b.sold_price || 0);
  if (!b.source_bottle_id || soldPrice < 0) {
    return res.status(400).json({ error: 'Select a bottle and a selling price.' });
  }

  const result = await transaction(async (connection) => {
    const [[bottle]] = await connection.execute(
      `SELECT sb.*, CONCAT(f.brand, ' ', f.name) AS fragrance_name
       FROM source_bottles sb
       JOIN fragrances f ON f.id = sb.fragrance_id
       WHERE sb.id = ? FOR UPDATE`,
      [b.source_bottle_id]
    );
    if (!bottle) throw Object.assign(new Error('Bottle not found'), { status: 404 });
    if (bottle.status === 'archived' || bottle.full_bottle_status === 'sold') {
      throw Object.assign(new Error('This bottle was already sold.'), { status: 400 });
    }
    if (bottle.status !== 'unopened') {
      throw Object.assign(new Error('Only unopened bottles can be sold whole. Opened bottles are sold per ml on the Decants page.'), { status: 400 });
    }

    const variantId = await getOrCreateFullBottleVariant(connection, bottle.fragrance_id, bottle.bottle_size_ml);
    const totalCogs = roundMoney(Number(bottle.purchase_cost || 0) + Number(bottle.landed_cost || 0));
    const grossProfit = roundMoney(soldPrice - totalCogs);
    const marginPercent = soldPrice > 0 ? roundMoney((grossProfit / soldPrice) * 100) : 0;
    const orderNo = orderNumber('BOTTLE');
    const notes = [
      b.fulfillment_method ? `Fulfillment: ${b.fulfillment_method}` : null,
      b.customer_address ? `Address: ${b.customer_address}` : null,
      b.notes || null
    ].filter(Boolean).join('\n');

    const [order] = await connection.execute(
      `INSERT INTO orders
       (order_number, customer_name, customer_phone, customer_email, channel, status, subtotal, total_cogs,
        gross_profit, gross_margin_percent, notes, created_by_user_id, fulfilled_at)
       VALUES (?, ?, ?, ?, 'bottle', 'fulfilled', ?, ?, ?, ?, ?, ?, NOW())`,
      [
        orderNo,
        b.customer_name || null,
        b.customer_phone || null,
        b.customer_email || null,
        roundMoney(soldPrice),
        totalCogs,
        grossProfit,
        marginPercent,
        notes || null,
        userId(req)
      ]
    );
    await connection.execute(
      `INSERT INTO order_lines
       (order_id, product_variant_id, quantity, unit_price, sold_ml, liquid_cogs, total_cogs, gross_profit, source_bottle_id, status)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, 'fulfilled')`,
      [order.insertId, variantId, roundMoney(soldPrice), bottle.bottle_size_ml, totalCogs, totalCogs, grossProfit, bottle.id]
    );
    await connection.execute(
      `UPDATE source_bottles
       SET remaining_ml = 0, reserved_ml = 0, status = 'archived', full_bottle_status = 'sold'
       WHERE id = ?`,
      [bottle.id]
    );
    await connection.execute(
      `INSERT INTO inventory_movements
       (movement_type, item_type, fragrance_id, source_bottle_id, product_variant_id, quantity_delta, unit, cost_delta,
        reference_type, reference_id, reason_code, notes, created_by_user_id)
       VALUES ('sale', 'source_bottle', ?, ?, ?, -1, 'bottle', ?, 'order', ?, 'bottle_sale', ?, ?)`,
      [bottle.fragrance_id, bottle.id, variantId, -totalCogs, order.insertId, notes || null, userId(req)]
    );
    await writeAudit(connection, userId(req), 'sell', 'bottle', order.insertId, null, b, req);
    return { orderId: order.insertId, orderNumber: orderNo };
  });
  res.status(201).json(result);
});

router.get('/fragrances', requireAuth, async (req, res) => {
  const rows = await query(
    `SELECT f.*,
      COUNT(DISTINCT pv.id) AS variant_count,
      COALESCE(SUM(sb.remaining_ml - sb.reserved_ml), 0) AS available_ml
     FROM fragrances f
     LEFT JOIN product_variants pv ON pv.fragrance_id = f.id
     LEFT JOIN source_bottles sb ON sb.fragrance_id = f.id AND sb.status <> 'archived'
     WHERE f.active = 1
     GROUP BY f.id
     ORDER BY f.brand, f.name`
  );
  res.json(rows);
});

router.post('/fragrances', requireRole('owner', 'manager'), upload.single('image'), async (req, res) => {
  const body = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const result = await transaction(async (connection) => {
    const [insert] = await connection.execute(
      `INSERT INTO fragrances
        (brand, name, concentration, category, top_notes, middle_notes, base_notes, description, image_url, image_alt_text, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.brand,
        body.name,
        body.concentration || null,
        body.category || null,
        body.top_notes || null,
        body.middle_notes || null,
        body.base_notes || null,
        body.description || null,
        imageUrl,
        body.image_alt_text || `${body.brand} ${body.name}`,
        body.active === 'false' ? 0 : 1
      ]
    );
    if (req.file) {
      await connection.execute(
        `INSERT INTO product_images
          (fragrance_id, file_name, file_path, mime_type, file_size_bytes, alt_text, uploaded_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [insert.insertId, req.file.originalname, imageUrl, req.file.mimetype, req.file.size, body.image_alt_text || null, userId(req)]
      );
    }
    await writeAudit(connection, userId(req), 'create', 'fragrance', insert.insertId, null, body, req);
    return insert.insertId;
  });
  res.status(201).json({ id: result });
});

router.put('/fragrances/:id', requireRole('owner', 'manager'), upload.single('image'), async (req, res) => {
  const id = Number(req.params.id);
  const before = (await query('SELECT * FROM fragrances WHERE id = ?', [id]))[0];
  if (!before) return res.status(404).json({ error: 'Fragrance not found' });
  const body = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : before.image_url;
  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE fragrances SET brand=?, name=?, concentration=?, category=?, top_notes=?, middle_notes=?,
       base_notes=?, description=?, image_url=?, image_alt_text=?, active=? WHERE id=?`,
      [
        body.brand,
        body.name,
        body.concentration || null,
        body.category || null,
        body.top_notes || null,
        body.middle_notes || null,
        body.base_notes || null,
        body.description || null,
        imageUrl,
        body.image_alt_text || null,
        body.active === 'false' ? 0 : 1,
        id
      ]
    );
    if (req.file) {
      await connection.execute(
        `INSERT INTO product_images
          (fragrance_id, file_name, file_path, mime_type, file_size_bytes, alt_text, uploaded_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, req.file.originalname, imageUrl, req.file.mimetype, req.file.size, body.image_alt_text || null, userId(req)]
      );
    }
    await writeAudit(connection, userId(req), 'update', 'fragrance', id, before, { ...body, imageUrl }, req);
  });
  res.json({ ok: true });
});

router.get('/variants', requireAuth, async (req, res) => {
  const rows = await query(
    `SELECT pv.*, CONCAT(f.brand, ' ', f.name) AS fragrance_name, f.image_url
     FROM product_variants pv JOIN fragrances f ON f.id = pv.fragrance_id
     WHERE f.active = 1 AND pv.active = 1
     ORDER BY f.brand, f.name, pv.size_ml`
  );
  res.json(rows);
});

router.post('/variants', requireRole('owner', 'manager'), async (req, res) => {
  const b = req.body;
  const result = await transaction(async (connection) => {
    const [insert] = await connection.execute(
      `INSERT INTO product_variants
       (fragrance_id, sku, barcode, variant_type, size_ml, selling_price, active, low_stock_threshold_units)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.fragrance_id, b.sku, b.barcode || null, b.variant_type, b.size_ml, b.selling_price, b.active ?? 1, b.low_stock_threshold_units || 0]
    );
    await writeAudit(connection, userId(req), 'create', 'product_variant', insert.insertId, null, b, req);
    return insert.insertId;
  });
  res.status(201).json({ id: result });
});

router.get('/suppliers', requireAuth, async (req, res) => {
  res.json(await query('SELECT * FROM suppliers ORDER BY name'));
});

router.post('/suppliers', requireRole('owner', 'manager'), async (req, res) => {
  const b = req.body;
  const result = await transaction(async (connection) => {
    const [insert] = await connection.execute(
      `INSERT INTO suppliers (name, contact_person, email, phone, address, lead_time_days, payment_terms, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.name, b.contact_person || null, b.email || null, b.phone || null, b.address || null, b.lead_time_days || 0, b.payment_terms || null, b.notes || null]
    );
    await writeAudit(connection, userId(req), 'create', 'supplier', insert.insertId, null, b, req);
    return insert.insertId;
  });
  res.status(201).json({ id: result });
});

router.get('/source-bottles', requireAuth, async (req, res) => {
  const rows = await query(
    `SELECT sb.*, CONCAT(f.brand, ' ', f.name) AS fragrance_name, f.image_url, f.image_alt_text,
     s.name AS supplier_name, l.name AS location_name
     FROM source_bottles sb
     JOIN fragrances f ON f.id = sb.fragrance_id
     LEFT JOIN suppliers s ON s.id = sb.supplier_id
     LEFT JOIN locations l ON l.id = sb.location_id
     WHERE f.active = 1 AND sb.status <> 'archived'
     ORDER BY sb.created_at DESC`
  );
  res.json(rows);
});

router.post('/source-bottles', requireRole('owner', 'manager', 'inventory_staff'), async (req, res) => {
  const b = req.body;
  const costPerMl = calculateCostPerMl(b.purchase_cost, b.landed_cost, b.bottle_size_ml);
  const result = await transaction(async (connection) => {
    const [insert] = await connection.execute(
      `INSERT INTO source_bottles
       (fragrance_id, supplier_id, lot_code, bottle_size_ml, remaining_ml, sellable_as_full_bottle,
        full_bottle_status, purchase_cost, landed_cost, cost_per_ml, purchase_date, location_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.fragrance_id,
        b.supplier_id || null,
        b.lot_code || null,
        b.bottle_size_ml,
        b.remaining_ml || b.bottle_size_ml,
        b.sellable_as_full_bottle ? 1 : 0,
        b.sellable_as_full_bottle ? 'available' : 'not_sellable',
        b.purchase_cost || 0,
        b.landed_cost || 0,
        costPerMl,
        b.purchase_date || null,
        b.location_id || null
      ]
    );
    await connection.execute(
      `INSERT INTO inventory_movements
       (movement_type, item_type, fragrance_id, source_bottle_id, quantity_delta, unit, cost_delta, reason_code, created_by_user_id)
       VALUES ('receive', 'source_bottle', ?, ?, ?, 'ml', ?, 'stock_received', ?)`,
      [b.fragrance_id, insert.insertId, b.remaining_ml || b.bottle_size_ml, Number(b.purchase_cost || 0) + Number(b.landed_cost || 0), userId(req)]
    );
    if (b.sellable_as_full_bottle && b.full_bottle_variant_id) {
      await connection.execute(
        `INSERT INTO full_bottle_stock (product_variant_id, source_bottle_id, location_id, unit_cost, status)
         VALUES (?, ?, ?, ?, 'available')`,
        [b.full_bottle_variant_id, insert.insertId, b.location_id || null, Number(b.purchase_cost || 0) + Number(b.landed_cost || 0)]
      );
    }
    await writeAudit(connection, userId(req), 'create', 'source_bottle', insert.insertId, null, b, req);
    return insert.insertId;
  });
  res.status(201).json({ id: result });
});

router.post('/source-bottles/:id/open', requireRole('owner', 'manager', 'inventory_staff'), async (req, res) => {
  const id = Number(req.params.id);
  await transaction(async (connection) => {
    const [[bottle]] = await connection.execute('SELECT * FROM source_bottles WHERE id = ? FOR UPDATE', [id]);
    if (!bottle) throw Object.assign(new Error('Bottle not found'), { status: 404 });
    if (bottle.full_bottle_status === 'sold') throw Object.assign(new Error('Sold bottle cannot be opened'), { status: 400 });
    await connection.execute(
      `UPDATE source_bottles SET status='opened', full_bottle_status='opened', opened_at=NOW(), opened_by_user_id=? WHERE id=?`,
      [userId(req), id]
    );
    await connection.execute(`UPDATE full_bottle_stock SET status='opened', quantity_on_hand=0 WHERE source_bottle_id=?`, [id]);
    await writeAudit(connection, userId(req), 'open', 'source_bottle', id, bottle, { status: 'opened' }, req);
  });
  res.json({ ok: true });
});

router.get('/packaging', requireAuth, async (req, res) => {
  res.json(await query('SELECT * FROM packaging_items ORDER BY name'));
});

router.post('/packaging', requireRole('owner', 'manager', 'inventory_staff'), async (req, res) => {
  const b = req.body;
  const result = await transaction(async (connection) => {
    const [insert] = await connection.execute(
      `INSERT INTO packaging_items (sku, name, category, unit_cost, quantity_on_hand, low_stock_threshold, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [b.sku, b.name, b.category || null, b.unit_cost || 0, b.quantity_on_hand || 0, b.low_stock_threshold || 0, b.active ?? 1]
    );
    await connection.execute(
      `INSERT INTO inventory_movements
       (movement_type, item_type, packaging_item_id, quantity_delta, unit, cost_delta, reason_code, created_by_user_id)
       VALUES ('receive', 'packaging_item', ?, ?, 'unit', ?, 'stock_received', ?)`,
      [insert.insertId, b.quantity_on_hand || 0, Number(b.unit_cost || 0) * Number(b.quantity_on_hand || 0), userId(req)]
    );
    await writeAudit(connection, userId(req), 'create', 'packaging_item', insert.insertId, null, b, req);
    return insert.insertId;
  });
  res.status(201).json({ id: result });
});

router.get('/batches', requireAuth, async (req, res) => {
  const rows = await query(
    `SELECT db.*, CONCAT(f.brand, ' ', f.name) AS fragrance_name, pv.sku, pv.size_ml
     FROM decant_batches db
     JOIN fragrances f ON f.id = db.fragrance_id
     JOIN product_variants pv ON pv.id = db.product_variant_id
     ORDER BY db.created_at DESC`
  );
  res.json(rows);
});

router.post('/batches', requireRole('owner', 'manager', 'inventory_staff'), async (req, res) => {
  const b = req.body;
  const result = await transaction(async (connection) => {
    const [[variant]] = await connection.execute('SELECT * FROM product_variants WHERE id = ? AND variant_type = "decant"', [b.product_variant_id]);
    if (!variant) throw Object.assign(new Error('Decant variant not found'), { status: 404 });
    const [[bottle]] = await connection.execute('SELECT * FROM source_bottles WHERE id = ? FOR UPDATE', [b.source_bottle_id]);
    if (!bottle) throw Object.assign(new Error('Source bottle not found'), { status: 404 });
    if (bottle.full_bottle_status === 'reserved' || bottle.full_bottle_status === 'sold') {
      throw Object.assign(new Error('Bottle is reserved or sold as full-bottle stock'), { status: 400 });
    }
    const calc = calculateDecantDeduction(variant.size_ml, b.completed_quantity, b.wastage_percent || 0, b.fixed_allowance_ml || 0);
    const availableMl = Number(bottle.remaining_ml) - Number(bottle.reserved_ml);
    if (availableMl < calc.totalMl) throw Object.assign(new Error('Not enough source ml for this batch'), { status: 400 });
    const batchNumber = orderNumber('BATCH');
    const [insert] = await connection.execute(
      `INSERT INTO decant_batches
       (batch_number, fragrance_id, source_bottle_id, product_variant_id, planned_quantity, completed_quantity,
        required_ml, wastage_ml, total_deducted_ml, status, created_by_user_id, completed_by_user_id, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, NOW())`,
      [batchNumber, bottle.fragrance_id, bottle.id, variant.id, b.planned_quantity || b.completed_quantity, b.completed_quantity, calc.baseMl, calc.wastageMl, calc.totalMl, userId(req), userId(req)]
    );
    await connection.execute('UPDATE source_bottles SET remaining_ml = remaining_ml - ?, status="opened", full_bottle_status="opened", opened_at = COALESCE(opened_at, NOW()), opened_by_user_id = COALESCE(opened_by_user_id, ?) WHERE id = ?', [calc.totalMl, userId(req), bottle.id]);
    await connection.execute('UPDATE full_bottle_stock SET status="opened", quantity_on_hand=0 WHERE source_bottle_id = ?', [bottle.id]);
    await connection.execute(
      `INSERT INTO finished_decant_stock
       (product_variant_id, decant_batch_id, location_id, quantity_on_hand, unit_liquid_cost, unit_packaging_cost)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [variant.id, insert.insertId, bottle.location_id || null, b.completed_quantity, roundMoney(calc.totalMl * bottle.cost_per_ml / b.completed_quantity), 0]
    );
    await connection.execute(
      `INSERT INTO inventory_movements
       (movement_type, item_type, fragrance_id, source_bottle_id, product_variant_id, quantity_delta, unit, cost_delta, reference_type, reference_id, reason_code, created_by_user_id)
       VALUES ('decant_production', 'source_bottle', ?, ?, ?, ?, 'ml', ?, 'decant_batch', ?, 'decant_production', ?)`,
      [bottle.fragrance_id, bottle.id, variant.id, -calc.totalMl, -roundMoney(calc.totalMl * bottle.cost_per_ml), insert.insertId, userId(req)]
    );
    for (const item of b.packaging || []) {
      const [[pack]] = await connection.execute('SELECT * FROM packaging_items WHERE id = ? FOR UPDATE', [item.packaging_item_id]);
      if (!pack) continue;
      if (Number(pack.quantity_on_hand) < Number(item.quantity_used)) throw Object.assign(new Error(`Not enough packaging: ${pack.name}`), { status: 400 });
      await connection.execute('UPDATE packaging_items SET quantity_on_hand = quantity_on_hand - ? WHERE id = ?', [item.quantity_used, pack.id]);
      await connection.execute(
        'INSERT INTO decant_batch_packaging (decant_batch_id, packaging_item_id, quantity_used, unit_cost_at_time) VALUES (?, ?, ?, ?)',
        [insert.insertId, pack.id, item.quantity_used, pack.unit_cost]
      );
      await connection.execute(
        `INSERT INTO inventory_movements
         (movement_type, item_type, packaging_item_id, quantity_delta, unit, cost_delta, reference_type, reference_id, reason_code, created_by_user_id)
         VALUES ('decant_production', 'packaging_item', ?, ?, 'unit', ?, 'decant_batch', ?, 'decant_packaging', ?)`,
        [pack.id, -item.quantity_used, -roundMoney(pack.unit_cost * item.quantity_used), insert.insertId, userId(req)]
      );
    }
    await writeAudit(connection, userId(req), 'create', 'decant_batch', insert.insertId, null, b, req);
    return insert.insertId;
  });
  res.status(201).json({ id: result });
});

router.get('/orders', requireAuth, async (req, res) => {
  const rows = await query(
    `SELECT o.*,
       (SELECT GROUP_CONCAT(DISTINCT CONCAT(f.brand, ' ', f.name) SEPARATOR ', ')
        FROM order_lines ol
        JOIN product_variants pv ON pv.id = ol.product_variant_id
        JOIN fragrances f ON f.id = pv.fragrance_id
        WHERE ol.order_id = o.id) AS product_label,
       (SELECT f.image_url
        FROM order_lines ol
        JOIN product_variants pv ON pv.id = ol.product_variant_id
        JOIN fragrances f ON f.id = pv.fragrance_id
        WHERE ol.order_id = o.id
        ORDER BY ol.id LIMIT 1) AS image_url,
       (SELECT pv.fragrance_id
        FROM order_lines ol
        JOIN product_variants pv ON pv.id = ol.product_variant_id
        WHERE ol.order_id = o.id
        ORDER BY ol.id LIMIT 1) AS fragrance_id,
       COALESCE((SELECT SUM(ol.sold_ml) FROM order_lines ol WHERE ol.order_id = o.id), 0) AS sold_ml,
       COALESCE((
        SELECT SUM(sb.purchase_cost + sb.landed_cost)
        FROM source_bottles sb
        WHERE sb.id IN (SELECT DISTINCT ol.source_bottle_id FROM order_lines ol
                        WHERE ol.order_id = o.id AND ol.source_bottle_id IS NOT NULL)
       ), 0) AS bottle_cost,
       COALESCE((
        SELECT SUM(ol2.unit_price * ol2.quantity)
        FROM order_lines ol2
        WHERE ol2.status = 'fulfilled'
          AND ol2.source_bottle_id IN (SELECT DISTINCT ol.source_bottle_id FROM order_lines ol
                                       WHERE ol.order_id = o.id AND ol.source_bottle_id IS NOT NULL)
       ), 0) AS bottle_sold_value
     FROM orders o
     ORDER BY o.created_at DESC
     LIMIT 200`
  );
  res.json(rows);
});

router.get('/orders/:id', requireAuth, async (req, res) => {
  const orderId = Number(req.params.id);
  const [order] = await query('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) return res.status(404).json({ error: 'Sale not found' });
  const lines = await query(
    `SELECT ol.id, ol.quantity, ol.unit_price, ol.sold_ml, ol.total_cogs, ol.gross_profit, ol.status,
       ol.source_bottle_id,
       pv.variant_type, pv.size_ml,
       f.brand, f.name AS product_name,
       COALESCE(sb.purchase_cost + sb.landed_cost, 0) AS bottle_cost,
       COALESCE((
         SELECT SUM(ol2.unit_price * ol2.quantity)
         FROM order_lines ol2
         WHERE ol2.source_bottle_id = ol.source_bottle_id AND ol2.status = 'fulfilled'
       ), 0) AS bottle_sold_value
     FROM order_lines ol
     JOIN product_variants pv ON pv.id = ol.product_variant_id
     JOIN fragrances f ON f.id = pv.fragrance_id
     LEFT JOIN source_bottles sb ON sb.id = ol.source_bottle_id
     WHERE ol.order_id = ?
     ORDER BY ol.id`,
    [orderId]
  );
  res.json({ order, lines });
});

router.post('/orders', requireRole('owner', 'manager', 'order_staff'), async (req, res) => {
  const b = req.body;
  const result = await transaction(async (connection) => {
    const orderNo = orderNumber('ORD');
    const [insert] = await connection.execute(
      `INSERT INTO orders (order_number, customer_name, customer_phone, customer_email, channel, status, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?)`,
      [orderNo, b.customer_name || null, b.customer_phone || null, b.customer_email || null, b.channel || 'manual', b.notes || null, userId(req)]
    );
    let subtotal = 0;
    let hasNeedsProduction = false;
    for (const line of b.lines || []) {
      const [[variant]] = await connection.execute('SELECT * FROM product_variants WHERE id = ?', [line.product_variant_id]);
      if (!variant) throw Object.assign(new Error('Variant not found'), { status: 404 });
      const quantity = Number(line.quantity || 1);
      const price = Number(line.unit_price || variant.selling_price);
      subtotal += price * quantity;
      let status = 'reserved';
      let sourceBottleId = null;
      if (variant.variant_type === 'decant') {
        const [[stock]] = await connection.execute(
          `SELECT * FROM finished_decant_stock WHERE product_variant_id = ? AND quantity_on_hand - reserved_quantity >= ? ORDER BY created_at LIMIT 1 FOR UPDATE`,
          [variant.id, quantity]
        );
        if (stock) {
          await connection.execute('UPDATE finished_decant_stock SET reserved_quantity = reserved_quantity + ? WHERE id = ?', [quantity, stock.id]);
        } else {
          const [[bottle]] = await connection.execute(
            `SELECT * FROM source_bottles
             WHERE fragrance_id = ? AND status <> 'archived' AND remaining_ml - reserved_ml >= ?
             ORDER BY opened_at IS NULL, opened_at, created_at LIMIT 1 FOR UPDATE`,
            [variant.fragrance_id, Number(variant.size_ml) * quantity]
          );
          if (!bottle) throw Object.assign(new Error(`Insufficient stock for ${variant.sku}`), { status: 400 });
          await connection.execute('UPDATE source_bottles SET reserved_ml = reserved_ml + ? WHERE id = ?', [Number(variant.size_ml) * quantity, bottle.id]);
          sourceBottleId = bottle.id;
          status = 'needs_production';
          hasNeedsProduction = true;
        }
      } else {
        const [[full]] = await connection.execute(
          `SELECT * FROM full_bottle_stock
           WHERE product_variant_id = ? AND status='available' AND quantity_on_hand - reserved_quantity >= 1
           ORDER BY created_at LIMIT 1 FOR UPDATE`,
          [variant.id]
        );
        if (!full) throw Object.assign(new Error(`No full bottle available for ${variant.sku}`), { status: 400 });
        await connection.execute('UPDATE full_bottle_stock SET reserved_quantity=1, status="reserved" WHERE id=?', [full.id]);
        await connection.execute('UPDATE source_bottles SET full_bottle_status="reserved" WHERE id=?', [full.source_bottle_id]);
        sourceBottleId = full.source_bottle_id;
      }
      await connection.execute(
        `INSERT INTO order_lines
         (order_id, product_variant_id, quantity, unit_price, discount_amount, sold_ml, source_bottle_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [insert.insertId, variant.id, quantity, price, line.discount_amount || 0, variant.variant_type === 'decant' ? Number(variant.size_ml) * quantity : Number(variant.size_ml) * quantity, sourceBottleId, status]
      );
    }
    await connection.execute('UPDATE orders SET subtotal=?, status=? WHERE id=?', [roundMoney(subtotal), hasNeedsProduction ? 'needs_production' : 'reserved', insert.insertId]);
    await writeAudit(connection, userId(req), 'create', 'order', insert.insertId, null, b, req);
    return insert.insertId;
  });
  res.status(201).json({ id: result });
});

router.post('/orders/:id/fulfill', requireRole('owner', 'manager', 'order_staff'), async (req, res) => {
  const orderId = Number(req.params.id);
  await transaction(async (connection) => {
    const [[order]] = await connection.execute('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
    const [lines] = await connection.execute(
      `SELECT ol.*, pv.variant_type, pv.size_ml, pv.fragrance_id, pv.sku
       FROM order_lines ol JOIN product_variants pv ON pv.id = ol.product_variant_id
       WHERE ol.order_id = ? FOR UPDATE`,
      [orderId]
    );
    let totalCogs = 0;
    let subtotal = 0;
    for (const line of lines) {
      subtotal += Number(line.unit_price) * Number(line.quantity) - Number(line.discount_amount || 0);
      let lineCogs = 0;
      if (line.variant_type === 'decant') {
        const [[finished]] = await connection.execute(
          `SELECT * FROM finished_decant_stock WHERE product_variant_id=? AND reserved_quantity >= ? ORDER BY created_at LIMIT 1 FOR UPDATE`,
          [line.product_variant_id, line.quantity]
        );
        if (finished) {
          await connection.execute('UPDATE finished_decant_stock SET quantity_on_hand=quantity_on_hand-?, reserved_quantity=reserved_quantity-? WHERE id=?', [line.quantity, line.quantity, finished.id]);
          lineCogs = (Number(finished.unit_liquid_cost) + Number(finished.unit_packaging_cost)) * Number(line.quantity);
        } else if (line.source_bottle_id) {
          const [[bottle]] = await connection.execute('SELECT * FROM source_bottles WHERE id=? FOR UPDATE', [line.source_bottle_id]);
          const soldMl = Number(line.size_ml) * Number(line.quantity);
          await connection.execute('UPDATE source_bottles SET reserved_ml=reserved_ml-?, remaining_ml=remaining_ml-? WHERE id=?', [soldMl, soldMl, bottle.id]);
          lineCogs = soldMl * Number(bottle.cost_per_ml);
        } else {
          throw Object.assign(new Error(`Line ${line.id} is not ready for fulfillment`), { status: 400 });
        }
        await connection.execute(
          `INSERT INTO inventory_movements
           (movement_type, item_type, fragrance_id, source_bottle_id, product_variant_id, quantity_delta, unit, cost_delta, reference_type, reference_id, reason_code, created_by_user_id)
           VALUES ('sale', 'product_variant', ?, ?, ?, ?, 'unit', ?, 'order', ?, 'sale', ?)`,
          [line.fragrance_id, line.source_bottle_id, line.product_variant_id, -line.quantity, -roundMoney(lineCogs), orderId, userId(req)]
        );
      } else {
        const [[full]] = await connection.execute(
          `SELECT * FROM full_bottle_stock WHERE product_variant_id=? AND source_bottle_id=? AND status='reserved' FOR UPDATE`,
          [line.product_variant_id, line.source_bottle_id]
        );
        if (!full) throw Object.assign(new Error(`Full bottle not reserved for ${line.sku}`), { status: 400 });
        await connection.execute('UPDATE full_bottle_stock SET quantity_on_hand=0, reserved_quantity=0, status="sold" WHERE id=?', [full.id]);
        await connection.execute('UPDATE source_bottles SET remaining_ml=0, reserved_ml=0, status="archived", full_bottle_status="sold" WHERE id=?', [full.source_bottle_id]);
        lineCogs = Number(full.unit_cost) * Number(line.quantity);
        await connection.execute(
          `INSERT INTO inventory_movements
           (movement_type, item_type, fragrance_id, source_bottle_id, product_variant_id, quantity_delta, unit, cost_delta, reference_type, reference_id, reason_code, created_by_user_id)
           VALUES ('sale', 'product_variant', ?, ?, ?, ?, 'bottle', ?, 'order', ?, 'full_bottle_sale', ?)`,
          [line.fragrance_id, line.source_bottle_id, line.product_variant_id, -line.quantity, -roundMoney(lineCogs), orderId, userId(req)]
        );
      }
      totalCogs += lineCogs;
      const margin = calculateMargin(line.unit_price, line.quantity, lineCogs, 0);
      await connection.execute(
        'UPDATE order_lines SET liquid_cogs=?, total_cogs=?, gross_profit=?, status="fulfilled" WHERE id=?',
        [roundMoney(lineCogs), roundMoney(lineCogs), margin.grossProfit, line.id]
      );
    }
    const summary = calculateMargin(subtotal, 1, totalCogs, 0);
    await connection.execute(
      'UPDATE orders SET status="fulfilled", subtotal=?, total_cogs=?, gross_profit=?, gross_margin_percent=?, fulfilled_at=NOW() WHERE id=?',
      [roundMoney(subtotal), summary.totalCogs, summary.grossProfit, summary.grossMarginPercent, orderId]
    );
    await writeAudit(connection, userId(req), 'fulfill', 'order', orderId, order, { status: 'fulfilled' }, req);
  });
  res.json({ ok: true });
});

router.post('/orders/:id/cancel', requireRole('owner', 'manager', 'order_staff'), async (req, res) => {
  const orderId = Number(req.params.id);
  await transaction(async (connection) => {
    const [lines] = await connection.execute(
      `SELECT ol.*, pv.variant_type FROM order_lines ol JOIN product_variants pv ON pv.id=ol.product_variant_id WHERE ol.order_id=? FOR UPDATE`,
      [orderId]
    );
    for (const line of lines) {
      if (line.status === 'fulfilled') continue;
      if (line.variant_type === 'decant') {
        await connection.execute('UPDATE source_bottles SET reserved_ml = GREATEST(0, reserved_ml - ?) WHERE id=?', [line.sold_ml, line.source_bottle_id]);
        await connection.execute('UPDATE finished_decant_stock SET reserved_quantity = GREATEST(0, reserved_quantity - ?) WHERE product_variant_id=? LIMIT 1', [line.quantity, line.product_variant_id]);
      } else {
        await connection.execute('UPDATE full_bottle_stock SET reserved_quantity=0, status="available" WHERE source_bottle_id=? AND status="reserved"', [line.source_bottle_id]);
        await connection.execute('UPDATE source_bottles SET full_bottle_status="available" WHERE id=? AND full_bottle_status="reserved"', [line.source_bottle_id]);
      }
    }
    await connection.execute('UPDATE order_lines SET status="cancelled" WHERE order_id=? AND status <> "fulfilled"', [orderId]);
    await connection.execute('UPDATE orders SET status="cancelled" WHERE id=?', [orderId]);
    await writeAudit(connection, userId(req), 'cancel', 'order', orderId, null, req.body, req);
  });
  res.json({ ok: true });
});

router.delete('/orders/:id', requireRole('owner', 'manager'), async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ error: 'Invalid sale id.' });
  }

  await transaction(async (connection) => {
    const [[order]] = await connection.execute('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order) throw Object.assign(new Error('Sale not found'), { status: 404 });

    const [lines] = await connection.execute(
      `SELECT ol.*, pv.variant_type, pv.fragrance_id, pv.size_ml
       FROM order_lines ol
       JOIN product_variants pv ON pv.id = ol.product_variant_id
       WHERE ol.order_id = ?
       FOR UPDATE`,
      [orderId]
    );

    for (const line of lines) {
      if (line.status === 'fulfilled') {
        if (line.variant_type === 'decant') {
          if (line.source_bottle_id) {
            await connection.execute(
              `UPDATE source_bottles sb
               JOIN fragrances f ON f.id = sb.fragrance_id
               SET sb.remaining_ml = sb.remaining_ml + ?,
                 sb.status = CASE WHEN f.active = 1 THEN 'opened' ELSE sb.status END,
                 sb.full_bottle_status = CASE WHEN f.active = 1 THEN 'opened' ELSE sb.full_bottle_status END
               WHERE sb.id = ?`,
              [Number(line.sold_ml || 0), line.source_bottle_id]
            );
          } else {
            const [[stock]] = await connection.execute(
              'SELECT id FROM finished_decant_stock WHERE product_variant_id = ? ORDER BY created_at LIMIT 1 FOR UPDATE',
              [line.product_variant_id]
            );
            if (stock) {
              await connection.execute(
                'UPDATE finished_decant_stock SET quantity_on_hand = quantity_on_hand + ? WHERE id = ?',
                [line.quantity, stock.id]
              );
            } else {
              await connection.execute(
                `INSERT INTO finished_decant_stock
                 (product_variant_id, quantity_on_hand, unit_liquid_cost, unit_packaging_cost)
                 VALUES (?, ?, ?, ?)`,
                [
                  line.product_variant_id,
                  line.quantity,
                  Number(line.liquid_cogs || 0) / Math.max(1, Number(line.quantity || 1)),
                  Number(line.packaging_cogs || 0) / Math.max(1, Number(line.quantity || 1))
                ]
              );
            }
          }
        } else if (line.source_bottle_id) {
          await connection.execute(
            `UPDATE source_bottles sb
             JOIN fragrances f ON f.id = sb.fragrance_id
             SET sb.remaining_ml = ?,
               sb.reserved_ml = 0,
               sb.status = CASE WHEN f.active = 1 THEN 'unopened' ELSE sb.status END,
               sb.full_bottle_status = CASE WHEN f.active = 1 THEN 'not_sellable' ELSE sb.full_bottle_status END
             WHERE sb.id = ?`,
            [Number(line.sold_ml || line.size_ml || 0), line.source_bottle_id]
          );
          await connection.execute(
            `UPDATE full_bottle_stock fbs
             JOIN product_variants pv ON pv.id = fbs.product_variant_id
             JOIN fragrances f ON f.id = pv.fragrance_id
             SET fbs.quantity_on_hand = CASE WHEN f.active = 1 THEN 1 ELSE fbs.quantity_on_hand END,
               fbs.reserved_quantity = 0,
               fbs.status = CASE WHEN f.active = 1 THEN 'available' ELSE fbs.status END
             WHERE fbs.product_variant_id = ? AND fbs.source_bottle_id = ?`,
            [line.product_variant_id, line.source_bottle_id]
          );
        }
      } else if (line.status !== 'cancelled') {
        if (line.variant_type === 'decant') {
          const [[finished]] = await connection.execute(
            `SELECT id FROM finished_decant_stock
             WHERE product_variant_id = ? AND reserved_quantity >= ?
             ORDER BY created_at LIMIT 1 FOR UPDATE`,
            [line.product_variant_id, line.quantity]
          );
          if (finished) {
            await connection.execute(
              'UPDATE finished_decant_stock SET reserved_quantity = reserved_quantity - ? WHERE id = ?',
              [line.quantity, finished.id]
            );
          } else if (line.source_bottle_id) {
            await connection.execute(
              'UPDATE source_bottles SET reserved_ml = GREATEST(0, reserved_ml - ?) WHERE id = ?',
              [line.sold_ml, line.source_bottle_id]
            );
          }
        } else if (line.source_bottle_id) {
          await connection.execute(
            `UPDATE full_bottle_stock
             SET reserved_quantity = 0, status = 'available'
             WHERE product_variant_id = ? AND source_bottle_id = ? AND status = 'reserved'`,
            [line.product_variant_id, line.source_bottle_id]
          );
          await connection.execute(
            `UPDATE source_bottles
             SET full_bottle_status = 'not_sellable'
             WHERE id = ? AND full_bottle_status = 'reserved'`,
            [line.source_bottle_id]
          );
        }
      }
    }

    await connection.execute('DELETE FROM inventory_movements WHERE reference_type = "order" AND reference_id = ?', [orderId]);
    await connection.execute('DELETE FROM order_lines WHERE order_id = ?', [orderId]);
    await connection.execute('DELETE FROM audit_logs WHERE entity_type IN ("order", "bottle", "decant") AND entity_id = ?', [orderId]);
    await connection.execute('DELETE FROM orders WHERE id = ?', [orderId]);
    await writeAudit(connection, userId(req), 'delete', 'order', orderId, order, null, req);
  });

  res.json({ ok: true });
});

router.post('/adjustments', requireRole('owner', 'manager', 'inventory_staff'), async (req, res) => {
  const b = req.body;
  if (!b.reason_code) return res.status(400).json({ error: 'Reason code is required' });
  await transaction(async (connection) => {
    if (b.item_type === 'source_bottle') {
      await connection.execute('UPDATE source_bottles SET remaining_ml = remaining_ml + ? WHERE id=?', [b.quantity_delta, b.source_bottle_id]);
      await connection.execute(
        `INSERT INTO inventory_movements
         (movement_type, item_type, source_bottle_id, quantity_delta, unit, reason_code, notes, created_by_user_id)
         VALUES ('adjustment', 'source_bottle', ?, ?, 'ml', ?, ?, ?)`,
        [b.source_bottle_id, b.quantity_delta, b.reason_code, b.notes || null, userId(req)]
      );
    }
    if (b.item_type === 'packaging_item') {
      await connection.execute('UPDATE packaging_items SET quantity_on_hand = quantity_on_hand + ? WHERE id=?', [b.quantity_delta, b.packaging_item_id]);
      await connection.execute(
        `INSERT INTO inventory_movements
         (movement_type, item_type, packaging_item_id, quantity_delta, unit, reason_code, notes, created_by_user_id)
         VALUES ('adjustment', 'packaging_item', ?, ?, 'unit', ?, ?, ?)`,
        [b.packaging_item_id, b.quantity_delta, b.reason_code, b.notes || null, userId(req)]
      );
    }
    await writeAudit(connection, userId(req), 'adjust', b.item_type, b.source_bottle_id || b.packaging_item_id, null, b, req);
  });
  res.json({ ok: true });
});

router.get('/reports/summary', requireAuth, async (req, res) => {
  const [fragranceMl, decants, fullBottles, packaging, orders, lowPackaging, lowVariants] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(sb.remaining_ml - sb.reserved_ml), 0) AS available_ml
       FROM source_bottles sb
       JOIN fragrances f ON f.id = sb.fragrance_id
       WHERE f.active = 1 AND sb.status <> 'archived'`
    ),
    query(
      `SELECT COALESCE(SUM(fds.quantity_on_hand - fds.reserved_quantity), 0) AS decant_units
       FROM finished_decant_stock fds
       JOIN product_variants pv ON pv.id = fds.product_variant_id
       JOIN fragrances f ON f.id = pv.fragrance_id
       WHERE f.active = 1 AND pv.active = 1`
    ),
    query(
      `SELECT COALESCE(SUM(fbs.quantity_on_hand - fbs.reserved_quantity), 0) AS bottle_units
       FROM full_bottle_stock fbs
       JOIN product_variants pv ON pv.id = fbs.product_variant_id
       JOIN fragrances f ON f.id = pv.fragrance_id
       WHERE f.active = 1 AND pv.active = 1 AND fbs.status IN ('available','reserved')`
    ),
    query(`SELECT COALESCE(SUM(quantity_on_hand * unit_cost), 0) AS packaging_value FROM packaging_items`),
    query(`SELECT COUNT(*) AS order_count, COALESCE(SUM(subtotal), 0) AS revenue, COALESCE(SUM(gross_profit), 0) AS gross_profit FROM orders WHERE status='fulfilled'`),
    query(`SELECT * FROM packaging_items WHERE quantity_on_hand <= low_stock_threshold ORDER BY name`),
    query(
      `SELECT pv.*, CONCAT(f.brand, ' ', f.name) AS fragrance_name,
       CASE WHEN pv.variant_type='decant' THEN COALESCE(SUM(fds.quantity_on_hand - fds.reserved_quantity), 0)
            ELSE COALESCE(SUM(fbs.quantity_on_hand - fbs.reserved_quantity), 0) END AS available_units
       FROM product_variants pv
       JOIN fragrances f ON f.id = pv.fragrance_id
       LEFT JOIN finished_decant_stock fds ON fds.product_variant_id = pv.id
       LEFT JOIN full_bottle_stock fbs ON fbs.product_variant_id = pv.id
       WHERE f.active = 1 AND pv.active = 1
       GROUP BY pv.id
       HAVING available_units <= low_stock_threshold_units
       ORDER BY fragrance_name`
    )
  ]);
  res.json({
    available_ml: fragranceMl[0].available_ml,
    decant_units: decants[0].decant_units,
    bottle_units: fullBottles[0].bottle_units,
    packaging_value: packaging[0].packaging_value,
    orders: orders[0],
    lowPackaging,
    lowVariants
  });
});

router.get('/reports/movements', requireAuth, async (req, res) => {
  const rows = await query(
    `SELECT im.*, CONCAT(f.brand, ' ', f.name) AS fragrance_name, pv.sku, pi.name AS packaging_name, u.name AS user_name
     FROM inventory_movements im
     LEFT JOIN fragrances f ON f.id = im.fragrance_id
     LEFT JOIN product_variants pv ON pv.id = im.product_variant_id
     LEFT JOIN packaging_items pi ON pi.id = im.packaging_item_id
     LEFT JOIN users u ON u.id = im.created_by_user_id
     ORDER BY im.created_at DESC LIMIT 500`
  );
  res.json(rows);
});

router.get('/reports/audit', requireRole('owner', 'manager'), async (req, res) => {
  const rows = await query(
    `SELECT al.*, u.name AS actor_name FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id ORDER BY al.created_at DESC LIMIT 500`
  );
  res.json(rows);
});

router.get('/reports/export/:name', requireAuth, async (req, res) => {
  const name = req.params.name;
  let rows;
  if (name === 'inventory') {
    rows = await query(
      `SELECT f.brand, f.name, sb.lot_code, sb.remaining_ml, sb.reserved_ml, sb.cost_per_ml, sb.full_bottle_status
       FROM source_bottles sb
       JOIN fragrances f ON f.id=sb.fragrance_id
       WHERE f.active = 1 AND sb.status <> 'archived'
       ORDER BY f.brand, f.name`
    );
  } else if (name === 'orders') {
    rows = await query('SELECT * FROM orders ORDER BY created_at DESC');
  } else {
    return res.status(404).json({ error: 'Unknown export' });
  }
  const headers = Object.keys(rows[0] || {});
  const csv = [headers.join(','), ...rows.map((row) => headers.map((h) => JSON.stringify(row[h] ?? '')).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
  res.send(csv);
});

module.exports = router;
