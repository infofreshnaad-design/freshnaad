import { offlineDB } from './offlineDB';
import api from '../api/api';

const API_BASE_URL = '/api';

export const addToSyncQueue = async (action, data) => {
  await offlineDB.put('syncQueue', {
    action,
    data,
    timestamp: Date.now(),
  });
  processSyncQueue();
};

export const processSyncQueue = async () => {
  if (!navigator.onLine) return;

  const queue = await offlineDB.getAll('syncQueue');
  const queueOrders = queue.filter(item => item.action === 'CREATE_ORDER').map(o => o.data);
  
  // Also collect unsynced orders directly from 'orders' store
  const localOrders = await offlineDB.getAll('orders');
  const unsyncedLocal = localOrders.filter(o => !o.isSynced);
  
  // Combine & deduplicate by ID / invoiceNo
  const combinedMap = new Map();
  queueOrders.forEach(o => { if (o && (o.id || o.invoiceNo)) combinedMap.set(o.id || o.invoiceNo, o); });
  unsyncedLocal.forEach(o => { if (o && (o.id || o.invoiceNo)) combinedMap.set(o.id || o.invoiceNo, o); });
  
  const ordersToSync = Array.from(combinedMap.values());
  
  if (ordersToSync.length > 0) {
    try {
      const response = await api.post('/sync/orders', { 
        orders: ordersToSync 
      }, { skipAuthRedirect: true });
      
      // Remove successfully synced orders from queue and update local order status
      const syncedItems = response.data.synced || [];
      for (const item of syncedItems) {
        const targetId = typeof item === 'object' && item !== null ? item.id : null;
        const targetInvoice = typeof item === 'object' && item !== null ? item.invoiceNo : item;

        // Clear matching items from syncQueue
        const queueItems = queue.filter(q => 
          (targetId && q.data?.id === targetId) || 
          (targetInvoice && q.data?.invoiceNo === targetInvoice)
        );
        for (const qi of queueItems) {
          await offlineDB.delete('syncQueue', qi.id);
        }

        // Update local 'orders' store
        const localOrder = localOrders.find(lo => 
          (targetId && lo.id === targetId) || 
          (targetInvoice && lo.invoiceNo === targetInvoice)
        );
        if (localOrder) {
          if (targetInvoice) localOrder.invoiceNo = targetInvoice;
          localOrder.isSynced = true;
          localOrder.isSyncing = false;
          await offlineDB.put('orders', localOrder);
        }
      }
      
      console.log('Bulk sync completed:', syncedItems.length, 'orders');
    } catch (error) {
      console.error('Bulk sync failed:', error);
    }
  }

  // Handle other actions (Products, etc.) individually or in groups
  const otherItems = queue.filter(item => item.action !== 'CREATE_ORDER');
  for (const item of otherItems) {
    try {
      if (item.action === 'UPDATE_PRODUCT') {
        await api.put(`/products/${item.data.id}`, item.data, { skipAuthRedirect: true });
      }
      await offlineDB.delete('syncQueue', item.id);
    } catch (error) {
      console.error('Individual sync failed for item:', item.id, error);
    }
  }
};

// Auto-sync when coming back online
window.addEventListener('online', processSyncQueue);
