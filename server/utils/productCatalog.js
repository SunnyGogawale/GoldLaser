const Product = require('../models/Product');

const getProductNames = (items = []) => Array.from(new Set(
  (Array.isArray(items) ? items : [])
    .map((item) => String(item?.product || '').trim())
    .filter(Boolean)
));

const ensureInvoiceProducts = async (items, createdBy) => {
  const productNames = getProductNames(items);
  if (productNames.length === 0 || !createdBy) return;

  await Promise.all(productNames.map(async (productName) => {
    const productNameKey = productName.toLocaleLowerCase();
    await Product.findOneAndUpdate(
      { productNameKey },
      {
        $setOnInsert: {
          productName,
          productNameKey,
          createdBy,
          createdOn: new Date(),
          isActive: true
        }
      },
      {
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true
      }
    );
  }));
};

module.exports = { ensureInvoiceProducts };
