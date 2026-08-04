import { Product, CartItem } from '../types';

/**
 * Universal Data Normalizer
 * Enforces unified data contracts between Prisma backend, IndexedDB offline store,
 * Zustand UI state, and thermal printer / receipt preview components.
 */

export const normalizeProduct = (rawProduct: any): Product => {
  if (!rawProduct) {
    return {
      id: '',
      name: 'Unknown Product',
      barcode: null,
      categoryId: null,
      purchasePrice: 0,
      mrp: 0,
      sellingPrice: 0,
      gstRate: 0,
      stockQuantity: 0,
      unit: 'pcs'
    };
  }

  const sellingPrice = Number(rawProduct.sellingPrice ?? rawProduct.price ?? 0);
  const mrp = Number(rawProduct.mrp ?? sellingPrice ?? 0);
  const purchasePrice = Number(rawProduct.purchasePrice ?? sellingPrice ?? 0);
  const gstRate = Number(rawProduct.gstRate ?? 0);
  const stockQuantity = Number(rawProduct.stockQuantity ?? 0);

  return {
    id: String(rawProduct.id || ''),
    name: String(rawProduct.name || rawProduct.productName || 'Product'),
    barcode: rawProduct.barcode ? String(rawProduct.barcode) : null,
    categoryId: rawProduct.categoryId ? String(rawProduct.categoryId) : null,
    category: rawProduct.category ? { id: String(rawProduct.category.id || ''), name: String(rawProduct.category.name || '') } : undefined,
    purchasePrice,
    mrp: mrp > 0 ? mrp : sellingPrice,
    sellingPrice,
    gstRate,
    stockQuantity,
    unit: String(rawProduct.unit || 'pcs'),
    image: rawProduct.image ? String(rawProduct.image) : undefined,
    is_active: rawProduct.is_active ?? true
  };
};

export const normalizeOrderItem = (rawItem: any, index: number = 0): any => {
  if (!rawItem) return null;

  const product = rawItem.product ? normalizeProduct(rawItem.product) : null;
  const name = String(rawItem.name || product?.name || 'Product');
  const price = Number(rawItem.price ?? rawItem.sellingPrice ?? product?.sellingPrice ?? 0);
  const mrp = Number(rawItem.mrp ?? product?.mrp ?? price);
  const gstRate = Number(rawItem.gstRate ?? product?.gstRate ?? 0);
  const quantity = Number(rawItem.quantity || 0);
  const taxAmount = Number(rawItem.taxAmount ?? ((price * (gstRate / 100)) * quantity));
  const calcTotal = (price * quantity) + taxAmount;
  const total = Number(rawItem.total) || calcTotal || 0;

  return {
    id: String(rawItem.id || rawItem.productId || product?.id || `item-${index}`),
    productId: String(rawItem.productId || product?.id || rawItem.id || ''),
    name,
    slNo: Number(rawItem.slNo) || (index + 1),
    price,
    sellingPrice: price,
    mrp,
    gstRate,
    quantity,
    taxAmount,
    total,
    unit: String(rawItem.unit || product?.unit || 'pcs'),
    product: product || undefined
  };
};

export const normalizeOrder = (rawOrder: any): any => {
  if (!rawOrder) return null;

  const rawItems = Array.isArray(rawOrder.orderItems) ? rawOrder.orderItems : [];
  const orderItems = rawItems.map((item: any, idx: number) => normalizeOrderItem(item, idx));
  const grandTotal = Number(rawOrder.grandTotal ?? rawOrder.totalAmount ?? 0);
  const roundedTotal = Number(rawOrder.roundedTotal ?? Math.floor(grandTotal));

  return {
    ...rawOrder,
    id: String(rawOrder.id || ''),
    invoiceNo: String(rawOrder.invoiceNo || ''),
    subtotal: Number(rawOrder.subtotal || 0),
    taxTotal: Number(rawOrder.taxTotal || 0),
    grandTotal,
    roundedTotal,
    savings: Number(rawOrder.savings || 0),
    discount: Number(rawOrder.discount || 0),
    amountPaid: Number(rawOrder.amountPaid || 0),
    balance: Number(rawOrder.balance || 0),
    orderItems,
    itemsCount: orderItems.length,
    totalQty: orderItems.reduce((acc: number, i: any) => acc + (i.quantity || 0), 0)
  };
};
