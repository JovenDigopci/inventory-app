const state = {
  user: null,
  products: [],
  bottles: [],
  decants: [],
  orders: [],
  accessoryOptions: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || 'Request failed');
  }
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? response.json() : response.text();
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function ml(value) {
  return Number(value || 0).toFixed(2);
}

function formJson(form) {
  const data = new FormData(form);
  const json = {};
  for (const [key, value] of data.entries()) {
    if (value !== '') json[key] = value;
  }
  for (const input of form.querySelectorAll('input[type="checkbox"]')) {
    json[input.name] = input.checked;
  }
  return json;
}

function showNotice(message) {
  const notice = $('#notice');
  notice.textContent = message;
  notice.classList.remove('hidden');
  setTimeout(() => notice.classList.add('hidden'), 5000);
}

async function runFormSubmit(event, action) {
  event.preventDefault();
  try {
    await action(event.currentTarget);
  } catch (error) {
    showNotice(error.message);
  }
}

function optionHtml(items, labelFn, includeBlank = true) {
  return `${includeBlank ? '<option value="">Select...</option>' : ''}${items
    .map((item) => `<option value="${item.id || item.source_bottle_id}">${labelFn(item)}</option>`)
    .join('')}`;
}

function accessoryRows() {
  return $$('.accessory-row')
    .map((row) => ({
      name: row.querySelector('[data-accessory-name]').value.trim(),
      unit_cost: Number(row.querySelector('[data-accessory-cost]').value || 0),
      quantity: Number(row.querySelector('[data-accessory-quantity]').value || 1)
    }))
    .filter((item) => item.name || item.unit_cost > 0);
}

function updateProductCostPreview() {
  const form = $('#fragranceForm');
  const bottleQuantity = Math.max(1, Number(form.elements.bottle_quantity.value || 1));
  const perfumeCost = Number(form.elements.purchase_cost.value || 0);
  const accessoryCost = accessoryRows().reduce((sum, item) => sum + item.unit_cost * item.quantity, 0);
  const overallCost = perfumeCost * bottleQuantity + accessoryCost;
  $('#productCostPreview').textContent = money(overallCost);
  const targetIncome = Number(form.elements.target_income.value || 0);
  const sellingPrice = overallCost + targetIncome;
  $('#targetSellingPrice').value = money(sellingPrice);

  // Suggest tiered prices from the per-bottle selling price; auto-fill each until the owner edits it.
  const bottleSizeMl = Number(form.elements.bottle_size_ml.value || 0);
  const perBottleSelling = sellingPrice / bottleQuantity;
  const perMl = bottleSizeMl > 0 ? perBottleSelling / bottleSizeMl : 0;
  const suggestions = {
    price5ml: perMl > 0 ? perMl * 5 : 0,
    price10ml: perMl > 0 ? perMl * 10 : 0,
    priceFullBottle: perBottleSelling > 0 ? perBottleSelling : 0
  };
  Object.entries(suggestions).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field && field.dataset.touched !== 'true') {
      field.value = value > 0 ? money(value) : '';
    }
  });
  $('#priceHint').textContent = perMl > 0
    ? `Suggested from cost + target income: 5 ml ${money(suggestions.price5ml)}, 10 ml ${money(suggestions.price10ml)}, bottle ${money(suggestions.priceFullBottle)}. Edit any to set your own.`
    : '';
}

function openProductDialog() {
  $('#productDialog').showModal();
}

function closeProductDialog() {
  $('#productDialog').close();
}

function resetProductForm() {
  const form = $('#fragranceForm');
  form.reset();
  form.elements.product_id.value = '';
  $('#productFormTitle').textContent = 'Add Product';
  $('#saveProductButton').textContent = 'Save product';
  ['price5ml', 'price10ml', 'priceFullBottle'].forEach((id) => { document.getElementById(id).dataset.touched = ''; });
  $('#accessoryRows').innerHTML = '';
  addAccessoryRow();
  updateProductCostPreview();
}

function updateAccessoryRowTotal(row) {
  const unitCost = Number(row.querySelector('[data-accessory-cost]').value || 0);
  const quantity = Number(row.querySelector('[data-accessory-quantity]').value || 1);
  row.querySelector('[data-accessory-total]').textContent = money(unitCost * quantity);
}

