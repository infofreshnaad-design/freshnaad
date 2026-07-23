import { useState, useEffect, useCallback, useRef } from 'react';

export const useWiredPrinter = () => {
  const [isWiredConnected, setIsWiredConnected] = useState(false);
  const [wiredDeviceName, setWiredDeviceName] = useState<string | null>(null);
  const [connectionType, setConnectionType] = useState<'usb' | 'serial' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usbDeviceRef = useRef<any>(null);
  const serialPortRef = useRef<any>(null);
  const serialWriterRef = useRef<any>(null);

  // Auto reconnect if previously paired in browser permissions
  useEffect(() => {
    const autoConnectUSB = async () => {
      try {
        const nav = navigator as any;
        if (nav.usb && nav.usb.getDevices) {
          const devices = await nav.usb.getDevices();
          if (devices.length > 0) {
            const dev = devices[0];
            await dev.open();
            if (dev.configuration === null) {
              await dev.selectConfiguration(1);
            }
            await dev.claimInterface(0);
            usbDeviceRef.current = dev;
            setWiredDeviceName(dev.productName || 'USB Thermal Printer');
            setConnectionType('usb');
            setIsWiredConnected(true);
          }
        }
      } catch (err) {
        // Silent catch on autoconnect
      }
    };

    autoConnectUSB();
  }, []);

  const connectWiredPrinter = useCallback(async () => {
    setError(null);
    const nav = navigator as any;

    // 1. Try WebUSB first
    if (nav.usb) {
      try {
        const dev = await nav.usb.requestDevice({ filters: [] });
        await dev.open();
        if (dev.configuration === null) {
          await dev.selectConfiguration(1);
        }
        await dev.claimInterface(0);

        usbDeviceRef.current = dev;
        setWiredDeviceName(dev.productName || 'USB Thermal Printer');
        setConnectionType('usb');
        setIsWiredConnected(true);
        return true;
      } catch (err: any) {
        console.warn('WebUSB connect cancelled or failed:', err);
      }
    }

    // 2. Fallback to WebSerial (Common for USB-to-Serial POS Printers like CH340 / PL2303)
    if (nav.serial) {
      try {
        const port = await nav.serial.requestPort();
        await port.open({ baudRate: 9600 });

        serialPortRef.current = port;
        serialWriterRef.current = port.writable.getWriter();
        setWiredDeviceName('USB Serial Printer (COM)');
        setConnectionType('serial');
        setIsWiredConnected(true);
        return true;
      } catch (err: any) {
        console.warn('WebSerial connect cancelled or failed:', err);
        setError(err.message);
      }
    }

    if (!nav.usb && !nav.serial) {
      setError('WebUSB / WebSerial is not supported by your browser. Please use Google Chrome or Microsoft Edge.');
    }

    return false;
  }, []);

  const disconnectWiredPrinter = useCallback(async () => {
    try {
      if (usbDeviceRef.current) {
        await usbDeviceRef.current.close();
        usbDeviceRef.current = null;
      }
      if (serialWriterRef.current) {
        await serialWriterRef.current.releaseLock();
        serialWriterRef.current = null;
      }
      if (serialPortRef.current) {
        await serialPortRef.current.close();
        serialPortRef.current = null;
      }
    } catch (e) {
      console.warn('Disconnect error:', e);
    } finally {
      setIsWiredConnected(false);
      setWiredDeviceName(null);
      setConnectionType(null);
    }
  }, []);

  const printWired = useCallback(async (data: Uint8Array): Promise<boolean> => {
    try {
      if (connectionType === 'usb' && usbDeviceRef.current) {
        const dev = usbDeviceRef.current;
        // Find OUT endpoint for printing
        const iface = dev.configuration?.interfaces[0];
        const endpoint = iface?.alternates[0]?.endpoints?.find((e: any) => e.direction === 'out');
        const endpointNumber = endpoint ? endpoint.endpointNumber : 1;

        await dev.transferOut(endpointNumber, data);
        return true;
      }

      if (connectionType === 'serial' && serialWriterRef.current) {
        await serialWriterRef.current.write(data);
        return true;
      }

      return false;
    } catch (err: any) {
      console.error('Wired Direct Print Error:', err);
      setError(err.message);
      setIsWiredConnected(false);
      return false;
    }
  }, [connectionType]);

  return {
    connectWiredPrinter,
    disconnectWiredPrinter,
    printWired,
    isWiredConnected,
    wiredDeviceName,
    connectionType,
    error
  };
};
