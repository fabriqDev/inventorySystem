import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrinterSelectModal } from '@/core/components/printer-select-modal';
import { ThemedText } from '@/core/components/themed-text';
import { ThemedView } from '@/core/components/themed-view';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { CURRENCY_DEFAULT } from '@/core/constants/currency';
import { Colors } from '@/core/constants/theme';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { formatAmount, formatPrice } from '@/core/services/format';
import {
  buildReceiptText,
  connectAndPrint,
  disconnect,
  getSavedPrinter,
  isBluetoothEnabled,
  isPrintSupported,
  setSavedPrinter as persistSavedPrinter,
  type PrinterDevice,
  type ReceiptData,
  type ReceiptLineItem,
} from '@/core/services/printing';
import { toast } from '@/core/services/toast';
import { Strings } from '@/core/strings';
import { getPaymentDisplayLabel, PaymentProvider, PaymentType } from '@/core/types/order';
import type { PaymentProviderEnum, PaymentTypeEnum } from '@/core/types/order';

const SELLER_NAME = Strings.company.sellerName;

/** Matches checkout request badge color for consistency. */
const RECEIPT_REQUEST_PURPLE = '#7B2FBE';

function parseItemsJson(itemsJson: string | undefined): ReceiptLineItem[] {
  if (!itemsJson) return [];
  try {
    const decoded = decodeURIComponent(itemsJson);
    const parsed = JSON.parse(decoded) as ReceiptLineItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function paymentMethodLabel(payment_type: PaymentTypeEnum, payment_provider: PaymentProviderEnum): string {
  return getPaymentDisplayLabel({ payment_type, payment_provider });
}

export default function ReceiptPreviewScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    orderId: string;
    total: string;
    payment_type?: PaymentTypeEnum;
    payment_provider?: string;
    itemsJson?: string;
    currency?: string;
    /** ISO timestamp for reprints from order history (checkout omits → “now”). */
    createdAt?: string;
    /** Where Done returns: company home (tiles) after checkout, or sales list from order details. */
    afterDone?: 'tiles' | 'orders';
  }>();

  const orderId = params.orderId ?? '';
  const total = Number(params.total) || 0;
  const payment_type = params.payment_type ?? PaymentType.CASH;
  const payment_provider = (params.payment_provider as PaymentProviderEnum) ?? PaymentProvider.NONE;
  const paymentMethod = getPaymentDisplayLabel({ payment_type, payment_provider });
  const currency = params.currency ?? CURRENCY_DEFAULT;
  const items = parseItemsJson(params.itemsJson);

  const [savedPrinter, setSavedPrinterState] = useState<PrinterDevice | null>(null);
  const [showPrinterSelect, setShowPrinterSelect] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [bluetoothOff, setBluetoothOff] = useState(false);
  /** When true, the modal was opened from a failed print — pass receiptText so it prints on select */
  const [modalShouldPrint, setModalShouldPrint] = useState(false);

  const refreshPrinterFromStorage = useCallback(async () => {
    const saved = await getSavedPrinter();
    setSavedPrinterState(saved);
  }, []);

  const validateBluetoothAndPrinter = useCallback(async () => {
    if (!isPrintSupported) return;
    const on = await isBluetoothEnabled();
    if (!on) {
      try {
        await persistSavedPrinter(null);
      } catch {
        /* ignore */
      }
      setSavedPrinterState(null);
      setBluetoothOff(true);
      return;
    }
    setBluetoothOff(false);
    await refreshPrinterFromStorage();
  }, [refreshPrinterFromStorage]);

  useFocusEffect(
    useCallback(() => {
      void validateBluetoothAndPrinter();
    }, [validateBluetoothAndPrinter]),
  );

  const openPrinterSelectModal = useCallback(() => {
    if (bluetoothOff) {
      toast.show({ type: 'info', message: Strings.company.receiptBluetoothOff });
      return;
    }
    setModalShouldPrint(false);
    setShowPrinterSelect(true);
  }, [bluetoothOff]);

  // Receipt always uses server order id (passed from checkout after successful order).
  const serverOrderId = orderId;
  const receiptData: ReceiptData = {
    orderId: serverOrderId,
    createdAt: params.createdAt?.trim() ? params.createdAt : new Date().toISOString(),
    items,
    subtotal: total,
    total,
    paymentMethod,
    currency,
  };

  const receiptText = buildReceiptText(receiptData);
  const canPrint = isPrintSupported && !bluetoothOff && savedPrinter != null;

  const printFooterLabel = useMemo(() => {
    if (!isPrintSupported) return '';
    if (bluetoothOff) return Strings.company.receiptBluetoothOff;
    if (!savedPrinter) return Strings.company.receiptChoosePrinter;
    return Strings.common.print;
  }, [bluetoothOff, savedPrinter]);

  const handlePrint = useCallback(async () => {
    if (!canPrint || !savedPrinter) return;
    setPrinting(true);
    try {
      await connectAndPrint(receiptText, savedPrinter);
      toast.show({ type: 'success', message: Strings.company.receiptSentToPrinter });
    } catch {
      toast.show({ type: 'error', message: Strings.company.printFailed });
      try {
        await disconnect();
      } catch {
        /* ignore */
      }
      try {
        await persistSavedPrinter(null);
      } catch {
        /* ignore */
      }
      setSavedPrinterState(null);
      setModalShouldPrint(true);
      setShowPrinterSelect(true);
    } finally {
      setPrinting(false);
    }
  }, [canPrint, savedPrinter, receiptText]);

  const companyId = params.id ?? '';

  const handleDone = useCallback(() => {
    if (!companyId) {
      router.back();
      return;
    }
    const target = params.afterDone === 'orders' ? `/company/${companyId}/orders` : `/company/${companyId}`;
    router.dismissTo(target as any);
  }, [companyId, params.afterDone, router]);

  const handlePrinterConnected = useCallback(() => {
    // Printer connected successfully — BT is clearly on
    setBluetoothOff(false);
    setModalShouldPrint(false);
    void refreshPrinterFromStorage();
    setShowPrinterSelect(false);
  }, [refreshPrinterFromStorage]);

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <Stack.Screen
        options={{
          title: Strings.company.receipt,
          headerRight: isPrintSupported
            ? () => (
                <Pressable onPress={openPrinterSelectModal} style={styles.headerBtn} hitSlop={8}>
                  <IconSymbol name="printer.fill" size={20} color={colors.tint} />
                  <ThemedText style={[styles.headerBtnLabel, { color: colors.tint }]} numberOfLines={1}>
                    {Strings.common.selectPrinter}
                  </ThemedText>
                </Pressable>
              )
            : undefined,
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isPrintSupported && bluetoothOff ? (
          <View style={[styles.btBanner, { backgroundColor: '#FFF3E0', borderColor: '#E65100' + '55' }]}>
            <ThemedText style={[styles.btBannerText, { color: '#E65100' }]}>
              {Strings.company.receiptBluetoothOff}
            </ThemedText>
          </View>
        ) : null}
        <View style={[styles.receiptCard, { backgroundColor: colors.background, borderColor: colors.icon + '25' }]}>
          <ThemedText type="subtitle" style={styles.sellerName}>
            {SELLER_NAME}
          </ThemedText>
          <ThemedText style={[styles.orderId, { color: colors.icon }]}>
            Order #{serverOrderId}
          </ThemedText>
          <View style={[styles.divider, { backgroundColor: colors.icon + '20' }]} />

          {items.map((item, index) => {
            const isRequestLine = item.transaction_type === 'request';
            const isRefundLine =
              item.transaction_type === 'refund' || (!isRequestLine && item.total < 0);
            return (
              <View key={index} style={styles.itemRow}>
                <View style={styles.itemNameRow}>
                  <ThemedText style={styles.itemName} numberOfLines={2}>
                    {item.product_name}
                  </ThemedText>
                </View>
                {item.size?.trim() ? (
                  <ThemedText style={[styles.itemSize, { color: colors.icon }]}>
                    Size: {item.size.trim()}
                  </ThemedText>
                ) : null}
                {item.article_code?.trim() ? (
                  <ThemedText style={[styles.itemCode, { color: colors.icon }]}>
                    Code: {item.article_code.trim()}
                  </ThemedText>
                ) : null}
                {(isRefundLine || isRequestLine) && (
                  <View style={styles.receiptBadgeRow}>
                    {isRefundLine && (
                      <View style={styles.refundLineBadge}>
                        <ThemedText style={styles.refundLineBadgeText}>{Strings.company.refund}</ThemedText>
                      </View>
                    )}
                    {isRequestLine && (
                      <View style={styles.requestLineBadge}>
                        <ThemedText style={[styles.requestLineBadgeText, { color: RECEIPT_REQUEST_PURPLE }]}>
                          {Strings.company.requestBadge}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                )}
                <View style={styles.itemMeta}>
                  <ThemedText style={{ color: colors.icon, fontSize: 13 }}>
                    {item.quantity} × {formatAmount(item.unit_price)}
                  </ThemedText>
                  <ThemedText style={[styles.itemTotal, isRefundLine && { color: '#C62828' }]}>
                    {isRefundLine ? '-' : ''}{formatAmount(Math.abs(item.total))}
                  </ThemedText>
                </View>
              </View>
            );
          })}

          <View style={[styles.divider, { backgroundColor: colors.icon + '20' }]} />
          <View style={styles.totalRow}>
            <ThemedText type="subtitle">{Strings.company.total}</ThemedText>
            <ThemedText type="subtitle">{formatPrice(total, currency)}</ThemedText>
          </View>
          <ThemedText style={[styles.paymentRow, { color: colors.icon }]}>
            {Strings.company.payment}: {paymentMethodLabel(payment_type, payment_provider)}
          </ThemedText>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.icon + '20' }]}>
        {isPrintSupported && savedPrinter && !bluetoothOff ? (
          <ThemedText style={[styles.printerReadyCaption, { color: colors.icon }]}>
            {Strings.company.receiptPrinterReady}
          </ThemedText>
        ) : null}
        {isPrintSupported && (
          <Pressable
            onPress={handlePrint}
            disabled={!canPrint || printing}
            style={[
              styles.printBtn,
              { backgroundColor: canPrint ? colors.tint : colors.icon + '30' },
            ]}
          >
            <IconSymbol
              name="printer.fill"
              size={20}
              color={canPrint ? '#fff' : colors.icon}
            />
            <ThemedText
              style={[
                styles.printBtnText,
                { color: canPrint ? '#fff' : colors.icon },
              ]}
              numberOfLines={2}
            >
              {printFooterLabel}
            </ThemedText>
          </Pressable>
        )}
        <Pressable
          onPress={handleDone}
          style={[styles.doneBtn, { borderColor: colors.icon + '40' }]}
        >
          <ThemedText style={{ color: colors.text }}>{Strings.common.done}</ThemedText>
        </Pressable>
      </View>

      <PrinterSelectModal
        visible={showPrinterSelect}
        onClose={() => { setShowPrinterSelect(false); setModalShouldPrint(false); }}
        pendingReceiptText={modalShouldPrint ? receiptText : null}
        onDone={handlePrinterConnected}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
    flexShrink: 1,
  },
  headerBtnLabel: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  btBanner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  btBannerText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  printerReadyCaption: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 24,
  },
  receiptCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
  },
  sellerName: {
    textAlign: 'center',
    marginBottom: 4,
  },
  orderId: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  itemRow: {
    marginBottom: 12,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '500',
    flexShrink: 1,
  },
  receiptBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  refundLineBadge: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  refundLineBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C62828',
  },
  requestLineBadge: {
    backgroundColor: '#EDE7F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  requestLineBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  itemSize: {
    fontSize: 12,
    marginTop: 2,
  },
  itemCode: {
    fontSize: 12,
    marginTop: 2,
  },
  itemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingLeft: 8,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  paymentRow: {
    fontSize: 13,
    marginTop: 8,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    gap: 10,
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  printBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  doneBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
});