function addAccessoryRow(accessory = {}) {
  const row = document.createElement('div');
  row.className = 'accessory-row';
  row.innerHTML = `
    <div class="accessory-row-head">
      <strong>Accessory item</strong>
      <button class="icon-button" data-remove-accessory type="button" aria-label="Remove accessory">Remove</button>
    </div>
    <label>Accessory name <input data-accessory-name list="accessoryNameOptions" value="${accessory.name || ''}" placeholder="Pick or type: Box, atomizer, label"></label>
    <div class="accessory-fields">
      <label>Cost <input data-accessory-cost type="number" min="0" step="0.01" value="${accessory.unit_cost || 0}"></label>
      <label>Qty <input data-accessory-quantity type="number" min="0.001" step="0.001" value="${accessory.quantity || 1}"></label>
      <p class="line-total">Total <strong data-accessory-total>0.00</strong></p>
    </div>
  `;
  $('#accessoryRows').append(row);
  row.querySelectorAll('input').forEach((input) =>
    input.addEventListener('input', () => {
      updateAccessoryRowTotal(row);
      updateProductCostPreview();
    })
  );
  // When a known accessory is picked, auto-fill its default cost (if cost is still blank/zero).
  const nameInput = row.querySelector('[data-accessory-name]');
  const costInput = row.querySelector('[data-accessory-cost]');
  nameInput.addEventListener('change', () => {
    const def = accessoryDefaultCost(nameInput.value);
    if (def != null && def > 0 && Number(costInput.value || 0) === 0) {
      costInput.value = def;
      updateAccessoryRowTotal(row);
      updateProductCostPreview();
    }
  });
  row.querySelector('[data-remove-accessory]').addEventListener('click', () => {
    row.remove();
    updateProductCostPreview();
  });
  updateAccessoryRowTotal(row);
  updateProductCostPreview();
}

async function loadDashboard() {
  const [summary, orders] = await Promise.all([api('/api/reports/summary'), api('/api/orders')]);
  const opened = state.bottles.filter((b) => b.status === 'opened').length;
  const unopened = state.bottles.filter((b) => b.status === 'unopened').length;

  $('#metricMl').textContent = ml(summary.available_ml);
  $('#metricDecants').textContent = opened;
  $('#metricBottles').textContent = unopened;
  $('#metricProfit').textContent = money(summary.orders.gross_profit);
  $('#readyDecants').innerHTML = state.decants.length
    ? state.decants
        .map(
          (d) => `<div class="row-card">
            <p><strong>${d.product_name}</strong><br><span class="muted">${ml(d.remaining_ml - d.reserved_ml)} ml ready</span></p>
            <span class="badge">${money(d.cost_per_ml)} / ml cost</span>
          </div>`
        )
        .join('')
    : '<p class="muted">Open a bottle from the Bottles page to make it available for decant sales.</p>';
  $('#recentSales').innerHTML = orders.slice(0, 5).length
    ? orders
        .slice(0, 5)
        .map(
          (o) => `<div class="row-card">
            <p><strong>${o.order_number}</strong><br><span class="muted">${o.customer_name || 'Walk-in'} - ${o.channel}</span></p>
            <span class="badge">${money(o.subtotal)}</span>
          </div>`
        )
        .join('')
    : '<p class="muted">No sales recorded yet.</p>';
}

async function loadProducts() {
  state.products = await api('/api/simple/products');
  $('#fragranceList').innerHTML = state.products.length
    ? state.products
        .map(
          (p) => `<article class="product-card">
            <div class="product-media">
              ${p.image_url ? `<img src="${p.image_url}" alt="${p.image_alt_text || `${p.brand} ${p.name}`}">` : '<div class="image-placeholder">No image</div>'}
              <div class="card-menu">
                <button class="menu-trigger" data-menu-trigger="${p.id}" type="button" aria-label="Product actions">...</button>
                <div class="menu-panel hidden" id="product-menu-${p.id}">
                  <button data-product-to-decant="${p.id}" type="button">Add to decants</button>
                  <button data-edit-product="${p.id}" type="button">Edit</button>
                  <button data-delete-product="${p.id}" type="button">Delete</button>
                </div>
              </div>
            </div>
            <div class="product-body">
              <div class="cost-strip">
                <span>Total cost</span>
                <strong>${money(p.total_cost)}</strong>
              </div>
              <div>
                <p class="product-title"><strong>${p.brand} ${p.name}</strong></p>
                <p class="muted clamp-text">${p.description || 'No description'}</p>
              </div>
              <button class="text-toggle" data-more-product="${p.id}" type="button">More options</button>
              <div class="product-more hidden" id="product-more-${p.id}">
                ${p.top_notes ? `<p><strong>Top notes:</strong> ${p.top_notes}</p>` : ''}
                ${p.middle_notes ? `<p><strong>Middle notes:</strong> ${p.middle_notes}</p>` : ''}
                ${p.base_notes ? `<p><strong>Base notes:</strong> ${p.base_notes}</p>` : ''}
                <p><strong>Bottles:</strong> ${Number(p.bottle_count || 0)} total</p>
                <p><strong>Add-ons:</strong> ${Number(p.accessory_count || 0)} item(s)</p>
                <p><strong>Available:</strong> ${ml(p.available_ml)} ml</p>
                <p><strong>Bought:</strong> ${ml(p.total_bought_ml)} ml total</p>
                <p><strong>Accessories:</strong> ${Number(p.accessory_count || 0)} item(s), cost ${money(p.accessory_cost)}</p>
                <p><strong>Opened:</strong> ${Number(p.opened_bottles || 0)} bottle(s)</p>
                <p><strong>Unopened:</strong> ${Number(p.unopened_bottles || 0)} bottle(s)</p>
              </div>
            </div>
          </article>`
        )
        .join('')
    : '<p class="muted">No products yet.</p>';
  $$('[data-menu-trigger]').forEach((button) =>
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleProductMenu(button.dataset.menuTrigger);
    })
  );
  $$('[data-product-to-decant]').forEach((button) =>
    button.addEventListener('click', () => addProductToDecants(button.dataset.productToDecant))
  );
  $$('[data-more-product]').forEach((button) =>
    button.addEventListener('click', () => toggleProductMore(button.dataset.moreProduct))
  );
  $$('[data-edit-product]').forEach((button) =>
    button.addEventListener('click', () => editProduct(button.dataset.editProduct))
  );
  $$('[data-delete-product]').forEach((button) =>
    button.addEventListener('click', () => deleteProduct(button.dataset.deleteProduct))
  );
}

