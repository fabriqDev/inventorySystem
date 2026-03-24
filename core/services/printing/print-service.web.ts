/**
 * Web stub for print service. No Bluetooth/thermal printer on web;
 * avoids bundling react-native-thermal-receipt-printer (native-only) in web build.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@fabriq_selected_printer';

export const isPrintSupported = false;

export interface PrinterDevice {
  device_name: string;
  inner_mac_address: string;
}

export async function getSavedPrinter(): Promise<PrinterDevice | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PrinterDevice;
    if (parsed?.inner_mac_address) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function setSavedPrinter(device: PrinterDevice | null): Promise<void> {
  if (device) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(device));
  } else {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

export async function init(): Promise<void> {
  // no-op on web
}

export async function getDeviceList(): Promise<PrinterDevice[]> {
  return [];
}

export async function connect(_device: PrinterDevice): Promise<void> {
  throw new Error('Printing is not supported on this device');
}

export async function disconnect(): Promise<void> {
  // no-op
}

export async function printReceipt(_receiptText: string): Promise<void> {
  throw new Error('Printing is not supported on this device');
}

export async function connectAndPrint(
  _receiptText: string,
  _savedDevice: PrinterDevice
): Promise<void> {
  throw new Error('Printing is not supported on this device');
}

/** Web: thermal printing unsupported; callers should gate with `isPrintSupported`. */
export async function isBluetoothEnabled(): Promise<boolean> {
  return false;
}
