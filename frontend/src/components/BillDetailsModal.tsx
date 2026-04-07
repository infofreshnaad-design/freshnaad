import React, { useState, useEffect } from 'react';
import { X, Calendar, ShoppingBag, CreditCard, ChevronRight, Loader2, Edit3, Trash2, Save, Plus } from 'lucide-react';
import api from '../api/api';

interface BillDetailsModalProps {
  billId: string;
  type: 'SALE' | 'PURCHASE';
  onClose: () => void;
  onUpdate?: () => void;
}

const BillDetailsModal: React.FC<BillDetailsModalProps> = ({ billId, type, onClose, onUpdate }) => {
  const [bill, setBill] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchBill = async () => {
    setLoading(true);
    try {
      const endpoint = type === 'SALE' ? `/orders/${billId}` : `/purchases/${billId}`;
      const res = await api.get(endpoint);
      setBill(res.data);
      setItems(type === 'SALE' ? res.data.orderItems : res.data.purchaseItems);
    } catch (err) {
      console.error('Error fetching bill:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBill();
  }, [billId]);

  const handleUpdateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Recalculate total for that item
    const price = newItems[index].price || newItems[index].sellingPrice;
    const qty = newItems[index].quantity;
    const gst = newItems[index].product?.gstRate || 18;
    newItems[index].total = (price * qty) + (price * (gst / 100) * qty);
    
    setItems(newItems);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
       alert("Cannot remove the last item. A bill must have at least one item.");
       return;
    }
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const subtotal = items.reduce((sum, i) => sum + ( (i.price || i.sellingPrice) * i.quantity), 0);
      const taxTotal = items.reduce((sum, i) => sum + ( (i.price || i.sellingPrice) * ( (i.product?.gstRate || 18) / 100) * i.quantity), 0);
      const grandTotal = subtotal + taxTotal;

      const payload = {
        ...bill,
        orderItems: items,
        purchaseItems: items, // reuse for both
        subtotal,
        taxTotal,
        grandTotal
      };

      const endpoint = type === 'SALE' ? `/orders/${billId}` : `/purchases/${billId}`;
      await api.put(endpoint, payload);
      setIsEditing(false);
      fetchBill();
      if (onUpdate) onUpdate();
    } catch (err) {
      alert('Error updating bill: ' + (err as any).response?.data?.error || 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[150] flex items-center justify-center p-6">
      <div className="bg-white p-10 rounded-[3rem] shadow-2xl"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>
    </div>
  );

  if (!bill) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[150] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center">
            <div>
                <h2 className="text-xl font-black text-slate-900">{bill.invoiceNo}</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mt-1">
                    <Calendar size={12}/> {new Date(bill.createdAt || bill.date).toLocaleString()}
                </p>
            </div>
            <div className="flex gap-2">
                {!isEditing && (
                    <button onClick={() => setIsEditing(true)} className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all">
                        <Edit3 size={18} />
                    </button>
                )}
                <button onClick={onClose} className="p-3 bg-slate-100 text-slate-400 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all">
                    <X size={18} />
                </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div className="space-y-4">
                {items.map((item, idx) => (
                    <div key={idx} className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-xs">
                                {idx + 1}
                            </div>
                            <div>
                                <p className="font-bold text-slate-900">{item.product?.name || 'Product'}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    {isEditing ? (
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                value={item.quantity}
                                                onChange={e => handleUpdateItem(idx, 'quantity', parseInt(e.target.value))}
                                                className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black"
                                            />
                                            <span className="text-[10px] font-black text-slate-400">@ ₹</span>
                                            <input 
                                                type="number" 
                                                value={item.price}
                                                onChange={e => handleUpdateItem(idx, 'price', parseFloat(e.target.value))}
                                                className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black"
                                            />
                                            <button 
                                                onClick={() => handleRemoveItem(idx)}
                                                className="ml-2 w-7 h-7 flex items-center justify-center bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            {item.quantity} {item.product?.unit || 'pcs'} × ₹{item.price?.toFixed(2)}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                        <p className="font-black text-slate-900">₹{item.total.toFixed(2)}</p>
                    </div>
                ))}
            </div>
        </div>

        <div className="p-8 bg-slate-50 border-t border-slate-100 space-y-3">
            <div className="flex justify-between text-xs font-black text-slate-400 uppercase tracking-widest pl-2">
                <span>Subtotal</span>
                <span>₹{bill.subtotal?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs font-black text-slate-400 uppercase tracking-widest pl-2">
                <span>Tax Total</span>
                <span>₹{bill.taxTotal?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-indigo-100">
                <span className="font-black text-indigo-900 uppercase tracking-widest text-xs">Grand Total</span>
                <span className="text-2xl font-black text-indigo-600">₹{bill.grandTotal?.toFixed(2)}</span>
            </div>
            {isEditing && (
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="w-full mt-4 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20"
                >
                    {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                    Apply Reconciliation
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default BillDetailsModal;