function toggleProductMenu(id) {
  $$('.menu-panel').forEach((panel) => {
    if (panel.id !== `product-menu-${id}`) panel.classList.add('hidden');
  });
  $(`#product-menu-${id}`).classList.toggle('hidden');
}

function toggleProductMore(id) {
  const details = $(`#product-more-${id}`);
  details.classList.toggle('hidden');
  const button = document.querySelector(`[data-more-product="${id}"]`);
  if (button) button.textContent = details.classList.contains('hidden') ? 'More options' : 'Less options';
}

function addProductToDecants(id) {
  $$('.menu-panel').forEach((panel) => panel.classList.add('hidden'));
  const product = state.products.find((p) => String(p.id) === String(id));
  const available = product ? Number(product.unopened_bottles || 0) : 0;
  const form = $('#decantQtyForm');
  form.reset();
  form.elements.product_id.value = id;
  form.elements.quantity.value = 1;
  if (available > 0) form.elements.quantity.max = available;
  $('#decantQtyInfo').innerHTML = `
    <strong>${product ? `${product.brand} ${product.name}` : 'Product'}</strong>
    <p class="muted">Unopened bottles available: ${available}</p>
  `;
  $('#decantQtyDialog').showModal();
}

async function editProduct(id) {
  const { product, accessories } = await api(`/api/simple/products/${id}`);
  const form = $('#fragranceForm');
  form.elements.product_id.value = product.id;
  form.elements.brand.value = product.brand || '';
  form.elements.name.value = product.name || '';
  form.elements.description.value = product.description || '';
  form.elements.top_notes.value = product.top_notes || '';
  form.elements.middle_notes.value = product.middle_notes || '';
  form.elements.base_notes.value = product.base_notes || '';
  form.elements.bottle_size_ml.value = product.bottle_size_ml || '';
  form.elements.bottle_quantity.value = product.bottle_quantity || 1;
  form.elements.purchase_cost.value = product.purchase_cost || '';
  form.elements.purchase_date.value = product.purchase_date ? String(product.purchase_date).slice(0, 10) : '';
  form.elements.target_income.value = product.target_income || 0;
  // Show saved tiered prices and keep them (don't overwrite with auto-suggestions).
  [['price5ml', product.price_5ml], ['price10ml', product.price_10ml], ['priceFullBottle', product.price_full_bottle]].forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (Number(value) > 0) {
      field.value = money(value);
      field.dataset.touched = 'true';
    } else {
      field.dataset.touched = '';
    }
  });
  $('#productFormTitle').textContent = 'Edit Product';
  $('#saveProductButton').textContent = 'Update product';
  $('#accessoryRows').innerHTML = '';
  if (accessories.length) {
    accessories.forEach((accessory) => addAccessoryRow(accessory));
  } else {
    addAccessoryRow();
  }
  updateProductCostPreview();
  switchTab('catalog');
  openProductDialog();
}

async function deleteProduct(id) {
  if (!window.confirm('Remove this product from active inventory? Products with history will be archived.')) return;
  try {
    const result = await api(`/api/simple/products/${id}`, { method: 'DELETE' });
    showNotice(result.archived ? 'Product removed from active inventory.' : 'Product deleted.');
    await refreshAll();
  } catch (error) {
    showNotice(error.message || 'Product could not be removed.');
  }
}

async function loadBottles() {
  state.bottles = await api('/api/source-bottles');
  const groups = [];
  const groupIndex = new Map();
  for (const b of state.bottles) {
    // Only list available full bottles (unopened with ml left). Opened/empty/sold are hidden.
    if (b.status !== 'unopened' || Number(b.remaining_ml) <= 0) continue;
    // Group identical bottles: same brand + same ratio (cost/ml), size and remaining.
    const key = [b.fragrance_name, b.status, b.cost_per_ml, b.bottle_size_ml, b.remaining_ml].join('|');
    let group = groupIndex.get(key);
    if (!group) {
      group = { rep: b, quantity: 0, totalRemaining: 0, totalCost: 0 };
      groupIndex.set(key, group);
      groups.push(group);
    }
    group.quantity += 1;
    group.totalRemaining += Number(b.remaining_ml);
    group.totalCost += Number(b.purchase_cost) + Number(b.landed_cost);
  }
  $('#bottleList').innerHTML = groups.length
    ? groups
        .map((g) => {
          const b = g.rep;
          const qtyLabel = `Qty ${g.quantity} bottle${g.quantity > 1 ? 's' : ''}`;
          const subtitle = g.quantity > 1 ? b.status : `${b.lot_code || 'No lot'} - ${b.status}`;
          return `<article class="product-card clickable-card" data-bottle-card="${b.id}">
            <div class="product-media">
              ${b.image_url ? `<img src="${b.image_url}" alt="${b.image_alt_text || b.fragrance_name}">` : '<div class="image-placeholder">No image</div>'}
              <span class="product-value">${ml(g.totalRemaining)} ml left</span>
            </div>
            <div class="product-body">
              <p class="product-title"><strong>${b.fragrance_name}</strong></p>
              <p class="muted clamp-text">${subtitle}</p>
              <div class="product-meta">
                <span class="badge">${qtyLabel}</span>
                <span class="badge">Cost ${money(g.totalCost)}</span>
                <span class="badge">${money(b.cost_per_ml)} / ml</span>
              </div>
            </div>
          </article>`;
        })
        .join('')
    : '<p class="muted">No available full bottles. Open or add products to see them here.</p>';
  $$('[data-bottle-card]').forEach((card) =>
    card.addEventListener('click', () => {
      const bottle = state.bottles.find((item) => String(item.id) === String(card.dataset.bottleCard));
      if (!bottle) return;
      if (bottle.status === 'unopened') openBottleSale(bottle);
      else switchTab('decants');
    })
  );
}

