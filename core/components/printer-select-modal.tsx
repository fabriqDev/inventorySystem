import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/core/components/themed-text';
import { Colors } from '@/core/constants/theme';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import {
  connect,
  getDeviceList,
  isPrintSupported,
  printReceipt,
  setSavedPrinter,
  type PrinterDevice,
} from '@/core/services/printing';
import { toast } from '@/core/services/toast';

export interface PrinterSelectModalProps {
  visible: boolean;
  onClose: () => void;
  /** If provided, after user selects a printer we connect, save, print this text, then close */
  pendingReceiptText?: string | null;
  /** Called after printer is selected and (if pendingReceiptText) print is sent */
  onDone?: (device: PrinterDevice) => void;
}

/**
 * Popover-style modal to scan and select a Bluetooth printer (native only).
 * Uses a centered card instead of bottom sheet to avoid native layout crashes on first open.
 */
export function PrinterSelectModal({
  visible,
  onClose,
  pendingReceiptText,
  onDone,
}: PrinterSelectModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const scan = useCallback(async () => {
    if (!isPrintSupported) return;
    setLoading(true);
    setDevices([]);
    try {
      const list = await getDeviceList();
      if (mountedRef.current && Array.isArray(list)) {
        setDevices(list);
      }
    } catch (e) {
      if (mountedRef.current) {
        toast.show({
          type: 'error',
          message: 'Could not scan for printers. Check Bluetooth permissions.',
        });
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible || !isPrintSupported) return;
    setDevices([]);
    setLoading(true);
    const t = setTimeout(() => {
      scan();
    }, 200);
    return () => clearTimeout(t);
  }, [visible, scan]);

  const handleSelect = useCallback(
    async (device: PrinterDevice) => {
      if (!isPrintSupported) return;
      setConnectingId(device.inner_mac_address);
      try {
        await connect(device);
        await setSavedPrinter(device);
        if (pendingReceiptText) {
          await printReceipt(pendingReceiptText);
          toast.show({ type: 'success', message: 'Receipt sent to printer.' });
        } else {
          toast.show({ type: 'success', message: 'Printer set as default.' });
        }
        onDone?.(device);
        onClose();
      } catch (e) {
        toast.show({
          type: 'error',
          message: 'Could not connect or print. Try again.',
        });
      } finally {
        setConnectingId(null);
      }
    },
    [pendingReceiptText, onDone, onClose]
  );

  if (!isPrintSupported) return null;

  const safeDevices = Array.isArray(devices) ? devices : [];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.popover, { backgroundColor: colors.background }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ThemedText type="subtitle" style={styles.title}>
            Select printer
          </ThemedText>
          <ThemedText style={[styles.hint, { color: colors.icon }]}>
            Turn on your receipt printer and ensure Bluetooth is enabled.
          </ThemedText>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.tint} />
              <ThemedText style={[styles.scanningLabel, { color: colors.icon }]}>
                Scanning for printers…
              </ThemedText>
            </View>
          ) : safeDevices.length === 0 ? (
            <View style={styles.emptyState}>
              <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                No printers found
              </ThemedText>
              <ThemedText style={[styles.emptyHint, { color: colors.icon }]}>
                Turn on your receipt printer (e.g. DC3M), put it in pairing mode, and ensure
                Bluetooth is enabled on this device.
              </ThemedText>
              <Pressable
                onPress={scan}
                style={[styles.scanAgainBtn, { backgroundColor: colors.tint }]}
              >
                <ThemedText style={styles.scanAgainBtnText}>Scan again</ThemedText>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              <ThemedText style={[styles.listHint, { color: colors.icon }]}>
                Tap a printer to connect and use as default.
              </ThemedText>
              {safeDevices.map((d) => {
                const mac = d?.inner_mac_address ?? '';
                const isConnecting = connectingId === mac;
                return (
                  <Pressable
                    key={mac || String(Math.random())}
                    onPress={() => handleSelect(d)}
                    disabled={isConnecting}
                    style={[
                      styles.deviceRow,
                      { backgroundColor: colors.icon + '10', borderColor: colors.icon + '25' },
                    ]}
                  >
                    <ThemedText style={styles.deviceName} numberOfLines={1}>
                      {d?.device_name || 'Unnamed'}
                    </ThemedText>
                    {isConnecting ? (
                      <ActivityIndicator size="small" color={colors.tint} />
                    ) : null}
                  </Pressable>
                );
              })}
              <Pressable
                onPress={scan}
                style={[styles.scanAgainBtnOutlined, { borderColor: colors.icon + '40' }]}
              >
                <ThemedText style={{ color: colors.tint }}>Scan again</ThemedText>
              </Pressable>
            </ScrollView>
          )}

          <Pressable
            onPress={onClose}
            style={[styles.cancelBtn, { borderColor: colors.icon + '40' }]}
          >
            <ThemedText style={{ color: colors.text }}>Cancel</ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 24,
  },
  popover: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  title: {
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    marginBottom: 16,
  },
  centered: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 12,
  },
  scanningLabel: {
    fontSize: 14,
  },
  emptyState: {
    paddingVertical: 24,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  scanAgainBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 8,
  },
  scanAgainBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  scanAgainBtnOutlined: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  listHint: {
    fontSize: 13,
    marginBottom: 8,
  },
  listScroll: {
    maxHeight: 320,
    marginBottom: 16,
  },
  listContent: {
    paddingBottom: 8,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  deviceName: {
    fontSize: 15,
  },
  cancelBtn: {
    padding: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
});
