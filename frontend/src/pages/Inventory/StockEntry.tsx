import React, { useState, useEffect } from 'react';
import { Plus, Search, Trash2, Save, ShoppingBag, ArrowLeft, Calendar, Share2, Check, User, ChevronDown, Trash } from 'lucide-react';
import api from '../../api/api';
import { Product } from '../../types';
import { useNavigate, useLocation } from 'react-router-dom';

// Reusable Input Component with Floating-Style Label
const CustomInput = ({ label, value, onChange, placeholder, type = "text", disabled = false, icon = null }: any) => (
  <div className="relative group mb-6">
    <label className="absolute -top-2.5 left-3 px-1 bg-white text-[11px] font-bold text-slate-400 uppercase tracking-wider z-10">
      {label}
    </label>
    <div className={`flex items-center gap-3 w-full p-2.5 border-[1.5px] rounded-xl transition-all ${disabled ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200 group-focus-within:border-blue-500 group-focus-within:ring-1 group-focus-within:ring-blue-100'}`}>
      {icon && <div className="text-slate-400 pl-1">{icon}</div>}
      <input 
        type={type} 
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full bg-transparent border-none focus:ring-0 text-slate-800 font-bold placeholder:text-slate-200 p-0 text-[15px]"
        autoComplete="off"
      />
    </div>
  </div>
);