function openBottleSale(bottle) {
  const form = $('#bottleSaleForm');
  form.reset();
  form.elements.source_bottle_id.value = bottle.id;
  const available = state.bottles.filter(
    (item) =>
      item.status === 'unopened' &&
      item.fragrance_name === bottle.fragrance_name &&
      String(item.cost_per_ml) === String(bottle.cost_per_ml) &&
      String(item.bottle_size_ml) === String(bottle.bottle_size_ml)
  ).length;
  const bottleCost = Number(bottle.purchase_cost) + Number(bottle.landed_cost);
  $('#bottleSaleInfo').innerHTML = `
    <strong>${bottle.fragrance_name}</strong>
    <p class="muted">Lot: ${bottle.lot_code || 'No lot'}</p>
    <p class="muted">Bottle size: ${ml(bottle.bottle_size_ml)} ml</p>
    <p class="muted">Bottle cost: ${money(bottleCost)} &middot; ${money(bottle.cost_per_ml)} / ml</p>
    <p class="muted">Available to sell: ${available} bottle${available > 1 ? 's' : ''}</p>
  `;
  $('#bottleSaleDialog').showModal();
}

async function loadDecants() {
  state.decants = await api('/api/simple/decants');
  $('#decantList').innerHTML = state.decants.length
    ? state.decants
        .map(
          (d) => `<article class="product-card clickable-card" data-decant-card="${d.source_bottle_id}">
            <div class="product-media">
              ${d.image_url ? `<img src="${d.image_url}" alt="${d.product_name}">` : '<div class="image-placeholder">No image</div>'}
              <span class="product-value">${ml(Number(d.remaining_ml) - Number(d.reserved_ml))} ml ready</span>
            </div>
            <div class="product-body">
              <p class="product-title"><strong>${d.product_name}</strong></p>
              <p class="muted">${d.lot_code || 'No lot'} - opened for decants</p>
              <div class="product-meta">
                <span class="badge">Qty 1 opened bottle</span>
                <span class="badge">${money(d.cost_per_ml)} / ml cost</span>
              </div>
            </div>
          </article>`
        )
        .join('')
    : '<p class="muted">No opened bottles for decants yet.</p>';
  $$('[data-decant-card]').forEach((card) =>
    card.addEventListener('click', () => openNewSale(card.dataset.decantCard))
  );
}

function openDecantSale(decant) {
  const form = $('#decantSaleForm');
  form.reset();
  form.elements.source_bottle_id.value = decant.source_bottle_id;
  const availableMl = Number(decant.remaining_ml) - Number(decant.reserved_ml);
  form.elements.sold_ml.max = availableMl;
  $('#decantSaleInfo').innerHTML = `
    <strong>${decant.product_name}</strong>
    <p class="muted">Lot: ${decant.lot_code || 'No lot'}</p>
    <p class="muted">Available: ${ml(availableMl)} ml</p>
    <p class="muted">Cost / ml: ${money(decant.cost_per_ml)}</p>
  `;
  $('#decantSaleDialog').showModal();
}

function updateNewSaleInfo() {
  const form = $('#newSaleForm');
  const decant = state.decants.find((d) => String(d.source_bottle_id) === String(form.elements.source_bottle_id.value));
  if (!decant) {
    $('#newSaleInfo').innerHTML = '<p class="muted">Pick a product to see how much is available.</p>';
    form.elements.sold_ml.removeAttribute('max');
    return;
  }
  const availableMl = Number(decant.remaining_ml) - Number(decant.reserved_ml);
  form.elements.sold_ml.max = availableMl;
  $('#newSaleInfo').innerHTML = `
    <strong>${decant.product_name}</strong>
    <p class="muted">Available: ${ml(availableMl)} ml</p>
    <p class="muted">Cost / ml: ${money(decant.cost_per_ml)}</p>
  `;
}

