import React, { useState, useEffect } from 'react';
import api from '../../api/api';
import { Truck, Plus, Phone, Mail, FileText, Search, X, Loader2, Edit3, Trash2, Filter, ChevronRight, IndianRupee, MapPin } from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstNo: string | null;
  address: string | null;
  openingBalance: number;
  is_active: boolean;
}

const SupplierManagement = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    gstNo: '',
    address: '',
    openingBalance: 0
  });

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/suppliers');
      setSuppliers(response.data);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleOpenModal = (supplier: Supplier | null = null) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setFormData({
        name: supplier.name,
        phone: supplier.phone || '',
        email: supplier.email || '',
        gstNo: supplier.gstNo || '',
        address: supplier.address || '',
        openingBalance: supplier.openingBalance
      });
    } else {
      setEditingSupplier(null);
      setFormData({
        name: '',
        phone: '',
        email: '',
        gstNo: '',
        address: '',
        openingBalance: 0
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingSupplier) {
        await api.put(`/suppliers/${editingSupplier.id}`, {
            ...formData,
            openingBalance: Number(formData.openingBalance)
        });
      } else {
        await api.post('/suppliers', {
            ...formData,
            openingBalance: Number(formData.openingBalance)
        });
      }
      setIsModalOpen(false);
      fetchSuppliers();
    } catch (error: any) {
       alert('Error saving supplier: ' + error.message);
    } finally {
       setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
     if(!confirm('Are you sure you want to delete this supplier?')) return;
     try {
        await api.delete(`/suppliers/${id}`);
        fetchSuppliers();
     } catch (err: any) {
        alert(err.response?.data?.error || 'Could not delete supplier');
     }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (s.phone && s.phone.includes(searchTerm)) ||
    (s.gstNo && s.gstNo.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-1">Supplier Network</h1>
            <p className="text-slate-500 font-medium">Manage your sourcing partners and vendor accounts.</p>
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="w-full md:w-auto bg-slate-900 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 active:scale-95"
          >
            <Truck size={22} strokeWidth={2.5}/>
            <span>Onboard Supplier</span>
          </button>
        </header>

        <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="relative flex-1 group">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                <input 
                    type="text" 
                    placeholder="Search by vendor name, phone, or GST number..."
                    className="w-full pl-16 pr-6 py-4 bg-white border border-slate-200 rounded-[1.5rem] focus:ring-8 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all font-bold"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
        </div>

        {loading && suppliers.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="animate-spin mb-4" size={32} />
            <p className="font-bold">Syncing Vendor Data...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSuppliers.map(supplier => (
              <div key={supplier.id} className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 hover:shadow-xl transition-all group overflow-hidden relative">
                <div className="flex items-center gap-5 mb-8">
                    <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-xl shadow-lg">
                        {supplier.name.charAt(0)}
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 leading-tight">{supplier.name}</h3>
                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">Verified Supplier</p>
                    </div>
                    <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleOpenModal(supplier)} className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg"><Edit3 size={16}/></button>
                        <button onClick={() => handleDelete(supplier.id)} className="p-2 bg-slate-50 hover:bg-red-50 text-red-500 rounded-lg"><Trash2 size={16}/></button>
                    </div>
                </div>

                <div className="space-y-4 mb-8">
                    <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
                        <Phone size={14} className="text-slate-400" />
                        <span>{supplier.phone || 'No phone'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
                        <MapPin size={14} className="text-slate-400" />
                        <span className="truncate">{supplier.address || 'Address not registered'}</span>
                    </div>
                    {supplier.gstNo && (
                      <div className="flex items-center gap-3">
                        <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase">GST: {supplier.gstNo}</div>
                      </div>
                    )}
                </div>

                <div className="pt-6 border-t border-slate-100 flex gap-3">
                    <button className="flex-1 py-4 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
                        Ledger
                    </button>
                    <button className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-slate-900/10">
                        History
                    </button>
                </div>
              </div>
            ))}
            
            {filteredSuppliers.length === 0 && (
                <div className="col-span-full py-20 text-center">
                    <p className="text-slate-400 font-bold">No suppliers found.</p>
                </div>
            )}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-8 border-b flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900">{editingSupplier ? 'Modify Vendor' : 'New Supplier'}</h2>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-1">Sourcing Registry protocol</p>
                    </div>
                    <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                        <X size={24} className="text-slate-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-5">
                    <div className="space-y-4">
                        <div className="group">
                             <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Supplier / Firm Name *</label>
                             <input 
                                required type="text" placeholder="e.g. FreshProduce Pvt Ltd"
                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 focus:ring-0 outline-none transition-all font-bold"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                             />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="group">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Primary Contact</label>
                                <input 
                                    type="tel" placeholder="+91"
                                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none transition-all font-bold text-sm"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                            <div className="group">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Email Terminal</label>
                                <input 
                                    type="email" placeholder="vendor@info.com"
                                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 outline-none transition-all font-bold text-sm"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="group">
                             <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">GST Identification No.</label>
                             <input 
                                type="text" placeholder="27XXXXX0000X1Z5"
                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 transition-all font-black uppercase text-sm tracking-widest"
                                value={formData.gstNo}
                                onChange={(e) => setFormData({ ...formData, gstNo: e.target.value })}
                             />
                        </div>

                        <div className="group">
                             <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Business Address</label>
                             <textarea 
                                rows={2} placeholder="Warehouse Location"
                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 transition-all font-bold text-sm"
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                             />
                        </div>

                        <div className="group bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                             <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Opening Payable Balance (₹)</label>
                             <input 
                                type="number" placeholder="0.00"
                                className="w-full bg-transparent border-none p-0 text-xl font-black text-slate-800 placeholder:text-slate-300 focus:ring-0"
                                value={formData.openingBalance}
                                onChange={(e) => setFormData({ ...formData, openingBalance: Number(e.target.value) })}
                             />
                             <p className="text-[9px] font-bold text-indigo-400/60 mt-1 uppercase">Positive value means balance you owe</p>
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-slate-400 font-bold text-xs uppercase tracking-widest">Cancel</button>
                        <button type="submit" disabled={loading} className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-slate-900/10 active:scale-95 transition-all">
                            {loading ? 'Processing...' : (editingSupplier ? 'Confirm Update' : 'Initialize Profile')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default SupplierManagement;