const StockEntry = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [supplierName, setSupplierName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'BILL' | 'PO'>('BILL');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [billNo, setBillNo] = useState('');
  const [step, setStep] = useState<'main' | 'add-item' | 'finalize'>('main');

  // Payment State (For Finalize Page)
  const [isPaid, setIsPaid] = useState(true);
  const [paidAmount, setPaidAmount] = useState<string>('');

  // Working Item State (For Add Item Page)
  const [workingItem, setWorkingItem] = useState({
    productId: '',
    name: '',
    quantity: '',
    unit: 'Nos',
    price: '',
    discountPercent: 0,
    total: 0
  });
  const [itemSearch, setItemSearch] = useState('');

  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const [prodRes, supRes] = await Promise.all([
          api.get('/products'),
          api.get('/suppliers')
        ]);
        setProducts(prodRes.data);
        setSuppliers(supRes.data);

        // Handle Mode Selection
        if (location.state?.mode === 'PO') {
            setMode('PO');
            setBillNo(`PO-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`); // Prefilled or count
        } else {
            const countRes = await api.get('/purchases/count').catch(() => ({ data: { count: 0 } }));
            setBillNo(`PUR-${1001 + (countRes.data.count || 0)}`);
        }

        // Handle PO Conversion auto-population (Converting PO -> Bill)
        if (location.state?.po) {
          const po = location.state.po;
          setSelectedSupplierId(po.supplierId);
          setSupplierName(po.supplier?.name || po.supplierName);
          
          const poItems = po.poItems.map((item: any) => ({
            productId: item.productId,
            name: item.product.name,
            quantity: item.quantity,
            unit: item.product.unit || 'Nos',
            price: item.price.toString(),
            discountPercent: item.discountPercent || 0,
            total: item.total
          }));
          setCart(poItems);
          setMode('BILL'); // When converting PO, result is always a BILL
        }
      } catch (error) {
        console.error('Error fetching initial data:', error);
      }
    };
    fetchInitial();
  }, [location.state]);

  const totalAmount = cart.reduce((sum, item) => sum + (item.quantity * item.price), 0);

  // Auto-sync supplier ID when typing (if exact match found)
  useEffect(() => {
      const match = suppliers.find(s => s.name.toLowerCase() === supplierName.toLowerCase());
      if (match) setSelectedSupplierId(match.id);
  }, [supplierName, suppliers]);

  const handleSelectItem = (p: Product) => {
    setWorkingItem({
      ...workingItem,
      productId: p.id,
      name: p.name,
      unit: p.unit || 'Nos',
      price: p.purchasePrice.toString()
    });
    setItemSearch(p.name);
  };

  const addToCartInternal = (shouldReset: boolean) => {
    if (!workingItem.productId || !workingItem.quantity) return alert('Please select item and enter quantity');
    
    const qty = parseFloat(workingItem.quantity);
    const prc = parseFloat(workingItem.price);
    const newItem = { ...workingItem, quantity: qty, price: prc, total: qty * prc };

    setCart([...cart, newItem]);

    if (shouldReset) {
      setWorkingItem({ productId: '', name: '', quantity: '', unit: 'Nos', price: '', discountPercent: 0, total: 0 });
      setItemSearch('');
    } else {
      setStep('main');
    }
  };

  const handleSubmitFinal = async (shouldReset: boolean = true) => {
    if (!supplierName) return alert('Please enter Party Name');
    if (cart.length === 0) return alert('No items added');

    setLoading(true);
    try {
      const finalPaid = isPaid ? (parseFloat(paidAmount) || totalAmount) : 0;
      
      if (mode === 'PO') {
          // CREATE PURCHASE ORDER
          const poData = {
              supplierId: selectedSupplierId || null,
              supplierName,
              poItems: cart,
              subtotal: totalAmount,
              totalDiscount: 0,
              taxTotal: 0,
              grandTotal: totalAmount,
              expectedDate: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString() // Default 7 days
          };
          await api.post('/purchase-orders', poData);
          alert('Purchase Order Created Successfully!');
      } else {
          // CREATE DIRECT BILL (EXISTING LOGIC)
          const purchaseData = {
            supplierId: selectedSupplierId || null,
            supplierName,
            purchaseItems: cart,
            subtotal: totalAmount,
            totalDiscount: 0,
            taxTotal: 0,
            grandTotal: totalAmount,
            amountPaid: finalPaid,
            balanceDue: totalAmount - finalPaid,
            paymentStatus: finalPaid === totalAmount ? 'PAID' : finalPaid > 0 ? 'PARTIAL' : 'PENDING',
            paymentMode: 'CASH',
            date: purchaseDate
          };

          await api.post('/purchases', purchaseData);
          
          // If converting from PO, mark it as converted
          if (location.state?.po?.id) {
              await api.patch(`/purchase-orders/${location.state.po.id}/status`, { status: 'CONVERTED' });
          }
          alert('Stock Updated Successfully!');
      }
      
      if (shouldReset) {
        setCart([]);
        setSupplierName('');
        setSelectedSupplierId('');
        setStep('main');
        navigate('/inventory'); // Navigate back after success
      } else {
        navigate('/inventory');
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------------------------------
  // MAIN VIEW (Step 1)
  // --------------------------------------------------------------------------------
  if (step === 'main') {
    return (
      <div className="min-h-screen bg-white">
        <div className="bg-white px-4 py-4 flex items-center justify-between border-b border-slate-50 sticky top-0 z-50">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-500"><ArrowLeft size={22} /></button>
            <h1 className="text-[17px] font-black tracking-tight text-slate-800">Purchase</h1>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-slate-400 font-bold uppercase">Date</span>
            <div className="flex items-center gap-1.5 text-xs font-black text-slate-700">
                <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="bg-transparent border-none p-0 focus:ring-0 text-xs font-black cursor-pointer" />
                <ChevronDown size={12} />
            </div>
          </div>
        </div>

        <div className="p-4 space-y-6 max-w-xl mx-auto">
           <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-bold uppercase mb-1">Bill No.</span>
              <div className="flex items-center gap-2 text-blue-600 font-black text-sm">{billNo || '---'}</div>
           </div>

           <div className="relative group">
              <label className="absolute -top-2.5 left-3 px-1 bg-white text-[11px] font-bold text-slate-400 uppercase tracking-widest z-10 group-focus-within:text-blue-500 transition-colors">Party Name *</label>
              <div className="w-full p-3.5 border-[1.5px] border-slate-300 rounded-xl flex items-center bg-white group-focus-within:border-blue-500 transition-all">
                <input 
                  type="text" placeholder="Scan or select supplier..." value={supplierName} autoComplete="off"
                  onChange={(e) => { setSupplierName(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full bg-transparent border-none focus:ring-0 p-0 font-bold text-slate-700 placeholder:text-slate-200"
                />
              </div>
              {showSuggestions && (
                <div className="absolute z-[60] w-full mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden max-h-48 overflow-y-auto">
                    {suppliers.filter(s => s.name.toLowerCase().includes(supplierName.toLowerCase())).map((s, idx) => (
                        <button key={idx} onClick={() => { setSupplierName(s.name); setSelectedSupplierId(s.id); setShowSuggestions(false); }} className="w-full p-4 text-left hover:bg-blue-50 text-slate-700 font-black border-b border-slate-50 last:border-0">{s.name} ({s.phone})</button>
                    ))}
                    {suppliers.filter(s => s.name.toLowerCase().includes(supplierName.toLowerCase())).length === 0 && (
                        <div className="p-4 text-slate-400 font-bold text-xs">No supplier found in database.</div>
                    )}
                </div>
              )}
           </div>

           <button 
             onClick={() => setStep('add-item')}
             className="w-full border-2 border-slate-200 p-3.5 rounded-xl flex items-center justify-center gap-2 text-blue-600 font-black text-sm hover:bg-slate-50 transition-all active:scale-[0.98]"
           >
              <Plus size={20} strokeWidth={3} /> Add Items <span className="text-slate-300 font-bold ml-1">(Optional)</span>
           </button>

           {cart.length > 0 && (
             <div className="pt-8">
               <button 
                 onClick={() => setStep('finalize')}
                 className="w-full bg-blue-600 text-white p-4 rounded-xl font-black text-sm shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
               >
                  Proceed to Finalize <Check size={18} strokeWidth={4} />
               </button>
               <p className="text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-4">{cart.length} items added to draft</p>
             </div>
           )}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------------
  // ADD ITEM VIEW (Step 2)
  // --------------------------------------------------------------------------------
  if (step === 'add-item') {
    return (
      <div className="min-h-screen bg-white">
        <div className="bg-white px-4 py-4 flex items-center gap-4 border-b border-slate-50 sticky top-0 z-50">
          <button onClick={() => setStep('main')} className="p-2 -ml-2 text-slate-500"><ArrowLeft size={22} /></button>
          <h1 className="text-[17px] font-black tracking-tight text-slate-800">Add Items to Purchase</h1>
        </div>

        <div className="p-4 space-y-1 max-w-xl mx-auto">
            <div className="relative h-24">
              <CustomInput label="Item Name" value={itemSearch} onChange={(e: any) => setItemSearch(e.target.value)} placeholder="Search..." icon={<Search size={18} />} />
              {itemSearch && products.filter(p => p.name.toLowerCase().includes(itemSearch.toLowerCase()) && p.name !== workingItem.name).length > 0 && (
                <div className="absolute top-16 left-0 right-0 z-50 bg-white shadow-2xl rounded-xl border border-slate-100 max-h-48 overflow-y-auto">
                   {products.filter(p => p.name.toLowerCase().includes(itemSearch.toLowerCase()) && p.name !== workingItem.name).map(p => (
                     <button key={p.id} onClick={() => handleSelectItem(p)} className="w-full p-4 text-left hover:bg-blue-50 font-black text-slate-700 border-b border-slate-50 last:border-0">{p.name}</button>
                   ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4">
               <CustomInput label="Quantity" type="number" value={workingItem.quantity} onChange={(e: any) => setWorkingItem({...workingItem, quantity: e.target.value})} placeholder="0" />
               <div className="relative group mb-6">
                  <label className="absolute -top-2.5 left-3 px-1 bg-white text-[11px] font-bold text-slate-400 uppercase tracking-wider z-10">Unit</label>
                  <div className="flex items-center gap-3 w-full p-2.5 border-[1.5px] border-slate-200 rounded-xl bg-white group-focus-within:border-blue-500 ring-blue-100 transition-all">
                    <select 
                      value={workingItem.unit} 
                      onChange={(e) => setWorkingItem({...workingItem, unit: e.target.value})}
                      className="w-full bg-transparent border-none focus:ring-0 text-slate-800 font-bold p-0 text-[15px] appearance-none cursor-pointer"
                    >
                      {['Nos', 'Kg', 'Ltr', 'Pcs', 'Box', 'Pkt', 'Gm', 'Ml'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <ChevronDown size={14} className="text-slate-400 ml-auto pointer-events-none" />
                  </div>
               </div>
            </div>

            <CustomInput label="Rate (Price/Unit)" type="number" value={workingItem.price} onChange={(e: any) => setWorkingItem({...workingItem, price: e.target.value})} placeholder="0.0" />

            <div className="pt-8 space-y-4">
               <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Totals & Taxes</h3>
               <div className="border-t border-slate-100 pt-4 flex justify-between items-center px-1">
                  <span className="text-[13px] font-bold text-slate-500">Subtotal <span className="text-[10px] text-slate-300 ml-1">(Rate x Qty)</span></span>
                  <div className="flex items-center gap-4 text-slate-800 font-black"><span className="text-xs text-slate-400">₹</span><span className="text-lg">{(parseFloat(workingItem.quantity || '0') * parseFloat(workingItem.price || '0')).toFixed(1)}</span></div>
               </div>
            </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-50">
           <div className="max-w-xl mx-auto flex gap-4 h-12">
              <button 
                onClick={() => addToCartInternal(true)} 
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl"
              >Save & New</button>
              <button 
                onClick={() => addToCartInternal(false)} 
                className="flex-1 bg-[#F51F45] hover:bg-red-600 text-white font-black rounded-xl shadow-lg shadow-red-500/10"
              >Save</button>
           </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------------
  // FINALIZE VIEW (Step 3) - User says "Final page where we finalize product and all"
  // --------------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-white pb-32">
        <div className="bg-white px-4 py-4 flex items-center justify-between border-b border-slate-50 sticky top-0 z-50">
          <div className="flex items-center gap-4">
            <button onClick={() => setStep('main')} className="p-2 -ml-2 text-slate-500"><ArrowLeft size={22} /></button>
            <h1 className="text-[17px] font-black tracking-tight text-slate-800">Finalize Purchase</h1>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase">{purchaseDate}</p>
        </div>

        <div className="p-4 space-y-6 max-w-xl mx-auto">
           <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-sm">
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block mb-1">Party Name</span>
              <p className="text-lg font-black text-slate-800">{supplierName}</p>
           </div>

           <div className="flex items-center gap-2 bg-blue-500 p-2 rounded-md text-white shadow-sm shadow-blue-500/20">
              <Check size={14} strokeWidth={4} />
              <span className="text-[11px] font-black uppercase tracking-widest">Billed Items</span>
           </div>

           <div className="space-y-3">
              {cart.map((item, idx) => (
                <div key={idx} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm relative group">
                    <div className="flex justify-between items-start mb-2">
                       <div className="flex items-center gap-2">
                          <span className="bg-slate-50 text-[10px] font-black text-slate-400 px-1.5 py-0.5 rounded border">#{idx + 1}</span>
                          <h4 className="font-bold text-slate-800 text-[15px]">{item.name}</h4>
                       </div>
                       <p className="font-black text-slate-800 text-[15px]">₹{item.total.toFixed(0)}</p>
                    </div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-400">
                       <span>{item.quantity} {item.unit} x ₹{item.price}</span>
                       <span className="text-orange-400">Disc: ₹0</span>
                    </div>
                    <button onClick={() => setCart(cart.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 w-8 h-8 bg-white text-red-500 rounded-full shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border"><Trash2 size={14} /></button>
                </div>
              ))}
           </div>

           <div className="grid grid-cols-2 gap-y-2 text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 p-4 rounded-xl">
              <div className="flex justify-between border-r border-slate-200 pr-4"><span>Disc:</span> <span className="text-slate-800">0.0</span></div>
              <div className="flex justify-between pl-4"><span>Tax:</span> <span className="text-slate-800">0.0</span></div>
              <div className="flex justify-between border-r border-slate-200 pr-4"><span>Qty:</span> <span className="text-slate-800">{cart.length}</span></div>
              <div className="flex justify-between pl-4"><span>Subtotal:</span> <span className="text-slate-800">{totalAmount.toFixed(1)}</span></div>
           </div>

           {/* PAYMENT SECTION - Image 4 Style */}
           <div className="bg-[#EDF2F7] p-6 rounded-[2rem] space-y-4">
              <div className="flex justify-between items-center text-slate-800 font-black">
                 <span className="text-sm uppercase tracking-widest text-slate-500">Total Amount</span>
                 <div className="flex items-center gap-1 flex-1 ml-4 overflow-hidden">
                    <span className="text-sm">₹</span>
                    <div className="border-b-[1.5px] border-dotted border-slate-300 h-1 flex-1 min-w-[30px] mb-1"></div>
                    <span className="text-xl">{totalAmount.toFixed(1)}</span>
                 </div>
              </div>

              <div className="flex justify-between items-center">
                 <div className="flex items-center gap-3">
                    <button onClick={() => setIsPaid(!isPaid)} className={`w-7 h-7 rounded-lg flex items-center justify-center border-2 transition-all ${isPaid ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-white border-slate-300'}`}><Check size={18} strokeWidth={4} /></button>
                    <span className="font-black text-slate-700 text-sm">Paid</span>
                 </div>
                 <div className="flex items-center gap-1 flex-1 ml-4 overflow-hidden">
                    <span className="text-sm font-black text-slate-900">₹</span>
                    <div className="border-b-[1.5px] border-dotted border-slate-300 h-1 flex-1 min-w-[30px] mb-1"></div>
                    <input type="number" placeholder={totalAmount.toString()} value={paidAmount} disabled={!isPaid} onChange={(e) => setPaidAmount(e.target.value)} className="bg-transparent border-none p-0 w-24 text-right focus:ring-0 font-black text-xl text-slate-800 placeholder:text-slate-300" />
                 </div>
              </div>

              <div className="flex justify-between items-center text-emerald-600 font-black pt-2">
                 <span className="text-sm">Balance Due</span>
                 <div className="flex items-center gap-1 flex-1 ml-4 overflow-hidden">
                    <span className="text-sm">₹</span>
                    <div className="border-b-[1.5px] border-dotted border-emerald-200 h-1 flex-1 min-w-[30px] mb-1"></div>
                    <span className="text-xl">{(totalAmount - (isPaid ? (parseFloat(paidAmount) || totalAmount) : 0)).toFixed(1)}</span>
                 </div>
              </div>
           </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-slate-100 z-[100]">
           <div className="max-w-xl mx-auto flex gap-3 h-14">
              <button 
                onClick={() => { setSupplierName(''); setCart([]); setStep('main'); }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-3xl"
              >Save & New</button>
              <button 
                 onClick={() => handleSubmitFinal(false)} disabled={loading}
                 className="flex-[2] bg-[#F51F45] hover:bg-red-600 text-white font-black rounded-3xl shadow-xl shadow-red-500/20 active:scale-95 transition-all"
              >{loading ? 'PROCESSING...' : 'Save'}</button>
              <button className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center"><Share2 size={24} /></button>
           </div>
        </div>
    </div>
  );
};

export default StockEntry;