function newSaleProductOptions(extra) {
  const items = [...state.decants];
  if (extra && !items.some((d) => String(d.source_bottle_id) === String(extra.source_bottle_id))) {
    items.push(extra);
  }
  return optionHtml(
    items,
    (d) => `${d.product_name} (${ml(Math.max(0, Number(d.remaining_ml || 0) - Number(d.reserved_ml || 0)))} ml left)`,
    false
  );
}

function openNewSale(preselectBottleId) {
  const form = $('#newSaleForm');
  form.reset();
  if (!state.decants.length) {
    showNotice('Open a bottle for decants first (Decants tab) before adding a sale.');
    return;
  }
  form.elements.order_id.value = '';
  $('#newSaleTitle').textContent = 'Add Sale';
  $('#saveNewSale').textContent = 'Record sale';
  $('#newSaleProduct').innerHTML = newSaleProductOptions();
  $('#newSaleProduct').disabled = false;
  if (preselectBottleId != null && preselectBottleId !== '') {
    form.elements.source_bottle_id.value = String(preselectBottleId);
  }
  updateNewSaleInfo();
  $('#newSaleDialog').showModal();
}

async function editSale(id) {
  try {
    const { order, lines } = await api(`/api/orders/${id}`);
    const line = lines[0];
    if (!line || !line.source_bottle_id) {
      showNotice('This sale cannot be edited here.');
      return;
    }
    const form = $('#newSaleForm');
    form.reset();
    // Keep the original product selectable even if the bottle is no longer an open decant.
    const extra = { source_bottle_id: line.source_bottle_id, product_name: `${line.brand} ${line.product_name}`, remaining_ml: 0, reserved_ml: 0 };
    $('#newSaleProduct').innerHTML = newSaleProductOptions(extra);
    form.elements.order_id.value = order.id;
    form.elements.source_bottle_id.value = line.source_bottle_id;
    $('#newSaleProduct').disabled = true; // product/bottle is fixed when editing
    form.elements.customer_name.value = order.customer_name || '';
    form.elements.customer_phone.value = order.customer_phone || '';
    form.elements.customer_email.value = order.customer_email || '';
    form.elements.sold_ml.value = line.sold_ml || '';
    form.elements.sold_price.value = order.subtotal || '';
    form.elements.status.value = { fulfilled: 'completed', reserved: 'pending', cancelled: 'cancelled' }[order.status] || 'completed';
    form.elements.fulfillment_method.value = order.channel || 'delivery';
    const rawNotes = order.notes || '';
    const addressLine = rawNotes.split('\n').find((l) => l.startsWith('Address: '));
    form.elements.customer_address.value = addressLine ? addressLine.replace('Address: ', '') : '';
    form.elements.notes.value = rawNotes
      .split('\n')
      .filter((l) => !l.startsWith('Fulfillment: ') && !l.startsWith('Address: '))
      .join('\n');
    $('#newSaleTitle').textContent = 'Edit Sale';
    $('#saveNewSale').textContent = 'Update sale';
    updateNewSaleInfo();
    if ($('#orderDetailDialog').open) $('#orderDetailDialog').close();
    $('#newSaleDialog').showModal();
  } catch (error) {
    showNotice(error.message || 'Could not load the sale.');
  }
}

function balanceFigure(overallCost, valueSold) {
  const balance = Number(overallCost || 0) - Number(valueSold || 0);
  return balance > 0
    ? { label: 'Total balance', value: balance, recovered: false }
    : { label: 'Profit', value: -balance, recovered: true };
}

function orderProductKey(o) {
  return String(o.fragrance_id || o.product_label || 'unknown');
}

async function loadOrders() {
  state.orders = await api('/api/orders');
  const groups = new Map();
  for (const o of state.orders) {
    const key = orderProductKey(o);
    if (!groups.has(key)) {
      groups.set(key, { key, label: o.product_label || 'Product removed', image_url: o.image_url, count: 0, totalSold: 0 });
    }
    const group = groups.get(key);
    group.count += 1;
    group.totalSold += Number(o.subtotal || 0);
  }
  const products = [...groups.values()];
  $('#orderList').innerHTML = products.length
    ? `<div class="cards">${products
        .map(
          (p) => `<article class="product-card clickable-card" data-product-sales="${p.key}">
            <div class="product-media">
              ${p.image_url ? `<img src="${p.image_url}" alt="${p.label}">` : '<div class="image-placeholder">No image</div>'}
              <span class="product-value">${p.count} sale${p.count === 1 ? '' : 's'}</span>
            </div>
            <div class="product-body">
              <p class="product-title"><strong>${p.label}</strong></p>
              <p class="muted">Total sold ${money(p.totalSold)}</p>
              <button class="text-toggle" type="button">View sales</button>
            </div>
          </article>`
        )
        .join('')}</div>`
    : '<p class="muted">No sales yet.</p>';
  $$('[data-product-sales]').forEach((card) =>
    card.addEventListener('click', () => showProductSales(card.dataset.productSales))
  );
}

function saleStatusBadge(status) {
  const map = {
    fulfilled: { label: 'Completed', cls: 'status-completed' },
    reserved: { label: 'Pending', cls: 'status-pending' },
    cancelled: { label: 'Cancelled', cls: 'status-cancelled' }
  };
  const s = map[status] || { label: status || 'Completed', cls: 'status-completed' };
  return `<span class="badge ${s.cls}">${s.label}</span>`;
}

