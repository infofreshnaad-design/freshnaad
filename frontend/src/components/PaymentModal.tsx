import React, { useState } from 'react';
import { X, CheckCircle2, QrCode, CreditCard, Banknote, User, Gift, Plus } from 'lucide-react';
import NumericKeypad from '../components/NumericKeypad';
import usePOSStore from '../store/posStore';
import CustomerSelectionModal from './CustomerSelectionModal';
import RedeemPointsModal from './RedeemPointsModal';

interface PaymentModalProps {
  onPaymentComplete: (method: string, amount: string) => Promise<void>;
  onClose: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ onPaymentComplete, onClose }) => {
  const { cart, customer, setCustomer, getTotals, loyaltyDiscount, appliedPoints, setLoyaltyDiscount } = usePOSStore();
  const { subtotal, taxTotal, grandTotal } = getTotals();
  
  const [amountPaid, setAmountPaid] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [loading, setLoading] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);

  // Hardware Keyboard Support
  React.useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const numAmount = parseFloat(amountPaid);
        if (numAmount >= grandTotal && !loading) {
          submitPayment();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [amountPaid, grandTotal, loading]);

  const submitPayment = async () => {
    const numAmount = parseFloat(amountPaid);
    if (numAmount < grandTotal) {
      alert(`Invalid Amount! You must collect at least ₹${grandTotal.toFixed(2)} to complete this sale.`);
      return;
    }
    
    setLoading(true);
    try {
      await onPaymentComplete(paymentMethod, amountPaid);
    } catch (err) {
      console.error('Payment Error:', err);
      setLoading(false);
    }
  };

  const handleKeypadInput = (val: string) => {
    setAmountPaid((prev) => (prev === '0' ? val : prev + val));
  };

  const handleKeypadDelete = () => {
    setAmountPaid((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  };

  const handleKeypadClear = () => {
    setAmountPaid('0');
  };

  const change = parseFloat(amountPaid) - grandTotal;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-full max-h-[90vh] md:h-[700px] md:max-h-[95vh] animate-in zoom-in-95 duration-200">
        {/* Left Side: Summary & Options */}
        <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col gap-4 md:gap-5 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-center shrink-0">
            <h2 className="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight">Checkout</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
              <X size={24} className="text-slate-500" />
            </button>
          </div>

          {/* Customer & Loyalty Section */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 flex items-center gap-1.5">
              <User size={12} className="text-blue-500" />
              Customer & Loyalty
            </h3>
            {customer ? (
              <div className="flex justify-between items-center bg-blue-50 p-3 rounded-xl border border-blue-100">
                <div>
                  <div className="font-bold text-slate-800">{customer.name}</div>
                  <div className="text-xs text-slate-500 font-medium">Available Pts: <span className="text-blue-600 font-bold">{customer.loyaltyPoints}</span></div>
                </div>
                <div className="flex items-center gap-2">
                   <button 
                    onClick={() => setIsRedeemModalOpen(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${appliedPoints > 0 ? 'bg-green-100 text-green-600 border border-green-200' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20'}`}
                   >
                     <Gift size={14} />
                     {appliedPoints > 0 ? `${appliedPoints} Pts Applied` : 'Redeem Points'}
                   </button>
                   <button onClick={() => { setCustomer(null); setLoyaltyDiscount(0, 0); }} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
                    <X size={18} />
                   </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => setIsCustomerModalOpen(true)}
                className="w-full py-3.5 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-bold hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={20} /> Select Customer for Loyalty
              </button>
            )}
          </div>

          <div className="bg-blue-600 p-6 rounded-3xl text-white shadow-xl shadow-blue-500/20 flex justify-between items-end">
            <div>
               <p className="text-blue-100 font-bold text-xs uppercase tracking-widest mb-1">Final Amount Due</p>
               <p className="text-5xl font-black tracking-tight">₹{grandTotal.toFixed(2)}</p>
            </div>
            <div className="text-right">
               <p className="text-blue-200 text-[10px] font-bold uppercase mb-1">Items: {cart.length}</p>
               {loyaltyDiscount > 0 && (
                 <p className="text-green-300 text-xs font-bold">Disc: -₹{loyaltyDiscount.toFixed(2)}</p>
               )}
            </div>
          </div>

          <div className="space-y-3">
             <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
               <CreditCard size={12} className="text-slate-400" />
               Payment Method
             </label>
             <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setPaymentMethod('CASH')}
                  className={`py-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                    paymentMethod === 'CASH' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-100 bg-white hover:border-slate-300 text-slate-400'
                  }`}
                >
                  <Banknote size={24} />
                  <span className="font-bold text-xs">CASH</span>
                </button>
                <button
                  onClick={() => { setPaymentMethod('UPI'); setAmountPaid(grandTotal.toString()); }}
                  className={`py-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                    paymentMethod === 'UPI' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-100 bg-white hover:border-slate-300 text-slate-400'
                  }`}
                >
                  <QrCode size={24} />
                  <span className="font-bold text-xs">UPI QR</span>
                </button>
                <button
                  onClick={() => { setPaymentMethod('CARD'); setAmountPaid(grandTotal.toString()); }}
                  className={`py-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                    paymentMethod === 'CARD' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-100 bg-white hover:border-slate-300 text-slate-400'
                  }`}
                >
                  <CreditCard size={24} />
                  <span className="font-bold text-xs">CARD</span>
                </button>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-auto">
              <div className="p-4 bg-slate-100 rounded-2xl flex flex-col justify-center">
                <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest mb-1">Paid Amount</p>
                <p className="text-2xl font-black text-slate-800">₹{amountPaid}</p>
              </div>
              <div className={`p-4 rounded-2xl flex flex-col justify-center ${change >= 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-300'}`}>
                <p className="text-[10px] uppercase font-black tracking-widest mb-1">{change >= 0 ? 'Change' : 'Balance'}</p>
                <p className="text-2xl font-black">₹{Math.max(0, change).toFixed(2)}</p>
              </div>
          </div>
        </div>

        {/* Right Side: Keypad or QR */}
        <div className="w-full md:w-1/2 p-8 bg-slate-900 flex flex-col justify-center gap-4 relative">
           {paymentMethod === 'UPI' || paymentMethod === 'CARD' ? (
             <div className="flex flex-col items-center justify-center h-full text-white text-center animate-in fade-in zoom-in-95">
                <div className="bg-white p-6 rounded-[2.5rem] mb-8 shadow-2xl relative group">
                   <QrCode size={200} className="text-slate-900 group-hover:scale-105 transition-transform duration-500" />
                   <div className="absolute inset-x-0 -bottom-3 flex justify-center">
                      <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-[10px] font-black shadow-lg">SCAN ME</span>
                   </div>
                </div>
                <p className="text-2xl font-black mb-2 tracking-tight">Pay ₹{grandTotal.toFixed(2)}</p>
                <p className="text-slate-400 text-sm mb-10 max-w-[250px] mx-auto">Please complete the payment on your device to continue.</p>
                
                <div className="flex flex-col gap-4 w-full max-w-[320px]">
                   <button 
                    disabled={loading}
                    onClick={submitPayment}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-5 rounded-2xl shadow-xl shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? <div className="h-6 w-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div> : <><CheckCircle2 size={24} /> MARK AS SUCCESS</>}
                  </button>
                  <button 
                    onClick={onClose}
                    className="w-full bg-white/5 hover:bg-white/10 text-slate-400 font-bold py-4 rounded-2xl transition-all border border-white/5"
                  >
                    CANCEL TRANSACTION
                  </button>
                </div>

                <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-1.5 opacity-30">
                   <div className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                   <div className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-pulse [animation-delay:0.2s]"></div>
                   <div className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-pulse [animation-delay:0.4s]"></div>
                </div>
             </div>
           ) : (
              <NumericKeypad 
                onInput={handleKeypadInput}
                onDelete={handleKeypadDelete}
                onClear={handleKeypadClear}
                onConfirm={submitPayment}
              />
           )}
        </div>
      </div>

      {/* Sub-modals */}
      {isCustomerModalOpen && (
        <CustomerSelectionModal 
           onClose={() => setIsCustomerModalOpen(false)} 
           onSelect={(c) => { setCustomer(c); setIsCustomerModalOpen(false); }} 
        />
      )}
      {isRedeemModalOpen && (
        <RedeemPointsModal 
          onClose={() => setIsRedeemModalOpen(false)} 
        />
      )}
    </div>
  );
};

export default PaymentModal;
