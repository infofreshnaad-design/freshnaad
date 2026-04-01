const prisma = require('../config/prisma');

class APService {
    /**
     * Get unified ledger for a supplier
     */
    async getSupplierLedger(supplierId) {
        const supplier = await prisma.supplier.findUnique({
            where: { id: supplierId },
            include: {
                purchases: {
                    orderBy: { date: 'asc' },
                    include: { purchaseItems: { include: { product: true } } }
                },
                purchaseReturns: {
                    orderBy: { date: 'asc' }
                },
                // We'll also fetch payments linked to those purchases
                // and any future general payments
            }
        });

        if (!supplier) throw new Error('Supplier not found');

        // Fetch all individual payments for this supplier
        const payments = await prisma.purchasePayment.findMany({
            where: { purchase: { supplierId } },
            orderBy: { date: 'asc' }
        });

        // 1. Combine all financial events
        let events = [];

        // Add Purchases (Credit)
        supplier.purchases.forEach(p => {
            events.push({
                id: p.id,
                date: p.date,
                type: 'PURCHASE',
                reference: p.invoiceNo,
                amount: p.grandTotal, // Debt Increases
                items: p.purchaseItems
            });
        });

        // Add Payments (Debit)
        payments.forEach(pay => {
            events.push({
                id: pay.id,
                date: pay.date,
                type: 'PAYMENT_OUT',
                reference: pay.transactionId || 'Settlement',
                amount: -pay.amount, // Debt Decreases (Negative for balance calculation)
                method: pay.method
            });
        });

        // Add Returns (Debit)
        supplier.purchaseReturns.forEach(pr => {
            events.push({
                id: pr.id,
                date: pr.date,
                type: 'PURCHASE_RETURN',
                reference: pr.returnNo,
                amount: -pr.totalAmount // Debt Decreases
            });
        });

        // 2. Sort by date
        events.sort((a, b) => new Date(a.date) - new Date(b.date));

        // 3. Calculate Running Balance
        let currentBalance = supplier.openingBalance;
        const ledger = events.map(event => {
            currentBalance += event.amount;
            return {
                ...event,
                runningBalance: currentBalance
            };
        });

        return {
            supplierInfo: {
                id: supplier.id,
                name: supplier.name,
                openingBalance: supplier.openingBalance,
                currentBalance
            },
            ledger
        };
    }

    /**
     * Process a Purchase (PURCHASE Transaction)
     */
    async processPurchase(data, io) {
        return await prisma.$transaction(async (tx) => {
            // 1. Create Purchase
            const purchase = await tx.purchase.create({
                data: {
                    invoiceNo: data.invoiceNo,
                    supplierId: data.supplierId,
                    supplierName: data.supplierName,
                    subtotal: data.subtotal,
                    taxTotal: data.taxTotal || 0,
                    grandTotal: data.grandTotal,
                    amountPaid: data.amountPaid || 0,
                    balanceDue: data.grandTotal - (data.amountPaid || 0),
                    paymentStatus: (data.amountPaid || 0) >= data.grandTotal ? 'PAID' : ((data.amountPaid || 0) > 0 ? 'PARTIAL' : 'PENDING'),
                    date: data.date ? new Date(data.date) : new Date(),
                    purchaseItems: {
                        create: data.items.map(item => ({
                            productId: item.productId,
                            quantity: item.quantity,
                            price: item.price,
                            taxAmount: 0,
                            total: (item.quantity * item.price)
                        }))
                    },
                    payments: (data.amountPaid > 0) ? {
                        create: {
                            amount: data.amountPaid,
                            method: data.paymentMode || 'CASH',
                            date: data.date ? new Date(data.date) : new Date()
                        }
                    } : undefined
                }
            });

            // 2. Update Inventory
            for (const item of data.items) {
                await tx.product.update({
                    where: { id: item.productId },
                    data: { stockQuantity: { increment: item.quantity } }
                });

                await tx.inventoryLog.create({
                    data: {
                        productId: item.productId,
                        type: 'IN',
                        quantity: item.quantity,
                        reason: `AP Purchase: ${data.invoiceNo}`
                    }
                });
            }

            if (io) {
                io.emit('INVENTORY_UPDATE', { items: data.items.map(i => ({ id: i.productId, quantity: i.quantity })) });
            }

            return purchase;
        });
    }

    /**
     * Process a Settlement (PAYMENT_OUT Transaction)
     */
    async processPaymentOut(data) {
        return await prisma.$transaction(async (tx) => {
            // Find unpaid or partially paid purchases for this supplier to settle them
            // In a simple "Account Settlement" world, we can just reduce the debt of the most recent pending bills
            // or create a 'General Credit' against the supplier.
            
            // For now, we find the oldest pending purchase and apply payment there
            let remainingToApply = data.amount;

            const pendingPurchases = await tx.purchase.findMany({
                where: { 
                    supplierId: data.supplierId,
                    paymentStatus: { in: ['PENDING', 'PARTIAL'] }
                },
                orderBy: { date: 'asc' }
            });

            for (const p of pendingPurchases) {
                if (remainingToApply <= 0) break;

                const canApply = Math.min(remainingToApply, p.balanceDue);
                
                await tx.purchasePayment.create({
                    data: {
                        purchaseId: p.id,
                        amount: canApply,
                        method: data.method || 'CASH',
                        transactionId: data.transactionId,
                        date: data.date ? new Date(data.date) : new Date()
                    }
                });

                await tx.purchase.update({
                    where: { id: p.id },
                    data: {
                        amountPaid: { increment: canApply },
                        balanceDue: { decrement: canApply },
                        paymentStatus: (p.amountPaid + canApply) >= p.grandTotal ? 'PAID' : 'PARTIAL'
                    }
                });

                remainingToApply -= canApply;
            }

            // If there's still money left (Advance Payment), we'll implement that if needed.
            // For now, we return the success state.
            return { settled: data.amount - remainingToApply, advance: remainingToApply };
        });
    }
}

module.exports = new APService();
