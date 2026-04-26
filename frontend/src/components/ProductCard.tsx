import React from 'react';
import { Product } from '../types';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onSelect }) => {
  const isOutOfStock = product.stockQuantity <= 0;

  return (
    <button
      onClick={() => !isOutOfStock && onSelect(product)}
      disabled={isOutOfStock}
      className={`flex flex-col bg-white rounded-xl p-2 md:p-3 shadow-sm border border-transparent transition-all text-left group relative ${
        isOutOfStock 
        ? 'opacity-50 grayscale cursor-not-allowed' 
        : 'hover:border-brand-400 hover:shadow-md active:scale-95'
      }`}
    >
      {isOutOfStock && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-2">
          <span className="bg-red-600 text-white text-[10px] font-black px-2 py-1 rounded uppercase tracking-tighter shadow-lg shadow-red-500/40">Out of Stock</span>
        </div>
      )}
      <div className="w-full h-24 md:h-32 bg-slate-50 mb-2 rounded-lg flex items-center justify-center overflow-hidden border border-slate-100 p-1">
        {product.image ? (
          <img src={product.image} alt={product.name} className="w-full h-full object-contain" loading="lazy" />
        ) : (
          <span className="text-slate-300 font-black text-2xl md:text-3xl uppercase select-none group-hover:text-brand-secondary font-mono transition-colors">
            {product.name.charAt(0)}
          </span>
        )}
      </div>
      <div className="font-semibold text-slate-700 truncate text-xs md:text-sm mb-0.5">{product.name}</div>
      <div className="text-brand-primary font-bold text-sm md:text-lg">₹{product.sellingPrice.toFixed(2)}</div>
      <div className="text-[10px] text-slate-400 mt-0.5 flex justify-between items-end">
        <span className="truncate">Stock: {product.stockQuantity}</span>
      </div>
    </button>
  );
};

export default React.memo(ProductCard);
