import React, { useState, useEffect } from 'react';
import { Plus, Search, Trash2, ArrowLeft, Loader2, Package, Calculator, Edit3 } from 'lucide-react';
import api from '../../api/api';
import { Product } from '../../types';
import { useNavigate } from 'react-router-dom';
import ProductModal from '../../components/ProductModal';

// Reusable Input Component with Floating-Style Label
const CustomInput = ({ label, value, onChange, placeholder, type = "text", disabled = false, icon = null }: any) => (
  <div className="relative group mb-6">
    <label className="absolute -top-2.5 left-3 px-1 bg-white text-[11px] font-black text-slate-400 uppercase tracking-widest z-10 group-focus-within:text-brand-500 transition-colors">
      {label}
    </label>
    <div className={`flex items-center gap-3 w-full p-4 border-2 rounded-2xl transition-all ${disabled ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-100 group-focus-within:border-brand-500 group-focus-within:shadow-lg shadow-brand-500/5'}`}>
      {icon && <div className="text-slate-400 pl-1">{icon}</div>}
      <input 
        type={type} 
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full bg-transparent border-none focus:ring-0 text-slate-800 font-black placeholder:text-slate-200 p-0 text-lg md:text-xl"
        autoComplete="off"
      />
    </div>
  </div>
);

const StockProcurement = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [step, setStep] = useState<'main' | 'add-item'>('main');
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);

  // Staged Item state
  const [workingItem, setWorkingItem] = useState({
    productId: '',
    name: '',
    quantity: '',
    unit: 'Nos',
    currentStock: 0
  });

  // Pieces & Weight Calculation states
  const [calcMode, setCalcMode] = useState<'direct' | 'calc'>('direct');
  const [pieces, setPieces] = useState('');
  const [weightPerPiece, setWeightPerPiece] = useState('');
  const [weightUnit, setWeightUnit] = useState('Kg');
  const [updateBy, setUpdateBy] = useState<'pieces' | 'weight'>('pieces');

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await api.get('/products');
        setProducts(res.data);
      } catch (error) {
        console.error('Error fetching products:', error);
      }
    };
    fetchProducts();
  }, []);

  const handleSelectItem = (p: Product) => {
    const isWeightProduct = ['kg', 'gm', 'ltr', 'ml'].includes((p.unit || '').toLowerCase());
    setWorkingItem({
      productId: p.id,
      name: p.name,
      quantity: '',
      unit: p.unit || 'Nos',
      currentStock: p.stockQuantity || 0
    });
    setSearch(p.name);
    setShowSuggestions(false);

    // Reset calculation variables
    setPieces('');
    setWeightPerPiece('');
    setWeightUnit(isWeightProduct ? p.unit : 'Kg');
    setUpdateBy(isWeightProduct ? 'weight' : 'pieces');
    setCalcMode('direct');
  };

  const getCalculatedWeightDisplay = () => {
    const pcsCount = parseFloat(pieces) || 0;
    const wtPerPce = parseFloat(weightPerPiece) || 0;
    const totalWt = pcsCount * wtPerPce;
    
    // Check if we can convert it to the product's base unit for clarity
    const prodUnit = (workingItem.unit || '').toLowerCase();
    const inputUnit = weightUnit.toLowerCase();
    
    if (prodUnit === 'kg' && inputUnit === 'gm') {
      return `${totalWt / 1000} Kg (from ${totalWt} Gm)`;
    }
    if (prodUnit === 'gm' && inputUnit === 'kg') {
      return `${totalWt * 1000} Gm (from ${totalWt} Kg)`;
    }
    if (prodUnit === 'ltr' && inputUnit === 'ml') {
      return `${totalWt / 1000} Ltr (from ${totalWt} Ml)`;
    }
    if (prodUnit === 'ml' && inputUnit === 'ltr') {
      return `${totalWt * 1000} Ml (from ${totalWt} Ltr)`;
    }
    
    return `${totalWt} ${weightUnit}`;
  };

  const getCalculatedQuantity = () => {
    if (calcMode === 'direct') {
      return parseFloat(workingItem.quantity) || 0;
    }

    const pcsCount = parseFloat(pieces) || 0;
    const wtPerPce = parseFloat(weightPerPiece) || 0;
    const totalWt = pcsCount * wtPerPce;

    if (updateBy === 'pieces') {
      return pcsCount;
    }

    // Convert weight unit to product's unit
    const prodUnit = (workingItem.unit || '').toLowerCase();
    const inputUnit = weightUnit.toLowerCase();

    if (prodUnit === inputUnit) {
      return totalWt;
    }

    // Kg <-> Gm conversion
    if (prodUnit === 'kg' && inputUnit === 'gm') {
      return totalWt / 1000;
    }
    if (prodUnit === 'gm' && inputUnit === 'kg') {
      return totalWt * 1000;
    }

    // Ltr <-> Ml conversion
    if (prodUnit === 'ltr' && inputUnit === 'ml') {
      return totalWt / 1000;
    }
    if (prodUnit === 'ml' && inputUnit === 'ltr') {
      return totalWt * 1000;
    }

    return totalWt;
  };

  const handleStaging = () => {
    if (!workingItem.productId) return alert('Please select a product first.');
    const qty = getCalculatedQuantity();
    if (qty <= 0) return alert('Please enter a valid positive quantity.');

    // Check if product is already in cart
    const existingIdx = cart.findIndex(item => item.productId === workingItem.productId);
    if (existingIdx > -1) {
      const updatedCart = [...cart];
      updatedCart[existingIdx].quantity += qty;
      setCart(updatedCart);
    } else {
      setCart([...cart, { ...workingItem, quantity: qty }]);
    }

    // Reset buffer
    setWorkingItem({ productId: '', name: '', quantity: '', unit: 'Nos', currentStock: 0 });
    setSearch('');
    setPieces('');
    setWeightPerPiece('');
    setCalcMode('direct');
    setStep('main');
  };

  const handleCommit = async () => {
    if (cart.length === 0) return alert('No items added to procurement list.');

    setLoading(true);
    try {
      const payload = {
        items: cart.map(item => ({
          productId: item.productId,
          quantity: item.quantity
        }))
      };

      await api.post('/inventory/procure', payload);
      alert('Stock Procurement Completed & Inventory Stock Updated Successfully!');
      setCart([]);
      navigate('/inventory');
    } catch (error: any) {
      alert('Error updating inventory: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'add-item') {
    return (
      <div className="min-h-screen bg-white">
        <div className="bg-white px-4 py-4 flex items-center gap-4 border-b border-slate-50 sticky top-0 z-50">
          <button onClick={() => setStep('main')} className="p-2 -ml-2 text-slate-500"><ArrowLeft size={22} /></button>
          <h1 className="text-[17px] font-black tracking-tight text-slate-800">Add Stock Item</h1>
        </div>

        <div className="p-4 space-y-6 max-w-xl mx-auto">
          {/* Search Input */}
          <div className="relative group">
            <CustomInput 
              label="Select Product" 
              value={search} 
              onChange={(e: any) => { setSearch(e.target.value); setShowSuggestions(true); }}
              placeholder="Search product name or barcode..." 
              icon={<Search size={18} />} 
            />
            {showSuggestions && search && (
              <div className="absolute top-16 left-0 right-0 z-50 bg-white shadow-2xl rounded-2xl border border-slate-100 max-h-56 overflow-y-auto">
                {products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => (
                  <button 
                    key={p.id} 
                    onClick={() => handleSelectItem(p)} 
                    className="w-full p-4 text-left hover:bg-slate-50 font-black text-slate-700 border-b border-slate-50 last:border-0 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-bold text-slate-800">{p.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Current stock: {p.stockQuantity} {p.unit}</p>
                    </div>
                    <span className="text-[10px] font-black text-brand-600 uppercase">Select</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end -mt-2">
             <button
                type="button"
                onClick={() => setIsProductModalOpen(true)}
                className="text-xs font-black text-brand-600 bg-brand-50 hover:bg-brand-100 px-4 py-2.5 rounded-xl uppercase tracking-wider flex items-center gap-1.5 transition-all"
             >
                <Plus size={14} strokeWidth={3} /> Add new product
             </button>
          </div>

          {/* Configuration Inputs */}
          {workingItem.productId && (
            <div className="space-y-4 animate-in fade-in duration-300">
              
              {/* Product Info Banner */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center mb-4">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Current Stock Level</p>
                  <p className="text-lg font-black text-slate-700">{workingItem.currentStock} {workingItem.unit}</p>
                </div>
                <div className="bg-brand-50 text-brand-600 px-3 py-1 rounded-full text-xs font-black uppercase">
                  Base unit: {workingItem.unit}
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="flex bg-slate-100 p-1 rounded-2xl gap-1 mb-6">
                <button
                  type="button"
                  onClick={() => setCalcMode('direct')}
                  className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${calcMode === 'direct' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Edit3 size={14} /> Direct Entry
                </button>
                <button
                  type="button"
                  onClick={() => setCalcMode('calc')}
                  className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${calcMode === 'calc' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Calculator size={14} /> Multiply Pieces & Weight
                </button>
              </div>

              {/* Input rendering based on mode */}
              {calcMode === 'direct' ? (
                <div className="relative">
                  <CustomInput 
                    label={`Procured Qty / Weight (${workingItem.unit})`} 
                    type="number" 
                    value={workingItem.quantity} 
                    onChange={(e: any) => setWorkingItem({ ...workingItem, quantity: e.target.value })} 
                    placeholder="0.00" 
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <CustomInput 
                      label="Pieces Count" 
                      type="number" 
                      value={pieces} 
                      onChange={(e: any) => setPieces(e.target.value)} 
                      placeholder="0" 
                    />
                    <CustomInput 
                      label="Weight / Vol per Piece" 
                      type="number" 
                      value={weightPerPiece} 
                      onChange={(e: any) => setWeightPerPiece(e.target.value)} 
                      placeholder="0.00" 
                    />
                  </div>

                  {/* Weight Unit Dropdown */}
                  <div className="relative group mb-6">
                    <label className="absolute -top-2.5 left-3 px-1 bg-white text-[11px] font-black text-slate-400 uppercase tracking-widest z-10">Piece Weight Unit</label>
                    <div className="flex items-center gap-3 w-full p-4 border-2 border-slate-100 rounded-2xl bg-white group-focus-within:border-brand-500 transition-all">
                      <select 
                        value={weightUnit} 
                        onChange={(e) => setWeightUnit(e.target.value)}
                        className="w-full bg-transparent border-none focus:ring-0 text-slate-800 font-bold p-0 text-lg cursor-pointer"
                      >
                        {['Kg', 'Gm', 'Ltr', 'Ml', 'Pcs', 'Nos'].map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Multi-option Choice selector */}
                  <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 mb-6 space-y-4">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Commit Selection</p>
                      <p className="text-[11px] text-slate-400 font-medium">Select which calculated value updates the inventory:</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        onClick={() => setUpdateBy('pieces')}
                        className={`flex-1 py-3 px-4 rounded-2xl border-2 text-xs font-black transition-all text-left ${updateBy === 'pieces' ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        <p className="text-[9px] uppercase tracking-wider opacity-60">Total Pieces</p>
                        <p className="text-sm font-black mt-0.5">{parseFloat(pieces) || 0} Pieces</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setUpdateBy('weight')}
                        className={`flex-1 py-3 px-4 rounded-2xl border-2 text-xs font-black transition-all text-left ${updateBy === 'weight' ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        <p className="text-[9px] uppercase tracking-wider opacity-60">Calculated Volume/Weight</p>
                        <p className="text-sm font-black mt-0.5">{getCalculatedWeightDisplay()}</p>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Output Preview */}
              <div className="bg-brand-50 border border-brand-100 p-5 rounded-3xl flex justify-between items-center mb-6">
                <div>
                  <p className="text-[10px] font-black text-brand-400 uppercase tracking-widest mb-1">Total Stock Addition</p>
                  <p className="text-2xl font-black text-brand-800">
                    +{getCalculatedQuantity()} {workingItem.unit}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-brand-400 uppercase tracking-widest mb-1">Stock After Update</p>
                  <p className="text-lg font-black text-brand-700">
                    {(workingItem.currentStock + getCalculatedQuantity())} {workingItem.unit}
                  </p>
                </div>
              </div>

              <button 
                onClick={handleStaging}
                className="w-full py-5 bg-brand-600 hover:bg-brand-700 text-white font-black rounded-2xl shadow-xl shadow-brand-500/10 active:scale-95 transition-all flex items-center justify-center gap-2 border-b-4 border-brand-800"
              >
                <Plus size={20} strokeWidth={3} /> Add to Procurement List
              </button>
            </div>
          )}
        </div>
        {isProductModalOpen && (
          <ProductModal 
            onClose={() => setIsProductModalOpen(false)}
            onSave={async () => {
              try {
                const res = await api.get('/products');
                setProducts(res.data);
                setIsProductModalOpen(false);
                const sorted = [...res.data].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                if (sorted.length > 0) {
                  handleSelectItem(sorted[0]);
                }
              } catch (e) {
                console.error(e);
                setIsProductModalOpen(false);
              }
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-32">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center justify-between border-b border-slate-50 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-500"><ArrowLeft size={22} /></button>
          <h1 className="text-[17px] font-black tracking-tight text-slate-800">Stock Procurement</h1>
        </div>
        <button 
          onClick={() => setStep('add-item')}
          className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-all border-b-2 border-slate-950"
        >
          <Plus size={16} /> Add Item
        </button>
      </div>

      <div className="p-4 space-y-6 max-w-xl mx-auto">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 font-bold uppercase mb-1">Staged Items</span>
          <span className="text-xs text-slate-500 font-medium">Add products to update their stock quantities in Inventory Management.</span>
        </div>

        {/* Staged Cart Items */}
        <div className="space-y-4">
          {cart.map((item, idx) => (
            <div key={idx} className="bg-white p-5 rounded-3xl border-2 border-slate-50 shadow-sm relative group hover:border-brand-100 transition-all flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-xs">#{idx + 1}</div>
                <div>
                  <h4 className="font-black text-slate-800 text-[16px]">{item.name}</h4>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">Adding: +{item.quantity} {item.unit}</p>
                </div>
              </div>
              <button 
                onClick={() => setCart(cart.filter((_, i) => i !== idx))} 
                className="w-10 h-10 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center border border-red-100 hover:bg-red-500 hover:text-white transition-colors"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}

          {cart.length === 0 && (
            <div className="py-20 text-center bg-slate-50/50 rounded-[2.5rem] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center">
              <Package size={48} className="text-slate-200 mb-4" />
              <p className="text-slate-800 font-black text-lg mb-1">No items staged</p>
              <p className="text-slate-400 text-xs font-medium">Click "Add Item" to start selecting products.</p>
            </div>
          )}
        </div>

        {/* Commit Action */}
        {cart.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/95 backdrop-blur-xl border-t border-slate-100 z-[100] shadow-2xl">
            <div className="max-w-xl mx-auto flex gap-4 h-16">
              <button 
                onClick={handleCommit} 
                disabled={loading}
                className="w-full bg-slate-900 text-white font-black rounded-[2rem] shadow-2xl shadow-slate-900/20 active:scale-95 transition-all text-sm uppercase tracking-[0.2em] border-b-8 border-slate-950 flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {loading && <Loader2 className="animate-spin" size={20}/>}
                {loading ? 'Procuring...' : 'Commit Stock to Inventory'}
              </button>
            </div>
          </div>
        )}
      </div>
      {isProductModalOpen && (
        <ProductModal 
          onClose={() => setIsProductModalOpen(false)}
          onSave={async () => {
            try {
              const res = await api.get('/products');
              setProducts(res.data);
              setIsProductModalOpen(false);
              const sorted = [...res.data].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              if (sorted.length > 0) {
                handleSelectItem(sorted[0]);
              }
            } catch (e) {
              console.error(e);
              setIsProductModalOpen(false);
            }
          }}
        />
      )}
    </div>
  );
};

export default StockProcurement;
