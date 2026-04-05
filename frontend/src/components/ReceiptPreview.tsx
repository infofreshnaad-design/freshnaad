import React from 'react';
import { useNavigate } from 'react-router-dom';
import WhatsAppShareModal from './WhatsAppShareModal';
import api from '../api/api';
import { Bluetooth, Printer, Share2, X } from 'lucide-react';
import { useBluetoothPrinter } from '../hooks/useBluetoothPrinter';
import { EscPosBuilder } from '../utils/escPosUtil';

interface ReceiptPreviewProps {
  order: any;
  onClose: () => void;
}

const ReceiptPreview: React.FC<ReceiptPreviewProps> = ({ order, onClose }) => {
  const navigate = useNavigate();
  const [showWhatsAppModal, setShowWhatsAppModal] = React.useState(false);
  const [waStatus, setWaStatus] = React.useState<any>(order?.whatsappStatus || null);
  const [isSending, setIsSending] = React.useState(false);
  const [isPrinting, setIsPrinting] = React.useState(false);
  const { print, isConnected, ensureConnected } = useBluetoothPrinter();

  if (!order) return null;

    const handleUnifiedPrint = async () => {
      setIsPrinting(true);
      try {
        // Try to ensure we are connected (with auto-repair)
        const connected = await ensureConnected();
        
        if (connected) {
          await handleBluetoothPrint();
          // Auto-close after Bluetooth print
          onClose();
        } else {
          // If auto-repair fails, fallback to system print
          handleSystemPrint();
          // Auto-close after launching system print
          onClose();
        }
      } catch (error) {
        console.error('Print logic error:', error);
        handleSystemPrint();
        onClose();
      } finally {
        setIsPrinting(false);
      }
    };

    const handleSystemPrint = () => {
      const printWindow = window.open('', '_blank');
      generateSystemPrintHtml(printWindow);
    };

    const generateSystemPrintHtml = (printWindow: Window | null) => {
      if (!printWindow) return;
      const itemsHtml = order.orderItems?.map((item: any) => {
        const itemName = item.product?.name || item.name || 'Product';
        return `
        <tr>
          <td style="padding: 5px 0;">
            <div style="font-weight: bold;">${itemName}</div>
          </td>
          <td style="padding: 5px 0; text-align: center;">${item.quantity}</td>
          <td style="padding: 5px 0; text-align: right; font-weight: bold;">₹${(item.total || (item.price * item.quantity) || 0).toFixed(2)}</td>
        </tr>
      `;
      }).join('') || '';

      printWindow.document.write(`
        <html>
          <head>
            <title>Print Bill - ${order.invoiceNo}</title>
            <style>
              @page { margin: 0; size: 80mm auto; }
              body { 
                width: 80mm; 
                margin: 0; 
                padding: 10mm; 
                font-family: 'Courier New', Courier, monospace; 
                font-size: 12px;
                color: #000;
                background: #fff;
              }
              .text-center { text-align: center; }
              .text-right { text-align: right; }
              .bold { font-weight: bold; }
              .dashed-border { border-top: 1px dashed #000; margin: 10px 0; }
              table { width: 100%; border-collapse: collapse; margin: 10px 0; }
              th { text-align: left; border-bottom: 1px solid #000; padding: 5px 0; font-size: 10px; text-transform: uppercase; }
              .total-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
              .grand-total { border-top: 1px solid #000; padding-top: 10px; margin-top: 10px; font-size: 16px; font-weight: 900; }
            </style>
          </head>
          <body>
            <div class="text-center">
              <h1 style="margin: 0; font-size: 18px; text-transform: uppercase;">FRESH NAAD</h1>
              <p style="margin: 2px 0; font-size: 10px;">123, Business Hub, MG Road</p>
              <p style="margin: 2px 0; font-size: 10px;">Bangalore - 560001</p>
            </div>
            <div class="dashed-border"></div>
            <div style="margin-bottom: 10px;">
              <div class="total-row"><span>Invoice:</span><span class="bold">${order.invoiceNo}</span></div>
              <div class="total-row"><span>Date:</span><span>${order.createdAt ? new Date(order.createdAt).toLocaleString() : new Date().toLocaleString()}</span></div>
              <div class="total-row"><span>Customer:</span><span class="bold">${order.customer?.name || order.customerName || 'Walk-in'}</span></div>
            </div>
            <div class="dashed-border"></div>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th style="text-align: center;">Qty</th>
                  <th style="text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
            <div class="dashed-border"></div>
            <div style="margin-top: 10px;">
              <div class="total-row grand-total">
                <span>Total Amount:</span>
                <span>₹${(order.grandTotal || 0).toFixed(2)}</span>
              </div>
            </div>
            <div style="margin-top: 30px; text-align: center; font-size: 10px; font-style: italic;">
              <p>Thank you for shopping with us!</p>
              <p style="margin: 2px 0;">Digital Bill Generated via POS Pro</p>
              <p style="margin: 2px 0; font-weight: bold;">Software by NIVAN SOLUTIONS</p>
            </div>
            <script>
              window.onload = () => {
                window.print();
                setTimeout(() => window.close(), 500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    };

    const handleBluetoothPrint = async () => {
      try {
        const businessInfo = {
          name: 'FRESH NAAD',
          address: '123, Business Hub, MG Road, Bangalore',
          phone: '9876543210'
        };
        const bytes = EscPosBuilder.generateReceipt(order, businessInfo);
        await print(bytes);
      } catch (error: any) {
        console.error('Bluetooth Print Error:', error);
        alert('Bluetooth Print Failed: ' + error.message);
        handleSystemPrint();
      }
    };

    const handleWhatsAppProceed = async (phone: string) => {
      setIsSending(true);
      try {
        const response = await api.post(`/orders/share-whatsapp`, {
          orderId: order.id,
          phone: phone
        });
        
        if (response.data.success) {
          setWaStatus({ success: true, message: 'Message Sent Successfully' });
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          setWaStatus({ success: false, error: response.data.error || 'Failed to send' });
        }
      } catch (error) {
        console.error('WhatsApp Error:', error);
        setWaStatus({ success: false, error: 'Connection to server failed' });
      } finally {
        setIsSending(false);
        setShowWhatsAppModal(false);
      }
    };

    const handleManualShare = () => {
        const items = order.orderItems?.map((item: any) => {
          const name = item.product?.name || item.name || 'Product';
          return `• ${name} x ${item.quantity} = ₹${(item.total || (item.price * item.quantity)).toFixed(2)}`;
        }).join('\n') || '';

        const message = `*TAX INVOICE FROM MODERN POS RETAIL*\n\n` +
                        `Invoice: *${order.invoiceNo}*\n` +
                        `Subtotal: ₹${(order.subtotal || 0).toFixed(2)}\n` +
                        `*Grand Total: ₹${(order.grandTotal || 0).toFixed(2)}*\n\n` +
                        `_Digital Receipt via POS Pro_`;

        const encodedMessage = encodeURIComponent(message);
        const phone = order.customer?.phone || '';
        window.open(`https://wa.me/91${phone}?text=${encodedMessage}`, '_blank');
    };

    return (
      <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4 print:p-0 print:bg-white print:relative">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col h-full max-h-[90vh] md:h-[700px] animate-in slide-in-from-bottom-8 print:shadow-none print:w-full print:h-auto print:rounded-none">
          <div className="p-4 border-b flex justify-between items-center bg-slate-50 print:hidden">
            <h2 className="font-bold text-slate-700">Tax Invoice Preview</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
              <X size={20} className="text-slate-500" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 font-mono text-sm text-slate-800 print:overflow-visible print:p-4" id="receipt-content">
            <div className="text-center mb-6">
              <h1 className="text-xl font-black uppercase tracking-tighter mb-1">FRESH NAAD</h1>
              <p className="text-xs">123, Business Hub, MG Road</p>
              <p className="text-xs">Bangalore - 560001</p>
            </div>

            <div className="border-t border-b border-dashed border-slate-300 py-3 mb-6 space-y-1">
              <div className="flex justify-between">
                <span>Invoice:</span>
                <span className="font-bold">{order.invoiceNo}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{order.createdAt ? new Date(order.createdAt).toLocaleString() : new Date().toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer:</span>
                <span className="font-bold">{order.customer?.name || order.customerName || 'Walk-in'}</span>
              </div>
            </div>

            <table className="w-full mb-6">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase font-bold text-slate-400">
                  <th className="py-2">Item</th>
                  <th className="py-2 text-center">Qty</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.orderItems?.map((item: any) => (
                  <tr key={item.id}>
                    <td className="py-2 pr-2">
                       <p className="font-bold leading-tight">{item.product?.name || item.name || 'Product'}</p>
                    </td>
                    <td className="py-2 text-center align-top">{item.quantity}</td>
                    <td className="py-2 text-right align-top font-bold">₹{(item.total || (item.price * item.quantity) || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t-2 border-double border-slate-300 pt-4 space-y-2">
              <div className="flex justify-between text-lg font-black pt-2 border-t border-slate-100">
                <span>Total Amount:</span>
                <span>₹{(order.grandTotal || 0).toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-8 text-center text-xs text-slate-400 italic">
              <p>Thank you for shopping with us!</p>
              <p className="mt-1">Digital Bill Generated via POS Pro</p>
              <p className="mt-1 font-bold">Software by NIVAN SOLUTIONS</p>
            </div>
          </div>

          <div className="p-6 bg-white border-t flex flex-col gap-4 print:hidden">
            <div className="flex gap-4">
              <button 
                onClick={() => setShowWhatsAppModal(true)}
                disabled={isSending}
                className={`flex-1 ${waStatus?.success ? 'bg-green-600' : 'bg-slate-100 text-slate-700'} py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50`}
              >
                {isSending ? (
                  <div className="w-4 h-4 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin" />
                ) : (
                  <Share2 size={18} className={waStatus?.success ? 'text-white' : 'text-slate-500'} />
                )}
                <span className={waStatus?.success ? 'text-white' : ''}>WhatsApp</span>
              </button>
              
              <button 
                onClick={handleUnifiedPrint}
                disabled={isPrinting}
                className={`flex-[2] ${isConnected ? 'bg-indigo-600 shadow-indigo-200' : 'bg-slate-900 shadow-slate-200'} text-white py-4 rounded-xl font-black text-lg flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all shadow-xl disabled:opacity-70`}
              >
                {isPrinting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  isConnected ? <Bluetooth size={22} /> : <Printer size={22} />
                )}
                <span>{isPrinting ? 'CONNECTING...' : 'PRINT BILL'}</span>
              </button>
            </div>

            {!isConnected && (
              <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest">
                Bluetooth Printer Disconnected • <span className="text-indigo-500 cursor-pointer hover:underline" onClick={() => navigate('/settings')}>Connect in Settings</span>
              </p>
            )}
            
            {isConnected && (
              <button 
                onClick={handleSystemPrint}
                className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                Use System Print Instead
              </button>
            )}
          </div>
        </div>

        {showWhatsAppModal && (
          <WhatsAppShareModal 
            onClose={() => setShowWhatsAppModal(false)}
            onProceed={handleWhatsAppProceed}
            isSending={isSending}
          />
        )}
      </div>
    );
};

export default ReceiptPreview;
