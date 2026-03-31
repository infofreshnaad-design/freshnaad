import React, { useState, useEffect } from 'react';
import api from '../../api/api';
import { ShoppingCart, Plus, Search, Calendar, User, FileText, CheckCircle, Clock, X, Loader2, ArrowRightLeft, Printer, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PurchaseOrders = () => {
  const navigate = useNavigate();
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('PENDING');

  const fetchPOs = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/purchase-orders?status=${filter}`);
      setPos(res.data);
    } catch (error) {
      console.error('Error fetching POs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPOs();
  }, [filter]);

  const handleConvert = (po: any) => {
    // Navigate to stock entry with PO data
    navigate('/stock-procurement', { state: { po } });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-orange-50 text-orange-600 border-orange-100';
      case 'CONVERTED': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'CANCELLED': return 'bg-slate-50 text-slate-400 border-slate-100';
      default: return 'bg-slate-50 text-slate-400 border-slate-100';
    }
  };

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Purchase Orders</h1>
            <p className="text-slate-500 font-medium">Draft and manage upcoming inventory shipments.</p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
             <div className="bg-white p-1 rounded-2xl flex border border-slate-200">
                {['PENDING', 'CONVERTED', 'ALL'].map(s => (
                    <button 
                        key={s}
                        onClick={() => setFilter(s === 'ALL' ? '' : s)}
                        className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            (filter === s || (s === 'ALL' && !filter)) ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20' : 'text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        {s}
                    </button>
                ))}
             </div>
             <button 
                onClick={() => navigate('/stock-procurement')} // Direct to stock entry or a dedicated PO creator
                className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 active:scale-95"
             >
                <Plus size={20} strokeWidth={3}/>
                <span>Create Order</span>
             </button>
          </div>
        </header>

        {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="animate-spin mb-4" size={32} />
                <p className="font-bold">Accessing Order Registry...</p>
            </div>
        ) : pos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pos.map(po => (
                    <div key={po.id} className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100 hover:shadow-2xl transition-all relative group">
                        <div className="flex justify-between items-start mb-6">
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border ${getStatusColor(po.status)}`}>
                                {po.status}
                            </span>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Total Value</p>
                                <p className="text-2xl font-black text-slate-900">₹{po.grandTotal.toFixed(0)}</p>
                            </div>
                        </div>

                        <div className="space-y-6 mb-10">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 leading-tight mb-2 truncate">{po.supplier?.name || po.supplierName}</h3>
                                <div className="flex items-center gap-2 text-slate-400 font-bold text-xs">
                                   <FileText size={14}/>
                                   <span>{po.poNumber}</span>
                                   <span className="opacity-20">•</span>
                                   <Clock size={14}/>
                                   <span>{new Date(po.date).toLocaleDateString()}</span>
                                </div>
                            </div>
                            
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Itemized Breakdown</p>
                                <div className="space-y-2 max-h-24 overflow-y-auto pr-2 custom-scrollbar">
                                    {po.poItems.map((item: any, i: number) => (
                                        <div key={i} className="flex justify-between text-xs font-bold text-slate-600">
                                            <span className="truncate pr-4">{item.product.name}</span>
                                            <span className="text-slate-400 whitespace-nowrap">x{item.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button className="p-4 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-2xl transition-all active:scale-95" title="Print PO">
                                <Printer size={18}/>
                            </button>
                            {po.status === 'PENDING' ? (
                                <button 
                                    onClick={() => handleConvert(po)}
                                    className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/10 flex items-center justify-center gap-2 active:scale-95"
                                >
                                    Convert to Bill <ArrowRightLeft size={14}/>
                                </button>
                            ) : (
                                <button disabled className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] cursor-not-allowed">
                                    Finalized
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        ) : (
            <div className="py-32 text-center bg-white rounded-[3rem] border-4 border-dotted border-slate-100 flex flex-col items-center justify-center max-w-2xl mx-auto">
                <ShoppingCart size={64} className="text-slate-100 mb-6" />
                <p className="text-slate-900 font-black text-3xl mb-2">No Active Orders</p>
                <p className="text-slate-500 font-medium">Start drafting new purchase orders for your vendors.</p>
            </div>
        )}
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default PurchaseOrders;
