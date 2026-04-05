import { useCallback } from 'react';
import { usePrinterStore } from '../store/printerStore';

// Common Thermal Printer UUIDs (Expanded for broader compatibility)
const SUPPORTED_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Generic / MTP
  '0000ff00-0000-1000-8000-00805f9b34fb', // ESC/POS Standard
  '0000af00-0000-1000-8000-00805f9b34fb', // Newer Android/Chinese printers
  '0000e0ff-0000-1000-8000-00805f9b34fb', // Some Zjiang/Goojprt
];

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
      if (!bluetooth) throw new Error('Bluetooth not supported. Use Chrome/Edge over HTTPS.');

      const dev = await bluetooth.requestDevice({
        filters: [
          { services: SUPPORTED_SERVICES },
          { namePrefix: 'TP' },
          { namePrefix: 'InnerPrinter' },
          { namePrefix: 'Printer' },
          { namePrefix: 'MTP' },
          { namePrefix: 'RP' },
        ],
        optionalServices: SUPPORTED_SERVICES,
      });

      const server = await dev.gatt.connect();
      
      // Try to find the valid service from our list
      let service;
      for (const uuid of SUPPORTED_SERVICES) {
        try {
          service = await server.getPrimaryService(uuid);
          if (service) break;
        } catch (e) { continue; }
      }

      if (!service) throw new Error('Could not find a compatible printing service on this device.');

      const char = await service.getCharacteristic(PRINTER_CHARACTERISTIC_UUID);

      setDevice(dev);
      setCharacteristic(char);
      setIsConnected(true);

      dev.addEventListener('gattserverdisconnected', () => {
        setIsConnected(false);
        setCharacteristic(null);
        console.warn('Printer Disconnected!');
      });

      return dev;
    } catch (err: any) {
      setError(err.message);
      setIsConnected(false);
      throw err;
    }
  }, [setDevice, setCharacteristic, setIsConnected, setError]);

  const ensureConnected = useCallback(async () => {
    if (device && device.gatt.connected && characteristic) return true;
    
    if (device) {
      try {
        console.log('Attempting to repair Bluetooth connection...');
        const server = await device.gatt.connect();
        
        let service;
        for (const uuid of SUPPORTED_SERVICES) {
          try {
            service = await server.getPrimaryService(uuid);
            if (service) break;
          } catch (e) { continue; }
        }

        if (service) {
          const char = await service.getCharacteristic(PRINTER_CHARACTERISTIC_UUID);
          setCharacteristic(char);
          setIsConnected(true);
          return true;
        }
      } catch (e) {
        console.error('Auto-repair failed:', e);
      }
    }
    return false;
  }, [device, characteristic, setCharacteristic, setIsConnected]);

  const disconnect = useCallback(() => {
    globalDisconnect();
  }, [globalDisconnect]);

  const print = useCallback(async (data: Uint8Array) => {
    const ok = await ensureConnected();
    if (!ok) throw new Error('Printer is offline. Please reconnect in Settings.');
    
    if (!characteristic) throw new Error('Invalid characteristic.');

    const CHUNK_SIZE = 512;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      await characteristic.writeValue(chunk);
    }
  }, [characteristic, ensureConnected]);

  return { connect, disconnect, print, isConnected, device, error, ensureConnected };
};