function saleRowHtml(o) {
  const fig = balanceFigure(o.bottle_cost, o.bottle_sold_value);
  const saleDate = o.created_at ? new Date(o.created_at).toLocaleDateString() : '-';
  const mlBought = Number(o.sold_ml) > 0 ? `${ml(o.sold_ml)} ml` : `${money(o.subtotal)} sale`;
  return `<article class="sale-card clickable-card" data-order-detail="${o.id}">
    <div class="sale-avatar">${(o.customer_name || 'W').trim().charAt(0).toUpperCase()}</div>
    <div class="sale-info">
      <p class="sale-buyer"><strong>${o.customer_name || 'Walk-in'}</strong></p>
      <div class="sale-meta">
        <span class="badge">${mlBought}</span>
        <span class="muted">${saleDate}</span>
        ${saleStatusBadge(o.status)}
      </div>
    </div>
    <div class="sale-aside">
      <span class="badge ${fig.recovered ? 'badge-profit' : 'badge-balance'}">${fig.label} ${money(fig.value)}</span>
      <div class="sale-row-actions">
        <button class="secondary" data-edit-order="${o.id}" type="button">Edit</button>
        <button class="secondary danger-button" data-delete-order="${o.id}" type="button">Delete</button>
      </div>
    </div>
  </article>`;
}

function showProductSales(key) {
  const orders = state.orders.filter((o) => orderProductKey(o) === String(key));
  if (!orders.length) return;
  $('#orderDetailTitle').textContent = orders[0].product_label || 'Sales';
  $('#orderDetailBody').innerHTML = `<div class="sale-list">${orders.map(saleRowHtml).join('')}</div>`;
  $$('#orderDetailBody [data-order-detail]').forEach((card) =>
    card.addEventListener('click', (event) => {
      if (event.target.closest('[data-delete-order]') || event.target.closest('[data-edit-order]')) return;
      showOrderDetail(card.dataset.orderDetail, key);
    })
  );
  $$('#orderDetailBody [data-edit-order]').forEach((button) =>
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      editSale(button.dataset.editOrder);
    })
  );
  $$('#orderDetailBody [data-delete-order]').forEach((button) =>
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteOrder(button.dataset.deleteOrder);
    })
  );
  if (!$('#orderDetailDialog').open) $('#orderDetailDialog').showModal();
}

async function showOrderDetail(id, backKey) {
  try {
    const { order, lines } = await api(`/api/orders/${id}`);
    const productLabel = lines.map((line) => `${line.brand} ${line.product_name}`).join(', ') || 'Product removed';
    $('#orderDetailTitle').textContent = productLabel;
    const linesHtml = lines.length
      ? lines
          .map((line) => {
            const qtyLabel = line.variant_type === 'decant'
              ? `${ml(line.sold_ml)} ml`
              : `${Number(line.quantity)} bottle(s)`;
            const fig = balanceFigure(line.bottle_cost, line.bottle_sold_value);
            return `<div class="detail-line">
              <p><strong>${line.brand} ${line.product_name}</strong></p>
              <p class="muted">This sale: ${qtyLabel} for ${money(line.unit_price * line.quantity)}</p>
              <div class="detail-figures">
                <span>Overall cost (bottle)<strong>${money(line.bottle_cost)}</strong></span>
                <span>Value sold (total)<strong>${money(line.bottle_sold_value)}</strong></span>
                <span class="${fig.recovered ? 'figure-profit' : 'figure-balance'}">${fig.label}<strong>${money(fig.value)}</strong></span>
              </div>
              <p class="muted">${fig.recovered
                ? 'Bottle cost recovered — this is profit.'
                : 'Still need to sell this much to recover the bottle cost.'}</p>
            </div>`;
          })
          .join('')
      : '<p class="muted">No product lines on this sale.</p>';
    const backButton = backKey != null
      ? '<button class="secondary" id="backToSales" type="button">← Back to sales list</button>'
      : '';
    $('#orderDetailBody').innerHTML = `
      ${backButton}
      <div class="form-group">
        <p><strong>Buyer:</strong> ${order.customer_name || 'Walk-in'}</p>
        ${order.customer_phone ? `<p class="muted">Phone: ${order.customer_phone}</p>` : ''}
        ${order.customer_email ? `<p class="muted">Email: ${order.customer_email}</p>` : ''}
        <p class="muted">Sale ref: ${order.order_number}</p>
        <p class="muted">Channel: ${order.channel} - Status: ${order.status}</p>
        ${order.notes ? `<p class="muted">Notes: ${order.notes}</p>` : ''}
      </div>
      <h3>Bottle tracking</h3>
      ${linesHtml}`;
    if (backKey != null) {
      $('#backToSales').addEventListener('click', () => showProductSales(backKey));
    }
    if (!$('#orderDetailDialog').open) $('#orderDetailDialog').showModal();
  } catch (error) {
    showNotice(error.message || 'Could not load sale details.');
  }
}

