const axios = require('axios');
const jwt = require('jsonwebtoken');
const prisma = require('../backend/src/config/prisma');

async function test() {
  try {
    // 1. Find a supplier
    const supplier = await prisma.supplier.findFirst();
    if (!supplier) {
      console.log('No supplier found.');
      return;
    }

    // 2. Create a payment in DB
    const payment = await prisma.purchasePayment.create({
      data: {
        supplierId: supplier.id,
        amount: 70.8,
        method: 'CASH',
        transactionId: 'TEST-REST-123',
        date: new Date()
      }
    });
    console.log('Created payment in DB:', payment.id);

    // 3. Sign a JWT token as ADMIN
    const secret = process.env.JWT_SECRET || 'freshnaad_pos_enterprise_secret_2026';
    const token = jwt.sign(
      { id: 'admin-id', role: 'ADMIN', name: 'Test Admin' },
      secret,
      { expiresIn: '1h' }
    );

    // 4. Send DELETE request to running local server
    console.log(`Sending DELETE to http://localhost:5000/api/ap/payment/${payment.id}`);
    const response = await axios.delete(`http://localhost:5000/api/ap/payment/${payment.id}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('DELETE response status:', response.status);
    console.log('DELETE response data:', response.data);

  } catch (error) {
    if (error.response) {
      console.error('API Error Response:', error.response.status, error.response.data);
    } else {
      console.error('Connection Error:', error.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

test();
