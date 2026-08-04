# Development Standards & Regression Prevention Guide

To prevent bugs from reappearing when adding new features or making updates, all future changes to **Fresh Naad POS Billing Software** must strictly adhere to the following architecture rules and invariants:

---

## 1. Unified Data Normalization
- **Rule**: Never consume raw API responses or raw IndexedDB objects directly inside UI components without passing them through `frontend/src/utils/normalizer.ts`.
- **Why**: Prisma models return nested structures (`product.name`, `price`), while IndexedDB/Cart items use flat properties (`name`, `sellingPrice`). The normalizer guarantees all required fields exist.

---

## 2. IndexedDB Transaction Isolation Rules
- **Rule**: Never place an asynchronous `await` inside a `for...of` loop over an IndexedDB transaction.
- **Why**: Browsers auto-commit IndexedDB transactions as soon as microtasks pause without synchronous active requests, throwing `TransactionInactiveError`.
- **Correct Pattern**:
  ```typescript
  const tx = db.transaction('storeName', 'readwrite');
  const store = tx.objectStore('storeName');
  await Promise.all(items.map(item => store.put(item)));
  await tx.done;
  ```

---

## 3. Invoice Counter Synchronization Invariant
- **Rule**: Never modify invoice counter generation without updating BOTH `localStorage.getItem('last_invoice_no')` and backend `MAX(invoiceNo)` SQL queries.
- **Why**: Prevents continuous billing invoice number collisions when multiple bills are processed rapidly or offline.

---

## 4. Idempotency & Bulk Sync Contracts
- **Rule**: When posting orders via API, always supply `id` (UUID) as both `id` and `serverId`. In bulk sync, always check `OR: [{ serverId: id }, { id: id }, { invoiceNo: invoiceNo }]`.
- **Why**: Ensures offline sync operations never trigger duplicate key constraint errors or re-sync already completed orders.

---

## 5. Automated Health Check before Deploying (`npm run check-health`)
Before pushing any updates to Git or deploying to production, run:
```bash
npm run check-health
```
This automated test suite verifies database connectivity, product pricing integrity, invoice sequence mechanics, and transaction rollback rules.