async function deleteOrder(id) {
  if (!window.confirm('Delete this sale history? This removes the sale and restores related stock where possible.')) return;
  try {
    await api(`/api/orders/${id}`, { method: 'DELETE' });
    showNotice('Sale history deleted.');
    if ($('#orderDetailDialog').open) $('#orderDetailDialog').close();
    await refreshAll();
  } catch (error) {
    showNotice(error.message || 'Sale history could not be deleted.');
  }
}

async function loadReports() {
  const [movements, audit] = await Promise.all([api('/api/reports/movements'), api('/api/reports/audit').catch(() => [])]);
  $('#movementList').innerHTML = movements.length
    ? movements
        .map(
          (m) => `<div class="row-card">
            <p><strong>${m.movement_type}</strong><br><span class="muted">${m.fragrance_name || m.packaging_name || m.sku || m.item_type}</span></p>
            <span class="badge">${Number(m.quantity_delta)} ${m.unit}</span>
          </div>`
        )
        .join('')
    : '<p class="muted">No inventory movements yet.</p>';
  $('#auditList').innerHTML = audit.length
    ? audit
        .map(
          (a) => `<div class="row-card">
            <p><strong>${a.action}</strong><br><span class="muted">${a.entity_type} #${a.entity_id || ''} by ${a.actor_name || 'system'}</span></p>
            <span class="badge">${new Date(a.created_at).toLocaleDateString()}</span>
          </div>`
        )
        .join('')
    : '<p class="muted">No audit entries yet.</p>';
}

function renderAccessoryOptions() {
  const datalist = $('#accessoryNameOptions');
  if (!datalist) return;
  datalist.innerHTML = state.accessoryOptions
    .map((opt) => `<option value="${String(opt.name).replace(/"/g, '&quot;')}"></option>`)
    .join('');
}

async function loadAccessoryOptions() {
  // Each option is { name, default_cost } from the accessory catalog.
  state.accessoryOptions = await api('/api/simple/accessory-options');
  renderAccessoryOptions();
}

function accessoryDefaultCost(name) {
  const match = state.accessoryOptions.find((opt) => String(opt.name).toLowerCase() === String(name).trim().toLowerCase());
  return match ? Number(match.default_cost) : null;
}

async function loadAccessories() {
  const list = await api('/api/simple/accessories');
  $('#accessoryCatalogList').innerHTML = list.length
    ? list
        .map(
          (a) => `<article class="item-card">
            <p><strong>${a.name}</strong></p>
            <div class="product-meta">
              <span class="badge">Default ${money(a.default_cost)}</span>
              <span class="badge">${Number(a.usage_count)} product(s)</span>
            </div>
            <div class="row-actions">
              <button class="secondary danger-button" data-delete-accessory="${a.id}" type="button">Delete</button>
            </div>
          </article>`
        )
        .join('')
    : '<p class="muted">No accessories yet. Add one, or they appear here when you use them in a product.</p>';
  $$('[data-delete-accessory]').forEach((button) =>
    button.addEventListener('click', () => deleteAccessory(button.dataset.deleteAccessory))
  );
}

async function deleteAccessory(id) {
  if (!window.confirm('Remove this accessory option? Products that already used it keep their data.')) return;
  try {
    await api(`/api/simple/accessories/${id}`, { method: 'DELETE' });
    showNotice('Accessory removed.');
    await loadAccessories();
    await loadAccessoryOptions();
  } catch (error) {
    showNotice(error.message || 'Could not remove the accessory.');
  }
}

async function refreshAll() {
  await Promise.all([loadProducts(), loadBottles(), loadDecants(), loadOrders(), loadAccessoryOptions()]);
  await Promise.all([loadDashboard(), loadReports()]);
}

