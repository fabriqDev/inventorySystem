export {
  buildReceiptText,
  checkoutResultToReceiptData,
  getMockReceiptData,
  orderItemsToReceiptLineItems,
  orderToReceiptData,
  type CheckoutCartItem,
  type ReceiptData,
  type ReceiptLineItem,
} from './receipt-builder';

export {
  connect,
  connectAndPrint,
  disconnect,
  getDeviceList,
  getSavedPrinter,
  init,
  isBluetoothEnabled,
  isPrintSupported,
  printReceipt,
  setSavedPrinter,
  type PrinterDevice,
} from './print-service';
