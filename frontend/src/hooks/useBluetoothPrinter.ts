import { useCallback, useEffect, useRef } from 'react';
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

  const isPrintingRef = useRef(false);

  const connect = useCallback(async () => {
    try {
      setError(null);
      const bluetooth = (navigator as any).bluetooth;
      if (!bluetooth) throw new Error('Bluetooth not supported. Use Chrome/Edge over HTTPS.');

      // Switching to a more inclusive filter
      const dev = await bluetooth.requestDevice({
        acceptAllDevices: true,
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

      // FALLBACK: If standard services fail, try to get ANY service
      if (!service) {
        try {
          const services = await server.getPrimaryServices();
          if (services.length > 0) service = services[0];
        } catch (e) { console.warn('Could not find primary services from scanner'); }
      }

      if (!service) throw new Error('Could not find a compatible printing service on this device.');

      // DYNAMIC CHARACTERISTIC FINDING
      let char;
      try {
        char = await service.getCharacteristic(PRINTER_CHARACTERISTIC_UUID);
      } catch (e) {
        // Fallback: Get all characteristics and find a writable one
        const characteristics = await service.getCharacteristics();
        char = characteristics.find((c: any) => c.properties.write || c.properties.writeWithoutResponse);
      }

      if (!char) throw new Error('No writable characteristic found for printing.');

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

  const ensureConnected = useCallback(async (retries = 10) => {
    if (device && device.gatt.connected && characteristic) return true;
    
    if (device) {
      for (let i = 0; i < retries; i++) {
        try {
          console.log(`Connection attempt ${i + 1}/${retries}...`);
          const server = await device.gatt.connect();
          
          let service;
          for (const uuid of SUPPORTED_SERVICES) {
            try {
              service = await server.getPrimaryService(uuid);
              if (service) break;
            } catch (e) { continue; }
          }

          if (!service) {
            try {
              const services = await server.getPrimaryServices();
              if (services.length > 0) service = services[0];
            } catch (e) { console.warn('Could not find primary services'); }
          }

          if (service) {
            let char;
            try {
              char = await service.getCharacteristic(PRINTER_CHARACTERISTIC_UUID);
            } catch (e) {
              const characteristics = await service.getCharacteristics();
              char = characteristics.find((c: any) => c.properties.write || c.properties.writeWithoutResponse);
            }
            
            if (char) {
              setCharacteristic(char);
              setIsConnected(true);
              return true;
            }
          }
        } catch (e: any) {
          console.warn(`Printer busy or connection failed. Retrying... (${i + 1})`);
          // If printer is busy (connected to another device), wait 500ms and retry
          if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
          } else {
            console.error('All connection retries failed:', e);
          }
        }
      }
    }
    return false;
  }, [device, characteristic, setCharacteristic, setIsConnected]);

  const disconnect = useCallback(() => {
    globalDisconnect();
  }, [globalDisconnect]);

  const print = useCallback(async (data: Uint8Array) => {
    try {
      isPrintingRef.current = true;
      const ok = await ensureConnected();
      if (!ok) throw new Error('Printer is offline. Please reconnect in Settings.');
      
      if (!characteristic) throw new Error('Invalid characteristic handle.');

      // TRANSMIT DATA (Strict 20-byte max MTU chunking for older tablets)
      // Generic thermal printers have tiny RX buffers. If we send data faster than the physical print head moves, the buffer overrides itself.
      const CHUNK_SIZE = 20;
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        await characteristic.writeValue(chunk);
        // 40ms delay allows the print head to mechanically catch up and clears the internal BLE queue
        await new Promise(resolve => setTimeout(resolve, 40));
      }

      // NO AUTOMATIC DISCONNECT (User Request)
      // The connection stays open until manually closed or the tab is shut.

    } catch (err: any) {
      console.error('Print Error:', err);
      throw err;
    } finally {
      isPrintingRef.current = false;
    }
  }, [characteristic, ensureConnected]);

  // 3. HEARTBEAT / KEEP-ALIVE
  // To prevent printers from timing out and disconnecting internally
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isConnected && characteristic && device?.gatt.connected) {
      console.log('Starting Bluetooth Heartbeat...');
      interval = setInterval(async () => {
        if (isPrintingRef.current) return; // Suppress heartbeat if actively printing
        try {
          if (device?.gatt.connected && characteristic) {
            // Send a NUL byte to keep the connection alive
            await characteristic.writeValue(new Uint8Array([0x00]));
          }
        } catch (e) {
          console.warn('Heartbeat failed, printer might have sleep mode enabled.');
        }
      }, 20000); // Send heartbeat every 20 seconds
    }
    return () => clearInterval(interval);
  }, [isConnected, characteristic, device]);

  return { connect, disconnect, print, isConnected, device, error, ensureConnected };
};
