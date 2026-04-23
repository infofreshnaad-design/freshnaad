import { useCallback, useEffect, useRef } from 'react';
import { usePrinterStore } from '../store/printerStore';

// Common Thermal Printer UUIDs (Expanded for broader compatibility)
const SUPPORTED_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Generic / MTP
  '0000ff00-0000-1000-8000-00805f9b34fb', // ESC/POS Standard
  '0000af00-0000-1000-8000-00805f9b34fb', // Newer Android/Chinese printers
  '0000e0ff-0000-1000-8000-00805f9b34fb', // Some Zjiang/Goojprt
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // B-POS / ISSC
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Zijiang B-POS
];

const PRINTER_CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

let hasAttemptedAutoReconnect = false;

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

  useEffect(() => {
    const autoConnect = async () => {
      if (hasAttemptedAutoReconnect) return;
      hasAttemptedAutoReconnect = true;

      const bluetooth = (navigator as any).bluetooth;
      if (bluetooth && bluetooth.getDevices) {
        try {
          const devices = await bluetooth.getDevices();
          if (devices && devices.length > 0) {
            const lastId = localStorage.getItem('lastConnectedPrinterId');
            const dev = devices.find((d: any) => d.id === lastId) || devices[0];
            
            // Allow time for previous connection to drop on refresh
            await new Promise(r => setTimeout(r, 1500));
            
            dev.addEventListener('gattserverdisconnected', () => {
              setIsConnected(false);
              setCharacteristic(null);
            });

            setDevice(dev);
            
            let connected = false;
            // Limited to 4 retries to avoid locking the GATT server if the user tries manual connection
            for (let i = 0; i < 4; i++) {
              try {
                const server = await dev.gatt.connect();
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
                  } catch (e) {}
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
                    console.log(`Bluetooth Auto-reconnected on attempt ${i + 1}!`);
                    connected = true;
                    break;
                  }
                }
              } catch (err) {
                console.warn(`Auto-reconnect GATT attempt ${i + 1} failed`, err);
                if (i < 3) await new Promise(r => setTimeout(r, 2000));
              }
            }
          }
        } catch (err) {
          console.warn('getDevices() failed', err);
        }
      }
    };

    autoConnect();
  }, [setDevice, setCharacteristic, setIsConnected]);

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
      
      try {
        if (dev.id) localStorage.setItem('lastConnectedPrinterId', dev.id);
      } catch (e) {}

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
        try {
          // B-POS printers often drop connection if waiting for GATT ACKs. writeValueWithoutResponse is safer.
          if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
            await characteristic.writeValueWithoutResponse(chunk);
          } else {
            await characteristic.writeValue(chunk);
          }
        } catch (e) {
          // Fallback
          await characteristic.writeValue(chunk);
        }
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

  // Removed HEARTBEAT: B-POS and similar printers often crash or forcefully disconnect if sent 0x00 bytes while idle.

  return { connect, disconnect, print, isConnected, device, error, ensureConnected };
};
