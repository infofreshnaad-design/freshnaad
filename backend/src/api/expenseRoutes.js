const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');

// Get all expenses
router.get('/', async (req, res) => {
  try {
    const expenses = await prisma.expense.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create expense
router.post('/', async (req, res) => {
  try {
    const expense = await prisma.expense.create({
      data: req.body
    });
    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create bulk expenses
router.post('/bulk', async (req, res) => {
  try {
    const expensesList = Array.isArray(req.body) ? req.body : req.body?.expenses;
    if (!Array.isArray(expensesList) || expensesList.length === 0) {
      return res.status(400).json({ error: 'Expenses array is required' });
    }
    
    const validExpenses = expensesList.map(exp => ({
      type: exp.type || 'GENERAL',
      amount: parseFloat(exp.amount) || 0,
      description: exp.description || null,
      date: exp.date ? new Date(exp.date) : new Date()
    }));

    await prisma.expense.createMany({
      data: validExpenses
    });

    res.json({ message: 'Expenses created successfully', count: validExpenses.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update expense
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await prisma.expense.update({
      where: { id },
      data: req.body
    });
    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete expense
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.expense.delete({
      where: { id }
    });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
