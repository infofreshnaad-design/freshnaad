const axios = require('axios');

/**
 * WhatsApp Utility to send automated receipts
 * Supports UltraMsg and other generic WhatsApp API instances
 */
const whatsappUtil = {
  /**
   * Helper to format the API URL (ensures endpoint is included)
   */
  getFormattedURL: (apiURL) => {
    if (!apiURL) return null;
    let url = apiURL.trim();
    // UltraMsg typically uses /messages/chat for text messages
    if (!url.includes('/messages/chat') && url.includes('ultramsg.com')) {
      url = url.endsWith('/') ? `${url}messages/chat` : `${url}/messages/chat`;
    }
    return url;
  },

  /**
   * Send a formatted PDF receipt to a customer
   * @param {Object} order - The created order object (with orderItems and product details)
   * @param {string} phone - The customer's 10-digit phone number
   */
  sendReceipt: async (order, phone, requestedHost = null) => {
    const baseURL = process.env.WHATSAPP_API_URL;
    const apiKey = process.env.WHATSAPP_API_KEY;
    
    // Dynamic host detection: Priority to request header, fallback to APP_URL
    const appURL = requestedHost 
      ? `https://${requestedHost}` 
      : (process.env.APP_URL || 'https://freshnaad.vercel.app');

    if (!baseURL || !apiKey || !phone) {
      console.warn('WhatsApp PDF automation skipped: Missing API URL or Key.');
      return { success: false, error: 'Incomplete Configuration' };
    }

    // Format phone: strip non-digits, take last 10, prefix 91
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const formattedPhone = `91${cleanPhone}`;

    // PDF URL pointing to our public endpoint
    const pdfUrl = `${appURL.replace(/\/$/, '')}/api/orders/${order.id}/pdf`;
    const docEndpoint = baseURL.includes('ultramsg.com') 
        ? (baseURL.endsWith('/') ? `${baseURL}messages/document` : `${baseURL}/messages/document`)
        : baseURL;

    try {
      console.log(`[WhatsApp] Triggering PDF Delivery to ${formattedPhone} (Invoice: ${order.invoiceNo}, Domain: ${appURL})`);
      
      const params = new URLSearchParams();
      params.append('token', apiKey);
      params.append('to', formattedPhone);
      params.append('document', pdfUrl);
      params.append('filename', `Invoice-${order.invoiceNo}.pdf`);
      params.append('caption', `*TAX INVOICE: ${order.invoiceNo}*\nThank you for shopping with us! 🙏`);

      const response = await axios.post(docEndpoint, params, { 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 20000 // Ensuring enough time for PDF generation and delivery
      });

      console.log(`[WhatsApp] Document API Response:`, JSON.stringify(response.data));
      return { success: true, message: 'PDF Sent Successfully' };
    } catch (error) {
      const errorData = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      console.error(`[WhatsApp] PDF Delivery Failure:`, errorData);
      return { success: false, error: 'Document API Error' };
    }
  },

  /**
   * Send a formatted PDF credit note to a customer
   */
  sendReturnReceipt: async (salesReturn, phone) => {
    const baseURL = process.env.WHATSAPP_API_URL;
    const apiKey = process.env.WHATSAPP_API_KEY;
    const appURL = process.env.APP_URL;

    if (!baseURL || !apiKey || !phone || !appURL) return { success: false };

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const formattedPhone = `91${cleanPhone}`;
    const pdfUrl = `${appURL.replace(/\/$/, '')}/api/sales-returns/${salesReturn.id}/pdf`;
    
    const docEndpoint = baseURL.includes('ultramsg.com') 
        ? (baseURL.endsWith('/') ? `${baseURL}messages/document` : `${baseURL}/messages/document`)
        : baseURL;

    try {
      const params = new URLSearchParams();
      params.append('token', apiKey);
      params.append('to', formattedPhone);
      params.append('document', pdfUrl);
      params.append('filename', `CreditNote-${salesReturn.returnNo}.pdf`);
      params.append('caption', `*CREDIT NOTE: ${salesReturn.returnNo}*\nAmount added to your digital wallet.`);

      const response = await axios.post(docEndpoint, params, { 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000 
      });

      return { success: true, message: 'Return PDF Sent' };
    } catch (error) {
       console.error(`[WhatsApp] Return PDF Failure:`, error.message);
       return { success: false };
    }
  }
};

module.exports = whatsappUtil;
