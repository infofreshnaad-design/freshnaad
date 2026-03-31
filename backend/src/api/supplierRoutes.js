const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');

// Get all suppliers
router.get('/', async (req, res) => {
  try {
    const { search, activeOnly } = req.query;
    const suppliers = await prisma.supplier.findMany({
      where: {
        AND: [
          search ? {
            OR: [
              { name: { contains: search || '', mode: 'insensitive' } },
              { phone: { contains: search || '' } },
              { gstNo: { contains: search || '', mode: 'insensitive' } }
            ]
          } : {},
          activeOnly === 'true' ? { is_active: true } : {}
        ]
      },
      orderBy: { name: 'asc' }
    });
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get supplier by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        purchases: {
          orderBy: { date: 'desc' },
          take: 5
        }
      }
    });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json(supplier);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create supplier
router.post('/', async (req, res) => {
  try {
    const supplier = await prisma.supplier.create({
      data: req.body
    });
    res.json(supplier);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update supplier
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = await prisma.supplier.update({
      where: { id },
      data: req.body
    });
    res.json(supplier);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle inactive status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    
    if (is_active === undefined) return res.status(400).json({ message: 'is_active is required' });
    
    const supplier = await prisma.supplier.update({
      where: { id },
      data: { is_active }
    });
    res.json(supplier);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete supplier (soft delete or hard delete if no relations)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check for existing purchases
    const purchasesCount = await prisma.purchase.count({ where: { supplierId: id } });
    if (purchasesCount > 0) {
       return res.status(400).json({ error: 'Cannot delete supplier with existing purchases. Please disable them instead.' });
    }

    await prisma.supplier.delete({
      where: { id }
    });
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
