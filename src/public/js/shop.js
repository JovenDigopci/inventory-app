const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let products = [];
let current = null;
let orderMode = 'buy'; // 'buy' | 'cart'
let cart = loadCart();

function peso(value) {
  return `₱${Number(value || 0).toFixed(2)}`;
}

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem('mtscent_cart')) || [];
  } catch (error) {
    return [];
  }
}

function saveCart() {
  localStorage.setItem('mtscent_cart', JSON.stringify(cart));
  $('#cartCount').textContent = cart.reduce((sum, it) => sum + it.quantity, 0);
}

// Buy options (with prices) — used in the order modal.
function optionsFor(p) {
  const opts = [];
  if (p.decant_available && p.price_5ml > 0) opts.push({ key: 'decant:5', label: `5 ml decant — ${peso(p.price_5ml)}`, price: p.price_5ml });
  if (p.decant_available && p.price_10ml > 0) opts.push({ key: 'decant:10', label: `10 ml decant — ${peso(p.price_10ml)}`, price: p.price_10ml });
  if (p.full_bottle_available && p.bottle_price > 0) opts.push({ key: 'bottle', label: `Full bottle — ${peso(p.bottle_price)}`, price: p.bottle_price });
  return opts;
}

// Available size names (no prices) — used in the More info dialog.
function sizesFor(p) {
  const names = [];
  if (p.decant_available && p.price_5ml > 0) names.push('5 ml');
  if (p.decant_available && p.price_10ml > 0) names.push('10 ml');
  if (p.full_bottle_available && p.bottle_price > 0) names.push('Full bottle');
  return names;
}

async function loadProducts() {
  const grid = $('#shopGrid');
  try {
    const res = await fetch('/api/shop/products');
    products = await res.json();
  } catch (error) {
    grid.innerHTML = '<p class="loading">Could not load the collection right now. Please try again later.</p>';
    return;
  }
  if (!products.length) {
    grid.innerHTML = '<p class="loading">New scents are on the way — check back soon.</p>';
    return;
  }
  grid.innerHTML = products
    .map((p) => {
      const tag = p.full_bottle_available ? 'Bottle &amp; decant' : 'Decant available';
      return `<article class="product">
        <div class="product-photo">
          ${p.image_url ? `<img src="${p.image_url}" alt="${p.image_alt_text}">` : '<div class="placeholder">No image</div>'}
          <span class="tag">${tag}</span>
        </div>
        <div class="product-body">
          <p class="product-brand">${p.brand}</p>
          <h3 class="product-name">${p.name}</h3>
          <p class="product-desc">${p.description || 'A beautiful fragrance from MT Scent.'}</p>
          <button class="more-info" data-info="${p.id}" type="button">More info ›</button>
        </div>
      </article>`;
    })
    .join('');
  $$('[data-info]').forEach((btn) =>
    btn.addEventListener('click', () => openInfo(Number(btn.dataset.info)))
  );
}

function openInfo(id) {
  current = products.find((p) => p.id === id);
  if (!current) return;
  $('#infoBrand').textContent = current.brand;
  $('#infoName').textContent = current.name;
  $('#infoDesc').textContent = current.description || 'A beautiful fragrance from MT Scent.';
  const img = $('#infoImage');
  if (current.image_url) {
    img.src = current.image_url;
    img.alt = current.image_alt_text;
    img.style.display = '';
  } else {
    img.style.display = 'none';
  }
  const notes = current.notes_list || [];
  $('#infoNotesWrap').style.display = notes.length ? '' : 'none';
  $('#infoNotes').innerHTML = notes.map((n) => `<li>${n}</li>`).join('');
  const sizes = sizesFor(current);
  $('#infoAvailable').textContent = sizes.length ? `Available as: ${sizes.join(' · ')}` : '';
  $('#infoDialog').showModal();
}

function currentOption() {
  if (!current) return null;
  const key = $('#sizeOption').value;
  return optionsFor(current).find((o) => o.key === key) || null;
}

function updateTotal() {
  const opt = currentOption();
  const qty = Math.max(1, Number($('#orderQty').value || 1));
  $('#orderTotal').textContent = peso(opt ? opt.price * qty : 0);
}

function openOrder(id, mode) {
  current = products.find((p) => p.id === id);
  if (!current) return;
  const opts = optionsFor(current);
  if (!opts.length) return;
  orderMode = mode;
  const form = $('#orderForm');
  form.reset();
  form.elements.fragrance_id.value = current.id;
  $('#orderQty').value = 1;
  $('#orderError').textContent = '';
  $('#orderProductTitle').textContent = mode === 'cart' ? `Add ${current.name} to cart` : `Order ${current.brand} ${current.name}`;
  $('#orderProductInfo').innerHTML = `
    ${current.image_url ? `<img src="${current.image_url}" alt="${current.image_alt_text}">` : ''}
    <div><p><strong>${current.brand} ${current.name}</strong></p></div>`;
  $('#sizeOption').innerHTML = opts.map((o) => `<option value="${o.key}">${o.label}</option>`).join('');
  // In cart mode we only need size + quantity; checkout details come later in the cart.
  $('#orderCustomerFields').style.display = mode === 'cart' ? 'none' : '';
  $('#orderSubmit').textContent = mode === 'cart' ? 'Add to cart' : 'Place order';
  updateTotal();
  if ($('#infoDialog').open) $('#infoDialog').close();
  $('#orderDialog').showModal();
}