function bindForms() {
  $('#fragranceForm').addEventListener('submit', async (event) => {
    await runFormSubmit(event, async (form) => {
      const body = new FormData(form);
      body.set('accessories_json', JSON.stringify(accessoryRows()));
      const productId = form.elements.product_id.value;
      if (productId) {
        const res = await api(`/api/simple/products/${productId}`, { method: 'PUT', body });
        showNotice(res.hasSales
          ? 'Product details updated. Stock and cost were kept because this product has sales history.'
          : 'Product updated.');
      } else {
        await api('/api/simple/products', { method: 'POST', body });
        showNotice('Product saved and bottles were added to Bottles.');
      }
      resetProductForm();
      closeProductDialog();
      await refreshAll();
    });
  });

  $('#openProductDialog').addEventListener('click', () => {
    resetProductForm();
    openProductDialog();
  });
  $('#closeProductDialog').addEventListener('click', closeProductDialog);
  $('#cancelEditProductButton').addEventListener('click', () => {
    resetProductForm();
    closeProductDialog();
  });

  $('#decantSaleForm').addEventListener('submit', async (event) => {
    await runFormSubmit(event, async (form) => {
      await api('/api/simple/decant-sales', { method: 'POST', body: JSON.stringify(formJson(form)) });
      $('#decantSaleDialog').close();
      showNotice('Decant sale saved and ml was deducted.');
      await refreshAll();
      switchTab('sales');
    });
  });
  $('#closeDecantSale').addEventListener('click', () => $('#decantSaleDialog').close());
  $('#cancelDecantSale').addEventListener('click', () => $('#decantSaleDialog').close());

  $('#newSaleProduct').addEventListener('change', updateNewSaleInfo);
  $('#newSaleForm').addEventListener('submit', async (event) => {
    await runFormSubmit(event, async (form) => {
      const orderId = form.elements.order_id.value;
      if (orderId) {
        await api(`/api/simple/decant-sales/${orderId}`, { method: 'PUT', body: JSON.stringify(formJson(form)) });
        showNotice('Sale updated.');
      } else {
        await api('/api/simple/decant-sales', { method: 'POST', body: JSON.stringify(formJson(form)) });
        showNotice('Sale saved.');
      }
      $('#newSaleDialog').close();
      await refreshAll();
      switchTab('sales');
    });
  });
  $('#closeNewSale').addEventListener('click', () => $('#newSaleDialog').close());
  $('#cancelNewSale').addEventListener('click', () => $('#newSaleDialog').close());

  $('#decantQtyForm').addEventListener('submit', async (event) => {
    await runFormSubmit(event, async (form) => {
      const productId = form.elements.product_id.value;
      const quantity = Math.max(1, Number(form.elements.quantity.value || 1));
      const result = await api(`/api/simple/products/${productId}/add-to-decants`, {
        method: 'POST',
        body: JSON.stringify({ quantity })
      });
      $('#decantQtyDialog').close();
      const moved = result?.opened ?? quantity;
      showNotice(`${moved} bottle(s) moved to Decants.`);
      await refreshAll();
      switchTab('decants');
    });
  });
  $('#closeDecantQty').addEventListener('click', () => $('#decantQtyDialog').close());
  $('#cancelDecantQty').addEventListener('click', () => $('#decantQtyDialog').close());

  $('#openAccessoryDialog').addEventListener('click', () => {
    $('#accessoryForm').reset();
    $('#accessoryDialog').showModal();
  });
  $('#closeAccessoryDialog').addEventListener('click', () => $('#accessoryDialog').close());
  $('#cancelAccessoryDialog').addEventListener('click', () => $('#accessoryDialog').close());
  $('#accessoryForm').addEventListener('submit', async (event) => {
    await runFormSubmit(event, async (form) => {
      await api('/api/simple/accessories', { method: 'POST', body: JSON.stringify(formJson(form)) });
      $('#accessoryDialog').close();
      showNotice('Accessory saved.');
      await loadAccessories();
      await loadAccessoryOptions();
    });
  });

  $('#bottleSaleForm').addEventListener('submit', async (event) => {
    await runFormSubmit(event, async (form) => {
      await api('/api/simple/bottle-sales', { method: 'POST', body: JSON.stringify(formJson(form)) });
      $('#bottleSaleDialog').close();
      showNotice('Bottle sale recorded.');
      await refreshAll();
      switchTab('sales');
    });
  });
  $('#closeBottleSale').addEventListener('click', () => $('#bottleSaleDialog').close());
  $('#cancelBottleSale').addEventListener('click', () => $('#bottleSaleDialog').close());
  $('#closeOrderDetail').addEventListener('click', () => $('#orderDetailDialog').close());
}

function switchTab(tabName) {
  $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabName));
  $$('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
  $(`#${tabName}`).classList.remove('hidden');
  // The Accessories sub-item lives under Products and only shows while on those pages.
  const subnav = $('#productsSubnav');
  if (subnav) subnav.classList.toggle('hidden', tabName !== 'catalog' && tabName !== 'accessories');
  if (tabName === 'accessories') loadAccessories();
}

function bindTabs() {
  $$('.tab').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });
}

function bindNavModules() {
  $$('.nav-module-toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const module = toggle.closest('.nav-module');
      const open = module.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  });
}

function bindProductCostControls() {
  $('#addAccessoryButton').addEventListener('click', () => addAccessoryRow());
  ['bottle_quantity', 'purchase_cost', 'target_income', 'bottle_size_ml'].forEach((name) => {
    $('#fragranceForm').elements[name].addEventListener('input', updateProductCostPreview);
  });
  // Track when the owner sets their own price so we stop auto-suggesting that field.
  ['price5ml', 'price10ml', 'priceFullBottle'].forEach((id) => {
    document.getElementById(id).addEventListener('input', (event) => {
      event.target.dataset.touched = 'true';
    });
  });
  addAccessoryRow();
}

async function showApp(user) {
  state.user = user;
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#currentUser').textContent = `${state.user.name} (${state.user.role_name})`;
  await refreshAll();
}

async function init() {
  bindTabs();
  bindNavModules();
  bindForms();
  bindProductCostControls();
  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#loginError').textContent = '';
    try {
      const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(formJson(event.currentTarget)) });
      await showApp(result.user);
    } catch (error) {
      $('#loginError').textContent = error.message;
    }
  });
  $('#logoutButton').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    window.location.reload();
  });
  const me = await api('/api/auth/me');
  if (me.user) await showApp(me.user);
}

init().catch((error) => {
  console.error(error);
  showNotice(error.message);
});
