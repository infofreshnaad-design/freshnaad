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
        const connected = await ensureConnected();
        if (connected) {
          await handleBluetoothPrint();
          onClose();
        } else {
          handleSystemPrint();
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
      
      const itemsHtml = (order.orderItems || []).map((item: any, index: number) => {
        const itemName = item.product?.name || item.name || 'Product';
        return `
        <tr>
          <td style="font-size: 10px; padding: 2px 0;">${item.slNo || index + 1}</td>
          <td style="font-size: 10px; padding: 2px 0; font-weight: bold;">${item.barcode || ''}</td>
          <td style="font-size: 10px; padding: 2px 0;">${(item.quantity || 0).toFixed(3)}</td>
          <td style="font-size: 10px; padding: 2px 0;">${(item.price || 0).toFixed(2)}</td>
          <td style="font-size: 10px; padding: 2px 0;">${(item.mrp || item.price || 0).toFixed(0)}</td>
          <td style="font-size: 10px; padding: 2px 0;">${(item.gstRate || 0).toFixed(2)}</td>
          <td style="font-size: 10px; padding: 2px 0; text-align: right; font-weight: bold;">${(item.total || 0).toFixed(2)}</td>
        </tr>
        <tr>
          <td></td>
          <td colspan="6" style="font-size: 9px; text-transform: uppercase; padding-bottom: 5px; border-bottom: 1px solid #eee;">${itemName}</td>
        </tr>
        `;
      }).join('');

      const balance = (parseFloat(order.amountPaid) || 0) - (parseFloat(order.roundedTotal) || 0);

      printWindow.document.write(`
        <html>
          <head>
            <title>Print Bill - ${order.invoiceNo}</title>
            <style>
              @page { margin: 0; size: 80mm auto; }
              body { 
                width: 70mm; 
                margin: 0 auto; 
                padding: 5mm; 
                font-family: 'Courier New', Courier, monospace; 
                font-size: 11px;
                color: #000;
                background: #fff;
              }
              .text-center { text-align: center; }
              .text-right { text-align: right; }
              .bold { font-weight: bold; }
              .dashed-border { border-top: 1px dashed #000; margin: 8px 0; }
              table { width: 100%; border-collapse: collapse; margin: 5px 0; }
              th { text-align: left; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; font-size: 9px; }
              .total-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
              .savings { font-size: 14px; font-weight: bold; margin: 15px 0; text-align: center; }
              .short-id { font-size: 40px; font-weight: 900; margin: 10px 0; text-align: center; }
              .footer-grid { display: grid; grid-template-columns: 1fr 1fr; font-size: 9px; border-top: 1px dashed #000; padding-top: 5px; }
            </style>
          </head>
          <body>
            <div class="text-center">
              <h1 style="margin: 0; font-size: 16px;">FRESH NAAD</h1>
              <p style="margin: 2px 0;">123, Business Hub, MG Road</p>
              <p style="margin: 2px 0;">Date : ${order.createdAt ? new Date(order.createdAt).toLocaleDateString() : new Date().toLocaleDateString()} ${order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : new Date().toLocaleTimeString()}</p>
            </div>
            <div class="dashed-border"></div>
            <div style="margin-bottom: 5px;">
              <div class="total-row"><span>Cust : ${order.customer?.name || order.customerName || 'Walk-in'}</span></div>
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width: 5%">#</th>
                  <th style="width: 25%">Description</th>
                  <th style="width: 15%">Qty</th>
                  <th style="width: 12%">KRP</th>
                  <th style="width: 10%">MRP</th>
                  <th style="width: 10%">Gst%</th>
                  <th style="width: 23%; text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div style="margin-top: 5px; border-top: 1px dashed #000; padding-top: 5px;">
              <div class="total-row">
                <span>Total Items : ${order.itemsCount || 1}</span>
                <span>Total :</span>
                <span class="bold">${(order.subtotal || 0).toFixed(3)}</span>
              </div>
              <div class="total-row">
                <span>Total Qty : ${(order.totalQty || 0).toFixed(3)}</span>
                <span>Discount :</span>
                <span>${(order.discount || 0).toFixed(3)}</span>
              </div>
              <div class="total-row">
                <span></span>
                <span>Return :</span>
                <span>0.000</span>
              </div>
              <div class="total-row" style="margin-top: 5px; border-top: 1px dashed #000; padding-top: 5px;">
                <span></span>
                <span class="bold" style="font-size: 13px;">Net Total :</span>
                <span class="bold" style="font-size: 13px;">${(order.roundedTotal || 0).toFixed(2)}</span>
              </div>
              <div class="total-row">
                <span></span>
                <span>Tender :</span>
                <span>${(order.amountPaid || 0).toFixed(2)}</span>
              </div>
              <div class="total-row">
                <span></span>
                <span class="bold">Balance :</span>
                <span class="bold">${balance.toFixed(2)}</span>
              </div>
            </div>

            <div class="savings">YOU SAVED RS.${(order.savings || 0).toFixed(3)}</div>

            <div class="short-id">*${(order.invoiceNo || '').slice(-4)}*</div>

            <div style="display: flex; justify-content: space-between; font-size: 9px; margin-bottom: 5px;">
              <span>SGST : 0</span>
              <span>CGST : 0</span>
              <span>KFC : 0</span>
            </div>

            <div class="footer-grid">
              <div>Cash :${order.paymentMode === 'CASH' ? (order.amountPaid || 0).toFixed(2) : '0.00'}</div>
              <div>Counter : 001</div>
              <div>Card :${order.paymentMode === 'CARD' ? (order.amountPaid || 0).toFixed(2) : '0.00'}</div>
              <div>User ID :${order.userName || 'Staff'}</div>
              <div>Card Number : 0</div>
              <div>Bill Point :0</div>
              <div>Total Point :0</div>
            </div>

            <div style="margin-top: 15px; text-align: center; font-weight: bold; border-top: 1px solid #000; padding-top: 8px;">
               THANK YOU VISIT AGAIN
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

    return (
      <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4 print:p-0 print:bg-white print:relative">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col h-full max-h-[90vh] md:h-[700px] animate-in slide-in-from-bottom-8 print:shadow-none print:w-full print:h-auto print:rounded-none">
          <div className="p-4 border-b flex justify-between items-center bg-slate-50 print:hidden">
            <h2 className="font-bold text-slate-700">Tax Invoice Preview</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
              <X size={20} className="text-slate-500" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 font-mono text-[11px] text-slate-800 print:overflow-visible print:p-4" id="receipt-content">
            <div className="text-center mb-4">
              <h1 className="text-lg font-black uppercase mb-1">FRESH NAAD</h1>
              <p className="text-[10px]">123, Business Hub, MG Road</p>
              <div className="flex justify-center gap-2 text-[10px] mt-1">
                <span>Date: {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}</span>
                <span>Time: {order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : new Date().toLocaleTimeString()}</span>
              </div>
            </div>

            <div className="border-t border-b border-dashed border-slate-300 py-2 mb-4">
              <div className="flex justify-between">
                <span>Cust :</span>
                <span className="font-bold">{order.customer?.name || order.customerName || 'Walk-in'}</span>
              </div>
              <div className="flex justify-between">
                <span>Invoice :</span>
                <span className="font-bold">{order.invoiceNo}</span>
              </div>
            </div>

            <table className="w-full mb-4 border-collapse">
              <thead>
                <tr className="border-y border-dashed border-slate-300 text-[9px] font-bold">
                  <th className="py-1 text-left w-[5%]">#</th>
                  <th className="py-1 text-left w-[30%]">Description</th>
                  <th className="py-1 text-left w-[15%]">Qty</th>
                  <th className="py-1 text-left w-[10%]">KRP</th>
                  <th className="py-1 text-left w-[10%]">MRP</th>
                  <th className="py-1 text-left w-[10%]">Gst%</th>
                  <th className="py-1 text-right w-[20%]">Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.orderItems?.map((item: any, idx: number) => (
                  <React.Fragment key={item.id || idx}>
                    <tr className="text-[10px]">
                      <td className="py-1">{item.slNo || idx + 1}</td>
                      <td className="py-1 font-bold">{item.barcode || 'N/A'}</td>
                      <td className="py-1">{(item.quantity || 0).toFixed(3)}</td>
                      <td className="py-1">{(item.price || 0).toFixed(2)}</td>
                      <td className="py-1">{(item.mrp || item.price || 0).toFixed(0)}</td>
                      <td className="py-1">{(item.gstRate || 0).toFixed(2)}</td>
                      <td className="py-1 text-right font-bold">{(item.total || 0).toFixed(2)}</td>
                    </tr>
                    <tr className="text-[9px] uppercase text-slate-500 border-b border-slate-50">
                      <td></td>
                      <td colSpan={6} className="pb-1">{item.product?.name || item.name}</td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            <div className="border-t border-dashed border-slate-300 pt-3 space-y-1">
              <div className="flex justify-between">
                 <div className="flex flex-col gap-1">
                   <span>Total Items : {order.itemsCount || 1}</span>
                   <span>Total Qty : {(order.totalQty || 0).toFixed(3)}</span>
                 </div>
                 <div className="flex gap-4 text-right">
                    <div className="flex flex-col gap-1">
                      <p>Total :</p>
                      <p>Discount :</p>
                      <p>Return :</p>
                    </div>
                    <div className="flex flex-col gap-1 font-bold">
                      <p>{(order.subtotal || 0).toFixed(3)}</p>
                      <p>{(order.discount || 0).toFixed(3)}</p>
                      <p>0.000</p>
                    </div>
                 </div>
              </div>

              <div className="flex justify-between items-center py-2 border-y border-dashed border-slate-300 mt-2">
                 <span className="text-base font-black">Net Total :</span>
                 <span className="text-base font-black">₹{(order.roundedTotal || 0).toFixed(2)}</span>
              </div>

              <div className="flex justify-between pt-1">
                 <span>Tender :</span>
                 <span>₹{(order.amountPaid || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold">
                 <span>Balance :</span>
                 <span>₹{((parseFloat(order.amountPaid) || 0) - (parseFloat(order.roundedTotal) || 0)).toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-8 text-center">
               <p className="text-lg font-black">YOU SAVED RS.{(order.savings || 0).toFixed(3)}</p>
            </div>

            <div className="mt-4 text-center">
               <p className="text-5xl font-black tracking-tighter">*{(order.invoiceNo || '').slice(-4)}*</p>
            </div>

            <div className="flex justify-between border-y border-dashed border-slate-300 py-2 text-[9px] font-bold text-slate-500 mt-6">
               <span>SGST : 0</span>
               <span>CGST : 0</span>
               <span>KFC : 0</span>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1 py-3 text-[9px] text-slate-600">
              <div className="flex justify-between"><span>Cash:</span><span>{(order.paymentMode === 'CASH' ? order.amountPaid : 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Counter:</span><span>001</span></div>
              <div className="flex justify-between"><span>Card:</span><span>{(order.paymentMode === 'CARD' ? order.amountPaid : 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>User ID:</span><span>{order.userName || 'Staff'}</span></div>
              <div className="flex justify-between"><span>Card No:</span><span>0</span></div>
              <div className="flex justify-between"><span>Bill Pt:</span><span>0</span></div>
              <div className="flex justify-between"><span>Total Pt:</span><span>0</span></div>
            </div>

            <div className="mt-6 text-center border-t border-slate-900 pt-4 font-bold text-sm">
              THANK YOU VISIT AGAIN
            </div>
          </div>

          <div className="p-6 bg-white border-t flex flex-col gap-4 print:hidden">
            <div className="flex gap-4">
              <button 
                onClick={() => setShowWhatsAppModal(true)}
                disabled={isSending}
                className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 transition-all disabled:opacity-50"
              >
                <Share2 size={18} className="text-slate-500" />
                <span>WhatsApp</span>
              </button>
              
              <button 
                onClick={handleUnifiedPrint}
                disabled={isPrinting}
                className="flex-[2] bg-slate-900 text-white py-3 rounded-xl font-black text-lg flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 transition-all shadow-xl disabled:opacity-70"
              >
                {isPrinting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Printer size={22} />
                )}
                <span>PRINT BILL</span>
              </button>
            </div>
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