async function handleOrderSubmit(event) {
  event.preventDefault();
  const opt = currentOption();
  if (!opt) return;
  const form = event.currentTarget;
  const [type, ml] = opt.key.split(':');
  const quantity = Math.max(1, Number($('#orderQty').value || 1));

  if (orderMode === 'cart') {
    cart.push({
      fragrance_id: current.id,
      name: `${current.brand} ${current.name}`,
      option_label: opt.label.split(' — ')[0],
      order_type: type === 'bottle' ? 'bottle' : 'decant',
      ml: type === 'bottle' ? 0 : Number(ml),
      quantity,
      price: opt.price
    });
    saveCart();
    $('#orderDialog').close();
    return;
  }

  const name = form.elements.customer_name.value.trim();
  if (!name) {
    $('#orderError').textContent = 'Please enter your name.';
    return;
  }
  const payload = {
    items: [{ fragrance_id: current.id, order_type: type === 'bottle' ? 'bottle' : 'decant', ml: type === 'bottle' ? 0 : Number(ml), quantity }],
    customer_name: name,
    customer_phone: form.elements.customer_phone.value,
    customer_email: form.elements.customer_email.value,
    fulfillment_method: form.elements.fulfillment_method.value,
    customer_address: form.elements.customer_address.value,
    notes: form.elements.notes.value
  };
  await placeOrder(payload, '#orderError', () => $('#orderDialog').close());
}

function renderCart() {
  const wrap = $('#cartItems');
  if (!cart.length) {
    wrap.innerHTML = '<p class="muted">Your cart is empty. Add a perfume from the collection.</p>';
    $('#cartTotal').textContent = peso(0);
    return;
  }
  wrap.innerHTML = cart
    .map((it, i) => `<div class="cart-item">
      <div>
        <p><strong>${it.name}</strong></p>
        <p class="muted">${it.option_label} × ${it.quantity} — ${peso(it.price * it.quantity)}</p>
      </div>
      <button class="icon-button" data-remove="${i}" type="button" aria-label="Remove">✕</button>
    </div>`)
    .join('');
  $('#cartTotal').textContent = peso(cart.reduce((sum, it) => sum + it.price * it.quantity, 0));
  $$('#cartItems [data-remove]').forEach((btn) =>
    btn.addEventListener('click', () => { cart.splice(Number(btn.dataset.remove), 1); saveCart(); renderCart(); })
  );
}

function openCart() {
  $('#cartError').textContent = '';
  renderCart();
  $('#cartDialog').showModal();
}

async function handleCartSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!cart.length) {
    $('#cartError').textContent = 'Your cart is empty.';
    return;
  }
  const name = form.elements.customer_name.value.trim();
  if (!name) {
    $('#cartError').textContent = 'Please enter your name.';
    return;
  }
  const payload = {
    items: cart.map((it) => ({ fragrance_id: it.fragrance_id, order_type: it.order_type, ml: it.ml, quantity: it.quantity })),
    customer_name: name,
    customer_phone: form.elements.customer_phone.value,
    customer_email: form.elements.customer_email.value,
    fulfillment_method: form.elements.fulfillment_method.value,
    customer_address: form.elements.customer_address.value,
    notes: form.elements.notes.value
  };
  await placeOrder(payload, '#cartError', () => {
    cart = [];
    saveCart();
    $('#cartDialog').close();
  });
}

async function placeOrder(payload, errorSel, onSuccess) {
  $(errorSel).textContent = '';
  try {
    const res = await fetch('/api/shop/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not place the order.');
    onSuccess();
    $('#thanksMessage').textContent =
      `Your order (${body.orderNumber}) for ${peso(body.subtotal)} has been received. We'll contact you shortly to confirm.`;
    $('#thanksDialog').showModal();
  } catch (error) {
    $(errorSel).textContent = error.message;
  }
}

function init() {
  loadProducts();
  saveCart();
  $('#closeInfo').addEventListener('click', () => $('#infoDialog').close());
  $('#infoOrderNow').addEventListener('click', () => openOrder(current.id, 'buy'));
  $('#infoAddCart').addEventListener('click', () => openOrder(current.id, 'cart'));
  $('#orderForm').addEventListener('submit', handleOrderSubmit);
  $('#sizeOption').addEventListener('change', updateTotal);
  $('#orderQty').addEventListener('input', updateTotal);
  $('#closeOrder').addEventListener('click', () => $('#orderDialog').close());
  $('#cancelOrder').addEventListener('click', () => $('#orderDialog').close());
  $('#cartBtn').addEventListener('click', openCart);
  $('#closeCart').addEventListener('click', () => $('#cartDialog').close());
  $('#clearCart').addEventListener('click', () => { cart = []; saveCart(); renderCart(); });
  $('#cartForm').addEventListener('submit', handleCartSubmit);
  $('#closeThanks').addEventListener('click', () => $('#thanksDialog').close());
  // Click outside the dialog content (on the backdrop) to close — robust fallback.
  ['#infoDialog', '#orderDialog', '#cartDialog', '#thanksDialog'].forEach((sel) => {
    const dlg = $(sel);
    if (dlg) dlg.addEventListener('click', (event) => { if (event.target === dlg) dlg.close(); });
  });
}

init();
