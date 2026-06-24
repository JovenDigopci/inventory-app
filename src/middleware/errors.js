function notFound(req, res) {
  res.status(404).json({ error: 'Route not found' });
}

function errorHandler(error, req, res, next) {
  if (error.code === 'ECONNREFUSED') {
    return res.status(503).json({
      error: 'Database connection failed. Start MySQL, then run npm run migrate and npm run seed.'
    });
  }

  if (error.code === 'ER_DUP_ENTRY') {
    const message = error.sqlMessage || error.message || '';
    if (message.includes('fragrances.uq_fragrance')) {
      return res.status(409).json({
        error: 'This product already exists. Use a different brand, name, or concentration.'
      });
    }
    if (message.includes('product_variants.sku') || message.includes('product_variants.uq')) {
      return res.status(409).json({ error: 'This SKU already exists. Use a different SKU.' });
    }
    if (message.includes('packaging_items.sku')) {
      return res.status(409).json({ error: 'This packaging SKU already exists. Use a different SKU.' });
    }
    return res.status(409).json({ error: 'This record already exists.' });
  }

  const status = error.status || 500;
  console.error(error);
  res.status(status).json({ error: error.message || 'Unexpected server error' });
}

module.exports = { notFound, errorHandler };
