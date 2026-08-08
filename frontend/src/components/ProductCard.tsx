import React from 'react';
import { Product } from '../types';
import { Pin } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  isPinned?: boolean;
  onTogglePin?: (productId: string, e: React.MouseEvent) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onSelect, isPinned, onTogglePin }) => {
  return (
    <button
      onClick={() => onSelect(product)}
      className={`flex flex-col bg-white rounded-xl p-2 md:p-3 shadow-sm border transition-all text-left group relative hover:border-brand-400 hover:shadow-md active:scale-95 ${
        isPinned ? 'border-amber-300/80 bg-gradient-to-b from-amber-50/30 to-white' : 'border-transparent'
      }`}
    >
      {/* Pin Icon Toggle Button */}
      {onTogglePin && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(product.id, e);
          }}
          className={`absolute top-2 right-2 z-10 p-1.5 rounded-lg transition-all ${
            isPinned 
              ? 'bg-amber-500 text-white shadow-md opacity-100 scale-100' 
              : 'bg-white/80 text-slate-300 hover:text-amber-500 hover:bg-amber-50 opacity-0 group-hover:opacity-100 scale-90 hover:scale-100'
          }`}
          title={isPinned ? 'Unpin item' : 'Pin item to top'}
        >
          <Pin size={14} className={isPinned ? 'rotate-45 fill-white' : ''} />
        </span>
      )}

      <div className="w-full h-24 md:h-32 bg-slate-50 mb-2 rounded-lg flex items-center justify-center overflow-hidden border border-slate-100 p-1 relative">
        {product.image ? (
          <img src={product.image} alt={product.name} className="w-full h-full object-contain" loading="lazy" />
        ) : (
          <span className="text-slate-300 font-black text-2xl md:text-3xl uppercase select-none group-hover:text-brand-secondary font-mono transition-colors">
            {product.name.charAt(0)}
          </span>
        )}
      </div>
      <div className="font-semibold text-slate-700 truncate text-xs md:text-sm mb-0.5 flex items-center gap-1">
        {isPinned && <Pin size={12} className="text-amber-500 fill-amber-500 shrink-0 rotate-45" />}
        <span className="truncate">{product.name}</span>
      </div>
      <div className="text-brand-primary font-bold text-sm md:text-lg">₹{product.sellingPrice.toFixed(2)}</div>
      <div className="text-[10px] text-slate-400 mt-0.5 flex justify-between items-end">
        <span className="truncate">Stock: {product.stockQuantity}</span>
      </div>
    </button>
  );
};

export default React.memo(ProductCard);

