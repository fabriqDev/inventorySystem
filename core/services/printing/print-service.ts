/**
 * Print service for Bluetooth thermal printers (e.g. DC3M).
 * Native (Android/iOS) only; no-ops on web so web team cannot trigger printing.
 *
 * On Android, we must request Bluetooth permissions in JS before any BLE scan.
 * Requesting from native (when the library scans) can crash the app when the
 * permission dialog appears. So we request first, then call getDeviceList.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, PermissionsAndroid } from 'react-native';

const STORAGE_KEY = '@fabriq_selected_printer';

export const isPrintSupported =
  Platform.OS === 'android' || Platform.OS === 'ios';

export interface PrinterDevice {
  device_name: string;
  inner_mac_address: string;
}

async function getBLEPrinter(): Promise<typeof import('react-native-thermal-receipt-printer').BLEPrinter | null> {
  if (!isPrintSupported) return null;
  try {
    const { BLEPrinter } = require('react-native-thermal-receipt-printer');
    return BLEPrinter;
  } catch {
    return null;
  }
}

/** Load saved printer from AsyncStorage */
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

/** Save selected printer as default */
export async function setSavedPrinter(device: PrinterDevice | null): Promise<void> {
  if (device) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(device));
  } else {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

/** Initialize printer module (call before getDeviceList). */
export async function init(): Promise<void> {
  const BLE = await getBLEPrinter();
  if (BLE) await BLE.init();
}

/**
 * Request Bluetooth permissions on Android before BLE scan.
 * Must be called before getDeviceList to avoid crash when permission dialog appears.
 */
async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : 0;
    const BLUETOOTH_SCAN = PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN ?? 'android.permission.BLUETOOTH_SCAN';
    const BLUETOOTH_CONNECT = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT ?? 'android.permission.BLUETOOTH_CONNECT';
    const perms: string[] =
      apiLevel >= 31
        ? [BLUETOOTH_SCAN, BLUETOOTH_CONNECT]
        : [
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH,
            BLUETOOTH_CONNECT,
          ];
    const result = await PermissionsAndroid.requestMultiple(perms);
    const granted = Object.values(result).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
    return granted;
  } catch {
    return false;
  }
}

/** Scan for BLE printers. Returns list of devices. */
export async function getDeviceList(): Promise<PrinterDevice[]> {
  const BLE = await getBLEPrinter();
  if (!BLE) return [];
  try {
    const hasPermission = await requestBluetoothPermissions();
    if (!hasPermission) return [];
    await init();
    const list = await BLE.getDeviceList();
    return (list || []).map((d: { device_name?: string; inner_mac_address?: string }) => ({
      device_name: d.device_name ?? 'Unknown',
      inner_mac_address: d.inner_mac_address ?? '',
    }));
  } catch {
    return [];
  }
}

/** Connect to a printer by its inner_mac_address. */
export async function connect(device: PrinterDevice): Promise<void> {
  const BLE = await getBLEPrinter();
  if (!BLE) throw new Error('Printing is not supported on this device');
  await BLE.connectPrinter(device.inner_mac_address);
}

/** Disconnect current printer. */
export async function disconnect(): Promise<void> {
  const BLE = await getBLEPrinter();
  if (BLE) {
    try {
      await BLE.disconnectPrinter?.();
    } catch {
      // ignore
    }
  }
}

/**
 * Print receipt text (ESC/POS-style string with tags like <C>, <B>).
 * Caller should connect first or ensure a printer is already connected.
 */
export async function printReceipt(receiptText: string): Promise<void> {
  const BLE = await getBLEPrinter();
  if (!BLE) throw new Error('Printing is not supported on this device');
  await BLE.printBill(receiptText);
}

/**
 * Connect to saved printer if any, then print. Use after getSavedPrinter().
 * If no saved printer, throws. For "print with default" flow.
 */
export async function connectAndPrint(
  receiptText: string,
  savedDevice: PrinterDevice
): Promise<void> {
  await init();
  await connect(savedDevice);
  await printReceipt(receiptText);
}
