import React, { useState } from 'react';
import { Pin, Search, X, Check, Trash2 } from 'lucide-react';
import { Product } from '../types';

interface PinProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  pinnedProductIds: string[];
  onTogglePin: (productId: string) => void;
  onClearAllPinned: () => void;
}

const PinProductsModal: React.FC<PinProductsModalProps> = ({
  isOpen,
  onClose,
  products,
  pinnedProductIds,
  onTogglePin,
  onClearAllPinned
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const pinnedSet = new Set(pinnedProductIds);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.barcode?.includes(searchTerm)
  );

  // Sort pinned products to top inside modal for convenient management
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const aPinned = pinnedSet.has(a.id) ? 1 : 0;
    const bPinned = pinnedSet.has(b.id) ? 1 : 0;
    return bPinned - aPinned;
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-brand-primary to-brand-dark text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shadow-inner">
              <Pin size={20} className="text-amber-300 rotate-45" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">Pin Fast-Moving Items</h3>
              <p className="text-xs text-brand-200 font-medium">Select items to display at the top of your billing window</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Subheader & Search */}
        <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex flex-col sm:flex-row gap-3 items-center justify-between shrink-0">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Search items to pin..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <span className="text-xs font-bold text-slate-500 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-amber-500 font-black mr-1">{pinnedProductIds.length}</span> Pinned
            </span>

            {pinnedProductIds.length > 0 && (
              <button
                onClick={onClearAllPinned}
                className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-red-100"
              >
                <Trash2 size={14} />
                Unpin All
              </button>
            )}
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {sortedProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {sortedProducts.map((product) => {
                const isPinned = pinnedSet.has(product.id);
                return (
                  <div
                    key={product.id}
                    onClick={() => onTogglePin(product.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between select-none ${
                      isPinned 
                        ? 'bg-amber-50/60 border-amber-300 shadow-sm' 
                        : 'bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                        isPinned ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {product.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-slate-800 truncate">{product.name}</h4>
                        <div className="text-xs text-slate-500 font-semibold flex items-center gap-2">
                          <span className="text-brand-primary font-bold">₹{product.sellingPrice.toFixed(2)}</span>
                          <span>•</span>
                          <span>Stock: {product.stockQuantity}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin(product.id);
                      }}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                        isPinned 
                          ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30' 
                          : 'bg-slate-100 text-slate-400 hover:bg-amber-100 hover:text-amber-600'
                      }`}
                      title={isPinned ? 'Unpin item' : 'Pin item'}
                    >
                      <Pin size={16} className={isPinned ? 'rotate-45 fill-white' : ''} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center text-slate-400 font-semibold">
              No products found matching "{searchTerm}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-brand-primary text-white text-xs font-black rounded-xl hover:bg-brand-dark transition-all shadow-md shadow-brand-primary/20 flex items-center gap-2"
          >
            <Check size={16} />
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default PinProductsModal;
