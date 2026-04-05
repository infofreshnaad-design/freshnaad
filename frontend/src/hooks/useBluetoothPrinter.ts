import { useCallback } from 'react';
import { usePrinterStore } from '../store/printerStore';

// Common Thermal Printer UUIDs
const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

export const useBluetoothPrinter = () => {
  const { 
    device, 
    characteristic, 
    isConnected, 
    error,
    setDevice, 
    setCharacteristic, 
    setIsConnected, 
    setError,
    disconnect: globalDisconnect
  } = usePrinterStore();

  const connect = useCallback(async () => {
    try {
      setError(null);
      const bluetooth = (navigator as any).bluetooth;
      if (!bluetooth) {
        throw new Error('Bluetooth not supported in this browser.');
      }

      const dev = await bluetooth.requestDevice({
        filters: [
          { services: [PRINTER_SERVICE_UUID] },
          { namePrefix: 'TP' },
          { namePrefix: 'InnerPrinter' },
          { namePrefix: 'Printer' },
          { namePrefix: 'MTP' },
        ],
        optionalServices: [PRINTER_SERVICE_UUID, '000018f0-0000-1000-8000-00805f9b34fb'],
      });

      const server = await dev.gatt.connect();
      const service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
      const char = await service.getCharacteristic(PRINTER_CHARACTERISTIC_UUID);

      setDevice(dev);
      setCharacteristic(char);
      setIsConnected(true);

      dev.addEventListener('gattserverdisconnected', () => {
        setIsConnected(false);
        setCharacteristic(null);
      });

      console.log('Printer Connected:', dev.name);
    } catch (err: any) {
      console.error('Bluetooth Connection Error:', err);
      setError(err.message);
      setIsConnected(false);
    }
  }, [setDevice, setCharacteristic, setIsConnected, setError]);

  const disconnect = useCallback(() => {
    globalDisconnect();
  }, [globalDisconnect]);

  const print = useCallback(async (data: Uint8Array) => {
    if (!characteristic) throw new Error('Printer not connected.');
    
    // Most printers handle max 20 bytes per write, but thermal printers often handle more.
    // We'll chunk it just in case.
    const CHUNK_SIZE = 512;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      await characteristic.writeValue(chunk);
    }
  }, [characteristic]);

  return { connect, disconnect, print, isConnected, device, error };
};
