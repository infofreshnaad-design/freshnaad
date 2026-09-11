import React, { useState, useEffect } from 'react';
import api from '../../api/api';
import { Wallet, Plus, Calendar, Tag, CreditCard, Edit, Trash2, FileSpreadsheet, FileText, Layers } from 'lucide-react';
import { exportUtils } from '../../utils/exportUtils';

interface GroupExpenseItem {
  id: string;
  type: string;
  amount: string;
  description: string;
}

const ExpenseManagement = () => {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Single expense form state
  const [formData, setFormData] = useState({
    type: 'GENERAL',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  // Group expense form state
  const [entryMode, setEntryMode] = useState<'SINGLE' | 'GROUP'>('SINGLE');
  const [commonDate, setCommonDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [groupItems, setGroupItems] = useState<GroupExpenseItem[]>([
    { id: '1', type: 'GENERAL', amount: '', description: '' },
    { id: '2', type: 'GENERAL', amount: '', description: '' }
  ]);

  const resetGroupForm = () => {
    setCommonDate(new Date().toISOString().split('T')[0]);
    setGroupItems([
      { id: Date.now().toString() + '-1', type: 'GENERAL', amount: '', description: '' },
      { id: Date.now().toString() + '-2', type: 'GENERAL', amount: '', description: '' }
    ]);
  };

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const response = await api.get('/expenses');
      setExpenses(response.data);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
    const fetchCategories = async () => {
      try {
        const response = await api.get('/expense-categories');
        setCategories(response.data);
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    };
    fetchCategories();
  }, []);

  const handleAddGroupRow = () => {
    setGroupItems(prev => [
      ...prev,
      { id: Date.now().toString(), type: 'GENERAL', amount: '', description: '' }
    ]);
  };

  const handleRemoveGroupRow = (id: string) => {
    if (groupItems.length <= 1) return;
    setGroupItems(prev => prev.filter(item => item.id !== id));
  };

  const handleUpdateGroupItem = (id: string, field: keyof GroupExpenseItem, value: string) => {
    setGroupItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleSaveSingleExpense = async () => {
    if (!formData.amount || !formData.type) return alert('Please fill in amount and category');
    
    try {
      setLoading(true);
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
        date: new Date(formData.date).toISOString()
      };

      if (editingId) {
        await api.put(`/expenses/${editingId}`, payload);
      } else {
        await api.post('/expenses', payload);
      }

      setIsModalOpen(false);
      setEditingId(null);
      setFormData({
        type: 'GENERAL',
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0]
      });
      fetchExpenses();
      alert(`Expense ${editingId ? 'updated' : 'recorded'} successfully!`);
    } catch (error: any) {
      alert('Error saving expense: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGroupExpenses = async () => {
    const invalidItem = groupItems.find(item => !item.amount || parseFloat(item.amount) <= 0);
    if (invalidItem) {
      return alert('Please enter a valid amount for all expense items in the group.');
    }

    try {
      setLoading(true);
      const payload = groupItems.map(item => ({
        type: item.type || 'GENERAL',
        amount: parseFloat(item.amount),
        description: item.description || '',
        date: new Date(commonDate).toISOString()
      }));

      await api.post('/expenses/bulk', { expenses: payload });

      setIsModalOpen(false);
      resetGroupForm();
      fetchExpenses();
      alert(`${payload.length} expenses recorded successfully!`);
    } catch (error: any) {
      alert('Error saving group expenses: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (expense: any) => {
    setEditingId(expense.id);
    setEntryMode('SINGLE');
    setFormData({
      type: expense.type,
      amount: expense.amount.toString(),
      description: expense.description || '',
      date: new Date(expense.date).toISOString().split('T')[0]
    });
    setIsModalOpen(true);
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    
    try {
      setLoading(true);
      await api.delete(`/expenses/${id}`);
      fetchExpenses();
      alert('Expense deleted successfully!');
    } catch (error: any) {
      alert('Error deleting expense: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = (format: 'PDF' | 'CSV') => {
    if (!expenses.length) return;

    const filename = `Expenses_${new Date().toISOString().split('T')[0]}`;
    const headers = ['Date', 'Category', 'Description', 'Amount'];
    const data = expenses.map(exp => [
      new Date(exp.date).toLocaleDateString(),
      exp.type,
      exp.description || '-',
      `Rs.${exp.amount.toFixed(2)}`
    ]);

    if (format === 'CSV') {
      const csvData = expenses.map(exp => ({
        Date: new Date(exp.date).toLocaleDateString(),
        Category: exp.type,
        Description: exp.description || '-',
        Amount: exp.amount
      }));
      exportUtils.exportToCSV(csvData, filename);
    } else {
      exportUtils.exportToPDF({ 
        title: 'Expense Management Report', 
        headers, 
        data, 
        filename 
      });
    }
  };

  const groupTotal = groupItems.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

  const renderFormattedDescription = (desc: string) => {
    if (!desc || !desc.trim()) return <span className="text-slate-400 font-normal">-</span>;
    
    const trimmed = desc.trim();
    const isFullUrl = /^https?:\/\/[^\s]+$/i.test(trimmed);
    if (isFullUrl) {
      let friendlyName = "Attached Document";
      if (trimmed.includes("1drv.ms") || trimmed.includes("onedrive") || trimmed.includes("sharepoint")) {
        friendlyName = "OneDrive Document";
      } else if (trimmed.includes("drive.google.com") || trimmed.includes("docs.google.com")) {
        friendlyName = "Google Drive Document";
      } else if (trimmed.includes("dropbox.com")) {
        friendlyName = "Dropbox File";
      }

      return (
        <div className="inline-flex items-center gap-2 max-w-xs md:max-w-md">
          <span className="font-bold text-slate-700 flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg text-xs border border-slate-200 shrink-0">
            <span className="text-blue-600 font-normal">📄</span> {friendlyName}
          </span>
          <a 
            href={trimmed} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 flex items-center gap-1 shrink-0"
            title={trimmed}
          >
            <span>Open Link ↗</span>
          </a>
        </div>
      );
    }
    
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    if (urlRegex.test(desc)) {
      const parts = desc.split(urlRegex);
      return (
        <span className="break-words max-w-xs md:max-w-md inline-block align-middle">
          {parts.map((part, index) => {
            if (part.match(urlRegex)) {
              let label = "Link Attachment";
              try {
                const urlObj = new URL(part);
                label = urlObj.hostname;
              } catch (e) {}
              return (
                <a 
                  key={index}
                  href={part} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-600 hover:text-blue-800 underline font-semibold break-all inline-flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors text-xs my-0.5 mx-1"
                  title={part}
                >
                  <span>🔗 {label}</span>
                </a>
              );
            }
            return <span key={index}>{part}</span>;
          })}
        </span>
      );
    }

    return <span className="break-words max-w-xs md:max-w-md inline-block align-middle">{desc}</span>;
  };

  return (
    <div className="p-8 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Expense Tracker</h1>
            <p className="text-slate-500 font-medium">Monitor your shop's recurring and one-time expenses.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 mr-2 shadow-sm">
                <button 
                onClick={() => handleExport('CSV')}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-black text-xs hover:bg-emerald-100 transition-all border border-emerald-100"
                >
                <FileSpreadsheet size={16} /> CSV
                </button>
                <button 
                onClick={() => handleExport('PDF')}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl font-black text-xs hover:bg-red-100 transition-all border border-red-100"
                >
                <FileText size={16} /> PDF
                </button>
            </div>

            {/* Add Single Expense */}
            <button 
                onClick={() => {
                  setEditingId(null);
                  setEntryMode('SINGLE');
                  setFormData({
                      type: 'GENERAL',
                      amount: '',
                      description: '',
                      date: new Date().toISOString().split('T')[0]
                  });
                  setIsModalOpen(true);
                }}
                className="bg-slate-800 text-white px-5 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-900 transition-all shadow-md active:scale-95 text-xs"
            >
                <Plus size={18} />
                <span>Add Expense</span>
            </button>

            {/* Add Group of Expenses */}
            <button 
                onClick={() => {
                  setEditingId(null);
                  setEntryMode('GROUP');
                  resetGroupForm();
                  setIsModalOpen(true);
                }}
                className="bg-red-600 text-white px-5 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-red-700 transition-all shadow-xl shadow-red-500/10 active:scale-95 text-xs"
            >
                <Layers size={18} />
                <span>Add Group of Expenses</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-[0.2em]">
                <th className="px-8 py-4 min-w-[130px]">Date</th>
                <th className="px-8 py-4 min-w-[130px]">Category</th>
                <th className="px-8 py-4 min-w-[220px]">Description</th>
                <th className="px-8 py-4 text-right min-w-[130px]">Amount</th>
                <th className="px-8 py-4 text-right min-w-[110px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && expenses.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-20 animate-pulse text-slate-400">Loading expenses...</td></tr>
              ) : expenses.length > 0 ? (
                expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-4 flex items-center gap-3 text-slate-600 whitespace-nowrap">
                      <Calendar size={16} className="text-slate-300 shrink-0" />
                      {new Date(expense.date).toLocaleDateString()}
                    </td>
                    <td className="px-8 py-4 whitespace-nowrap">
                      <span className="bg-slate-100 px-3 py-1 rounded-full text-[10px] font-black uppercase text-slate-500">
                        {expense.type}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-slate-800 font-medium">
                      {renderFormattedDescription(expense.description)}
                    </td>
                    <td className="px-8 py-4 text-right font-black text-red-500 whitespace-nowrap">
                      ₹{(Number(expense.amount) || 0).toFixed(2)}
                    </td>
                    <td className="px-8 py-4 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1">
                        <button 
                          onClick={() => handleEditClick(expense)}
                          className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit Expense"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => handleDeleteExpense(expense.id)}
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Expense"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <Wallet size={48} className="mx-auto text-slate-100 mb-4" />
                    <p className="text-slate-400 font-bold">No expenses recorded yet</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`bg-white w-full ${entryMode === 'GROUP' && !editingId ? 'max-w-3xl' : 'max-w-md'} rounded-[2.5rem] shadow-2xl overflow-hidden p-8 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col`}>
            
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-4 shrink-0">
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                  {editingId ? 'Edit Expense' : (entryMode === 'GROUP' ? 'Add a Group of Expenses' : 'New Expense')}
                </h2>
                <p className="text-xs text-slate-400 font-medium">
                  {editingId ? 'Modify expense details' : (entryMode === 'GROUP' ? 'Add multiple expenses under one common date' : 'Record a single expense')}
                </p>
              </div>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingId(null);
                }} 
                className="text-slate-400 hover:text-slate-600 font-bold text-xs bg-slate-100 px-3 py-1.5 rounded-xl transition-colors"
              >
                CANCEL
              </button>
            </div>

            {/* Mode Switcher Tabs (Only when creating new) */}
            {!editingId && (
              <div className="flex bg-slate-100 p-1 rounded-2xl mb-6 shrink-0">
                <button
                  onClick={() => setEntryMode('SINGLE')}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${entryMode === 'SINGLE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Plus size={15} />
                  <span>Single Expense</span>
                </button>
                <button
                  onClick={() => setEntryMode('GROUP')}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${entryMode === 'GROUP' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Layers size={15} />
                  <span>Add a Group of Expenses</span>
                </button>
              </div>
            )}

            {/* Modal Body */}
            <div className="overflow-y-auto pr-1 flex-1 space-y-6">
              {entryMode === 'SINGLE' || editingId ? (
                /* SINGLE EXPENSE FORM */
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block font-mono">Category</label>
                    <select 
                      className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-brand-500 font-bold text-slate-800 appearance-none"
                      value={formData.type}
                      onChange={(e) => setFormData({...formData, type: e.target.value})}
                    >
                      <option value="GENERAL">General</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                      {formData.type && formData.type !== 'GENERAL' && !categories.some(c => c.name === formData.type) && (
                        <option value={formData.type}>{formData.type}</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block font-mono">Description</label>
                    <input 
                      type="text" 
                      placeholder="What was this for?" 
                      className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-brand-500 font-bold text-slate-800"
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block font-mono">Amount (₹)</label>
                      <input 
                        type="number" 
                        placeholder="0.00" 
                        className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-brand-500 font-bold text-slate-800"
                        value={formData.amount}
                        onChange={(e) => setFormData({...formData, amount: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block font-mono">Date</label>
                      <input 
                        type="date" 
                        className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-brand-500 font-bold text-slate-800"
                        value={formData.date}
                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                      />
                    </div>
                  </div>

                  <button 
                    onClick={handleSaveSingleExpense}
                    disabled={loading}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white py-5 rounded-2xl font-black shadow-xl transition-all active:scale-95 disabled:opacity-50 mt-4 h-[64px]"
                  >
                    {loading ? 'SAVING...' : (editingId ? 'UPDATE EXPENSE' : 'RECORD EXPENSE')}
                  </button>
                </div>
              ) : (
                /* GROUP EXPENSES FORM */
                <div className="space-y-6">
                  {/* Common Date Banner */}
                  <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block font-mono">Common Date</span>
                      <p className="text-xs text-slate-300 font-medium">This date will be applied to all expenses below.</p>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-xl border border-slate-700">
                      <Calendar size={16} className="text-red-400" />
                      <input 
                        type="date" 
                        className="bg-transparent text-white font-bold text-sm focus:outline-none cursor-pointer"
                        value={commonDate}
                        onChange={(e) => setCommonDate(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Expense Items Header */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-xs font-black uppercase text-slate-400 tracking-wider font-mono">Expense Items ({groupItems.length})</span>
                      <button
                        onClick={handleAddGroupRow}
                        className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-xl transition-colors border border-red-100"
                      >
                        <Plus size={14} /> Add Row
                      </button>
                    </div>

                    {/* Expense Items List */}
                    <div className="space-y-3 max-h-[300px] overflow-y-auto p-1">
                      {groupItems.map((item, idx) => (
                        <div key={item.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col md:flex-row items-center gap-3 transition-all hover:border-slate-200">
                          <span className="text-xs font-black text-slate-300 font-mono w-6 text-center shrink-0">#{idx + 1}</span>
                          
                          {/* Category */}
                          <div className="w-full md:w-44 shrink-0">
                            <label className="text-[9px] font-black uppercase text-slate-400 block mb-1 md:hidden">Category</label>
                            <select
                              className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 text-xs focus:ring-2 focus:ring-brand-500"
                              value={item.type}
                              onChange={(e) => handleUpdateGroupItem(item.id, 'type', e.target.value)}
                            >
                              <option value="GENERAL">General</option>
                              {categories.map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Description */}
                          <div className="w-full flex-1">
                            <label className="text-[9px] font-black uppercase text-slate-400 block mb-1 md:hidden">Description</label>
                            <input
                              type="text"
                              placeholder="Description (e.g. Milk, Supplies)"
                              className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 text-xs focus:ring-2 focus:ring-brand-500"
                              value={item.description}
                              onChange={(e) => handleUpdateGroupItem(item.id, 'description', e.target.value)}
                            />
                          </div>

                          {/* Amount */}
                          <div className="w-full md:w-32 shrink-0">
                            <label className="text-[9px] font-black uppercase text-slate-400 block mb-1 md:hidden">Amount (₹)</label>
                            <input
                              type="number"
                              placeholder="0.00"
                              className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 text-xs focus:ring-2 focus:ring-brand-500"
                              value={item.amount}
                              onChange={(e) => handleUpdateGroupItem(item.id, 'amount', e.target.value)}
                            />
                          </div>

                          {/* Remove button */}
                          <button
                            onClick={() => handleRemoveGroupRow(item.id)}
                            disabled={groupItems.length <= 1}
                            className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-20 shrink-0 self-end md:self-center"
                            title="Remove item"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Group Summary & Save Button */}
                  <div className="pt-4 border-t border-slate-100 space-y-4">
                    <div className="flex justify-between items-center bg-slate-100 p-4 rounded-2xl">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-500 font-mono">Total Group Amount</span>
                      <span className="text-xl font-black text-red-600">₹{groupTotal.toFixed(2)}</span>
                    </div>

                    <button 
                      onClick={handleSaveGroupExpenses}
                      disabled={loading}
                      className="w-full bg-red-600 hover:bg-red-700 text-white py-5 rounded-2xl font-black shadow-xl shadow-red-500/20 transition-all active:scale-95 disabled:opacity-50 h-[64px] flex items-center justify-center gap-2 text-sm"
                    >
                      <Layers size={18} />
                      <span>{loading ? 'SAVING GROUP...' : `RECORD GROUP OF ${groupItems.length} EXPENSES`}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseManagement;

