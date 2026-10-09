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
  const orderItems = rawItems
    .map((item: any, idx: number) => normalizeOrderItem(item, idx))
    .filter(Boolean);

  // Ground truth calculated from items
  const itemsSubtotal = orderItems.reduce(
    (acc: number, i: any) => acc + (Number(i.price || i.sellingPrice || 0) * Number(i.quantity || 0)), 
    0
  );
  const itemsTax = orderItems.reduce(
    (acc: number, i: any) => acc + Number(i.taxAmount || 0), 
    0
  );
  const itemsTotal = orderItems.reduce(
    (acc: number, i: any) => acc + Number(i.total || 0), 
    0
  );

  const discount = Number(rawOrder.discount || 0);
  
  // Determine authoritative subtotal and tax
  const subtotal = itemsSubtotal > 0 
    ? itemsSubtotal 
    : (Number(rawOrder.subtotal) > 0 ? Number(rawOrder.subtotal) : itemsTotal);
  const taxTotal = itemsTax > 0 
    ? itemsTax 
    : Number(rawOrder.taxTotal || 0);

  // Authoritative Grand and Rounded Totals
  const calculatedGrandTotal = Math.max(0, subtotal + taxTotal - discount);
  const expectedRoundedTotal = Math.floor(calculatedGrandTotal);

  // Reconcile roundedTotal: if stored roundedTotal differs by more than 1 Rupee from expected, heal it!
  const rawRounded = Number(rawOrder.roundedTotal);
  const roundedTotal = (!isNaN(rawRounded) && Math.abs(rawRounded - expectedRoundedTotal) <= 1)
    ? rawRounded
    : expectedRoundedTotal;

  const rawGrand = Number(rawOrder.grandTotal);
  const grandTotal = (!isNaN(rawGrand) && Math.abs(rawGrand - calculatedGrandTotal) <= 1)
    ? rawGrand
    : calculatedGrandTotal;

  // Calculate actual savings from MRP vs Price
  const itemsSavings = orderItems.reduce((acc: number, i: any) => {
    const mrp = Number(i.mrp || i.product?.mrp || i.price || 0);
    const price = Number(i.price || i.sellingPrice || 0);
    const qty = Number(i.quantity || 0);
    return acc + Math.max(0, mrp - price) * qty;
  }, 0);
  const computedSavings = itemsSavings + discount;
  const savings = Math.max(Number(rawOrder.savings || 0), computedSavings);

  // Authoritative Total Quantity and Item Count
  const calculatedQty = orderItems.reduce((acc: number, i: any) => acc + (Number(i.quantity) || 0), 0);
  const totalQty = (calculatedQty > 0) 
    ? calculatedQty 
    : (Number(rawOrder.totalQty) > 0 ? Number(rawOrder.totalQty) : 0);

  const itemsCount = orderItems.length > 0 
    ? orderItems.length 
    : (Number(rawOrder.itemsCount) || 1);

  // Payment reconciliation
  const isCredit = rawOrder.paymentMode === 'CREDIT';
  const rawPaid = Number(rawOrder.amountPaid);
  const amountPaid = !isNaN(rawPaid)
    ? (isCredit ? Math.min(rawPaid, roundedTotal) : (rawPaid > 0 ? Math.min(rawPaid, roundedTotal) : roundedTotal))
    : roundedTotal;
  const balance = isCredit ? Math.max(0, roundedTotal - amountPaid) : 0;

  return {
    ...rawOrder,
    id: String(rawOrder.id || ''),
    invoiceNo: String(rawOrder.invoiceNo || ''),
    subtotal,
    taxTotal,
    grandTotal,
    roundedTotal,
    savings,
    discount,
    amountPaid,
    balance,
    orderItems,
    itemsCount,
    totalQty
  };
};
