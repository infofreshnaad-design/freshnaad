import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const usePOSStore = create(
  persist(
    (set, get) => ({
      cart: [],
  customer: null,
  loyaltyDiscount: 0,
  manualDiscount: 0,
  appliedPoints: 0,
  
  initSocket: () => {
    // No-op for now to prevent loops
    console.log('Socket initialization disabled in this build');
  },

  addToCart: (product, quantity = 1) => set((state) => {
    if (!product) return state;
    
    // Check if product is out of stock entirely
    if (product.stockQuantity <= 0) {
      alert(`Product ${product.name} is out of stock.`);
      return state;
    }

    const existingItem = state.cart.find((item) => item.id === product.id);
    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      
      // Prevent exceeding stock
      if (newQuantity > product.stockQuantity) {
        alert(`Maximum stock reached for ${product.name} (Available: ${product.stockQuantity})`);
        return {
          cart: state.cart.map((item) =>
            item.id === product.id
              ? { ...item, quantity: product.stockQuantity }
              : item
          ),
        };
      }

      return {
        cart: state.cart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: newQuantity }
            : item
        ),
      };
    }
    
    // Initial add check
    const clampedQuantity = Math.min(quantity, product.stockQuantity);
    return { cart: [...state.cart, { ...product, quantity: clampedQuantity }] };
  }),

  removeFromCart: (productId) => set((state) => ({
    cart: state.cart.filter((item) => item.id !== productId),
  })),

  updateQuantity: (productId, quantity) => set((state) => ({
    cart: state.cart.map((item) => {
      if (item.id === productId) {
        const newQty = Math.max(0, quantity);
        // Prevent exceeding stock during manual update
        if (newQty > item.stockQuantity) {
          alert(`Only ${item.stockQuantity} units available in stock.`);
          return { ...item, quantity: item.stockQuantity };
        }
        return { ...item, quantity: newQty };
      }
      return item;
    }),
  })),

  clearCart: () => set({ cart: [], customer: null, loyaltyDiscount: 0, manualDiscount: 0, appliedPoints: 0 }),
  
  setCustomer: (customer) => set({ customer, loyaltyDiscount: 0, appliedPoints: 0 }),

  setLoyaltyDiscount: (discount, points) => set({ loyaltyDiscount: discount, appliedPoints: points }),
  
  setManualDiscount: (discount) => set({ manualDiscount: discount }),
  
  getTotals: () => {
    const { cart, loyaltyDiscount, manualDiscount } = get();
    if (!cart) return { subtotal: 0, taxTotal: 0, grandTotal: 0, loyaltyDiscount: 0, manualDiscount: 0 };
    
    const subtotal = cart.reduce(
      (acc, item) => acc + (item.sellingPrice || 0) * (item.quantity || 0),
      0
    );
    const taxTotal = cart.reduce(
      (acc, item) => acc + ((item.sellingPrice || 0) * ((item.gstRate || 0) / 100)) * (item.quantity || 0),
      0
    );
    const savings = cart.reduce(
      (acc, item) => acc + ((item.mrp || item.sellingPrice || 0) - (item.sellingPrice || 0)) * (item.quantity || 0),
      0
    );
    const grandTotal = Math.max(0, subtotal + taxTotal - (loyaltyDiscount || 0) - (manualDiscount || 0));
    const roundedTotal = Math.floor(grandTotal);
    
    return { subtotal, taxTotal, grandTotal, roundedTotal, loyaltyDiscount, manualDiscount, savings };
  },
}),
    {
      name: 'pos-cart-storage',
    }
  )
);

export default usePOSStore;
