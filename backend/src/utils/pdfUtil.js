const PDFDocument = require('pdfkit');

/**
 * PDF Utility to generate professional invoices
 */
const pdfUtil = {
  /**
   * Generates a Sales Invoice PDF
   * @param {Object} order - The order object with orderItems and products
   * @param {Stream} res - The writable HTTP stream (express res)
   */
  generateInvoicePDF: (order, res) => {
    const doc = new PDFDocument({ margin: 50 });

    // Stream the PDF directly to the response
    doc.pipe(res);

    // --- Header Section ---
    doc.fillColor('#444444')
       .fontSize(20)
       .text('FRESH NAAD', 50, 50, { align: 'left' })
       .fontSize(10)
       .text('123, Business Hub, MG Road', 200, 50, { align: 'right' })
       .text('Bangalore - 560001', 200, 65, { align: 'right' })
       .moveDown();

    doc.moveTo(50, 100).lineTo(550, 100).stroke('#EEEEEE');

    // --- Bill Details ---
    doc.moveDown();
    doc.fillColor('#000000')
       .fontSize(12)
       .text(`TAX INVOICE: ${order.invoiceNo}`, 50, 120, { bold: true })
       .fontSize(10)
       .text(`Date: ${new Date(order.createdAt).toLocaleString()}`, 50, 135)
       .text(`Customer: ${order.customer?.name || order.customerName || 'Walk-in'}`, 50, 150)
       .moveDown();

    // --- Table Header ---
    const tableTop = 180;
    doc.fillColor('#F5F5F5')
       .rect(50, tableTop, 500, 20)
       .fill();

    doc.fillColor('#333333')
       .fontSize(10)
       .text('Item', 60, tableTop + 5)
       .text('Qty', 280, tableTop + 5)
       .text('Price', 350, tableTop + 5)
       .text('Total', 500, tableTop + 5);

    doc.moveTo(50, tableTop + 20).lineTo(550, tableTop + 20).stroke('#DDDDDD');

    // --- Table Content ---
    let y = tableTop + 30;
    order.orderItems?.forEach((item, index) => {
      const name = item.product?.name || item.name || 'Product';
      doc.fontSize(9)
         .text(name, 60, y)
         .text(item.quantity.toString(), 280, y)
         .text(`Rs.${item.price.toFixed(2)}`, 350, y)
         .text(`Rs.${item.total.toFixed(2)}`, 500, y);

      y += 20;
    });

    // --- Totals Section ---
    const totalY = y + 20;
    doc.moveTo(50, totalY).lineTo(550, totalY).stroke('#EEEEEE');
    
    doc.fontSize(12)
       .text('Total Amount:', 350, totalY + 10, { bold: true })
       .text(`Rs.${order.grandTotal.toFixed(2)}`, 500, totalY + 10, { bold: true });

    // --- Footer ---
    doc.fontSize(8)
       .fillColor('#999999')
       .text('Thank you for shopping with us! Digital Receipt via POS Pro Suite.', 50, 690, { align: 'center' })
       .text('Software by NIVAN SOLUTIONS', 50, 705, { align: 'center', bold: true });

    doc.end();
  },

  /**
   * Generates a Credit Note PDF
   */
  generateReturnPDF: (salesReturn, res) => {
    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fillColor('#444444')
       .fontSize(20)
       .text('CREDIT NOTE', 50, 50, { align: 'left' })
       .fontSize(10)
       .text('FRESH NAAD', 200, 50, { align: 'right' });

    doc.moveDown();
    doc.fillColor('#000000')
       .fontSize(10)
       .text(`Return No: ${salesReturn.returnNo}`, 50, 100)
       .text(`Date: ${new Date(salesReturn.createdAt).toLocaleString()}`, 50, 115)
       .text(`Customer: ${salesReturn.customer?.name || 'Walk-in'}`, 50, 130)
       .moveDown();

    // Table
    const tableTop = 160;
    doc.text('Item', 60, tableTop)
       .text('Qty', 280, tableTop)
       .text('Price', 350, tableTop)
       .text('Total', 500, tableTop);

    let y = tableTop + 20;
    salesReturn.returnItems?.forEach(item => {
      doc.text(item.product?.name || 'Product', 60, y)
         .text(item.quantity.toString(), 280, y)
         .text(`Rs.${item.price.toFixed(2)}`, 350, y)
         .text(`Rs.${item.total.toFixed(2)}`, 500, y);
      y += 20;
    });

    doc.moveDown()
       .fontSize(12)
       .text(`Total Refunded: Rs.${salesReturn.totalAmount.toFixed(2)}`, 350, y + 20, { bold: true });

    doc.fontSize(8)
       .fillColor('#999999')
       .text('Amount credited to your digital wallet.', 50, 690, { align: 'center' })
       .text('Software by NIVAN SOLUTIONS', 50, 705, { align: 'center', bold: true });
    doc.end();
  }
};

module.exports = pdfUtil;
