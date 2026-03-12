import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/core/components/themed-text';
import { ThemedView } from '@/core/components/themed-view';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { ProductSearchList } from '@/core/components/product-search-list';
import { Colors } from '@/core/constants/theme';
import { useCart } from '@/core/context/cart-context';
import { useProductCache } from '@/core/context/product-cache-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { isMobileOrTabletWeb } from '@/core/services/device';
import type { Product } from '@/core/types/product';
import type { CartTransactionType } from '@/core/types/cart';

const CAMERA_HEIGHT_RATIO = 0.5;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 'sale' = add item, 'refund' = refund item; same as cart transaction type. */
  mode: CartTransactionType;
  companyId: string;
  onItemAdded: () => void;
}

export function AddReturnItemModal({ visible, onClose, mode, companyId, onItemAdded }: Props) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();
  const { addItem } = useCart();
  const { findByBarcode } = useProductCache();

  const [searchVisible, setSearchVisible] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const lastScannedRef = useRef<string | null>(null);
  const scanCooldownRef = useRef(false);

  const [permission, requestPermission] = useCameraPermissions();

  const showCameraOnWeb = Platform.OS === 'web' && isMobileOrTabletWeb();
  const isWebDesktop = Platform.OS === 'web' && !isMobileOrTabletWeb();

  useEffect(() => {
    if (visible && (Platform.OS !== 'web' || showCameraOnWeb) && !permission?.granted) {
      requestPermission();
    }
  }, [visible, showCameraOnWeb, permission?.granted, requestPermission]);

  const cameraAvailable = (Platform.OS !== 'web' || showCameraOnWeb) && permission?.granted;

  const title = mode === 'refund' ? 'Refund item' : 'Add item';

  const handleProductAdded = useCallback(
    (product: Product) => {
      addItem(product, { transactionType: mode });
      setSearchVisible(false);
      onItemAdded();
      onClose();
    },
    [addItem, mode, onItemAdded, onClose],
  );

  const handleBarcodeScanned = useCallback(
    (barcode: string) => {
      if (scanCooldownRef.current) return;
      if (lastScannedRef.current === barcode) return;
      lastScannedRef.current = barcode;
      scanCooldownRef.current = true;
      setTimeout(() => {
        scanCooldownRef.current = false;
        lastScannedRef.current = null;
      }, 2000);

      setScanError(null);
      const fromCache = findByBarcode(companyId, barcode);
      if (fromCache) {
        addItem(fromCache, { transactionType: mode });
        onItemAdded();
        onClose();
        return;
      }
      setScanError('Product not found');
    },
    [companyId, findByBarcode, addItem, mode, onItemAdded, onClose],
  );

  const handleBarcodeScanResult = useCallback(
    (result: { data?: string }) => {
      const data = result?.data?.trim();
      if (data) handleBarcodeScanned(data);
    },
    [handleBarcodeScanned],
  );

  const handleManualLookup = useCallback(() => {
    const b = barcodeInput.trim();
    if (!b) return;
    handleBarcodeScanned(b);
    setBarcodeInput('');
  }, [barcodeInput, handleBarcodeScanned]);

  useEffect(() => {
    if (!visible) {
      setScanError(null);
      setBarcodeInput('');
      setSearchVisible(false);
    } else if (isWebDesktop) {
      setSearchVisible(true);
    }
  }, [visible, isWebDesktop]);

  if (!visible) return null;

  return (
    <>
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <ThemedView style={[styles.modalContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[styles.header, { borderBottomColor: colors.icon + '20' }]}>
            <Pressable onPress={onClose} hitSlop={12}>
              <IconSymbol name="xmark" size={22} color={colors.text} />
            </Pressable>
            <ThemedText type="subtitle">{title}</ThemedText>
            <Pressable onPress={() => setSearchVisible(true)} hitSlop={12} style={isWebDesktop ? styles.searchBtnHeader : undefined}>
              <IconSymbol name="magnifyingglass" size={isWebDesktop ? 20 : 22} color={colors.text} />
              {isWebDesktop && <ThemedText style={[styles.searchBtnText, { color: colors.text }]}>Search</ThemedText>}
            </Pressable>
          </View>

          {isWebDesktop && (
            <View style={styles.webDesktopContent}>
              <ThemedText style={[styles.webDesktopHint, { color: colors.icon }]}>
                Use the Search button above to find and add products.
              </ThemedText>
            </View>
          )}

          {!isWebDesktop && (
            <>
            <View style={styles.upperHalf}>
              <ThemedText style={[styles.hint, { color: colors.icon }]}>
                Scan barcode below or tap search to pick a product.
              </ThemedText>
            </View>

          {scanError ? (
            <Pressable
              style={[styles.errorOverlay, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
              onPress={() => setScanError(null)}
            >
              <Pressable
                style={[styles.errorPopup, { backgroundColor: colors.background, borderColor: colors.icon }]}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.errorIconWrap}>
                  <MaterialIcons name="error-outline" size={40} color="#C62828" />
                </View>
                <ThemedText type="subtitle" style={styles.errorPopupTitle}>
                  {scanError}
                </ThemedText>
                <ThemedText style={[styles.errorPopupHint, { color: colors.icon }]}>
                  Try another barcode or search by name.
                </ThemedText>
                <Pressable
                  onPress={() => setScanError(null)}
                  style={[styles.errorPopupBtn, { backgroundColor: colors.tint }]}
                >
                  <ThemedText style={styles.errorPopupBtnText}>OK</ThemedText>
                </Pressable>
              </Pressable>
            </Pressable>
          ) : null}

          <View style={[styles.cameraSection, { height: Dimensions.get('window').height * CAMERA_HEIGHT_RATIO }]}>
            {cameraAvailable ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'code128', 'code39'],
                }}
                onBarcodeScanned={handleBarcodeScanResult}
              />
            ) : (
              <View style={[styles.fallback, { backgroundColor: colors.background }]}>
                <ThemedText style={[styles.fallbackLabel, { color: colors.icon }]}>
                  Enter barcode
                </ThemedText>
                <TextInput
                  style={[styles.barcodeInput, { color: colors.text, borderColor: colors.icon + '40' }]}
                  placeholder="Type barcode…"
                  placeholderTextColor={colors.icon}
                  value={barcodeInput}
                  onChangeText={(t) => { setBarcodeInput(t); setScanError(null); }}
                  returnKeyType="search"
                  onSubmitEditing={handleManualLookup}
                />
                <Pressable
                  onPress={handleManualLookup}
                  style={[styles.lookupBtn, { backgroundColor: colors.tint }]}
                >
                  <ThemedText style={styles.lookupBtnText}>Look up</ThemedText>
                </Pressable>
                {!permission?.granted && (Platform.OS !== 'web' || showCameraOnWeb) && (
                  <Pressable onPress={requestPermission} style={[styles.permBtn, { borderColor: colors.tint }]}>
                    <ThemedText style={{ color: colors.tint }}>Grant camera access</ThemedText>
                  </Pressable>
                )}
              </View>
            )}
          </View>
          </>
          )}
        </ThemedView>
      </Modal>

      <Modal visible={searchVisible} animationType="slide" onRequestClose={() => setSearchVisible(false)}>
        <ThemedView style={[styles.modalFull, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[styles.searchHeader, { borderBottomColor: colors.icon + '20' }]}>
            <ThemedText type="subtitle">Select product</ThemedText>
            <Pressable onPress={() => setSearchVisible(false)} hitSlop={12}>
              <IconSymbol name="xmark" size={22} color={colors.text} />
            </Pressable>
          </View>
          <ProductSearchList companyId={companyId} onSelectProduct={handleProductAdded} />
        </ThemedView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  upperHalf: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  hint: { fontSize: 14 },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  errorPopup: {
    marginHorizontal: 24,
    paddingVertical: 24,
    paddingHorizontal: 28,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 280,
    maxWidth: 360,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFEBEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorPopupTitle: {
    textAlign: 'center',
    color: '#C62828',
    fontSize: 18,
  },
  errorPopupHint: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
  errorPopupBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    marginTop: 4,
  },
  errorPopupBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  cameraSection: { width: '100%', overflow: 'hidden' },
  fallback: {
    flex: 1,
    padding: 24,
    gap: 12,
    justifyContent: 'center',
  },
  fallbackLabel: { fontSize: 14 },
  barcodeInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  lookupBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  lookupBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  permBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 10,
  },
  webDesktopContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  webDesktopHint: {
    fontSize: 15,
    textAlign: 'center',
  },
  searchBtnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalFull: { flex: 1 },
  searchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
});
