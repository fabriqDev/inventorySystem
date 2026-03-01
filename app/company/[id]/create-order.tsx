import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ProductSearchList } from '@/components/product-search-list';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useCart } from '@/contexts/cart-context';
import { useDataSource } from '@/contexts/data-source-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchProductByBarcode } from '@/lib/api/products';
import { formatPrice } from '@/lib/format';
import type { CartItem } from '@/types/cart';
import type { Product } from '@/types/product';

export default function CreateOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { useMockData } = useDataSource();

  const { items, addItem, removeItem, updateQuantity, total, currency, itemCount } = useCart();

  const [searchVisible, setSearchVisible] = useState(false);
  const [scanVisible, setScanVisible] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);

  const handleSelectProduct = useCallback(
    (product: Product) => {
      addItem(product);
      setSearchVisible(false);
    },
    [addItem],
  );

  const handleBarcodeLookup = useCallback(async () => {
    if (!barcodeInput.trim()) return;
    setScanError(null);
    try {
      const product = await fetchProductByBarcode(id, barcodeInput.trim(), useMockData);
      if (product) {
        addItem(product);
        setBarcodeInput('');
        setScanVisible(false);
      } else {
        setScanError('No product found for this barcode');
      }
    } catch {
      setScanError('Lookup failed. Please try again.');
    }
  }, [id, barcodeInput, useMockData, addItem]);

  const handleCheckout = useCallback(() => {
    router.push(`/company/${id}/checkout` as any);
  }, [id, router]);

  const renderCartItem = useCallback(
    ({ item }: { item: CartItem }) => (
      <View style={[styles.cartCard, { backgroundColor: colors.background, borderColor: colors.icon + '25' }]}>
        <View style={styles.cartBody}>
          <ThemedText type="defaultSemiBold" numberOfLines={1}>
            {item.product.name}
          </ThemedText>
          <ThemedText style={[styles.unitPrice, { color: colors.icon }]}>
            {formatPrice(item.unit_price, item.currency)} each
          </ThemedText>
        </View>
        <View style={styles.qtyRow}>
          <Pressable
            onPress={() => updateQuantity(item.product_id, item.quantity - 1)}
            style={[styles.qtyBtn, { backgroundColor: colors.icon + '15' }]}
          >
            <IconSymbol name="minus" size={16} color={colors.text} />
          </Pressable>
          <ThemedText style={styles.qtyText}>{item.quantity}</ThemedText>
          <Pressable
            onPress={() => updateQuantity(item.product_id, item.quantity + 1)}
            style={[styles.qtyBtn, { backgroundColor: colors.icon + '15' }]}
          >
            <IconSymbol name="plus" size={16} color={colors.text} />
          </Pressable>
        </View>
        <ThemedText type="defaultSemiBold" style={styles.subtotal}>
          {formatPrice(item.unit_price * item.quantity, item.currency)}
        </ThemedText>
        <Pressable onPress={() => removeItem(item.product_id)} hitSlop={8}>
          <IconSymbol name="trash" size={18} color="#C62828" />
        </Pressable>
      </View>
    ),
    [colors, updateQuantity, removeItem],
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Create Order' }} />

      {/* Action buttons */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => setScanVisible(true)}
          style={[styles.actionBtn, { backgroundColor: colors.tint }]}
        >
          <IconSymbol name="barcode.viewfinder" size={22} color="#fff" />
          <ThemedText style={styles.actionText}>Scan</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => setSearchVisible(true)}
          style={[styles.actionBtn, { backgroundColor: colors.tint }]}
        >
          <IconSymbol name="magnifyingglass" size={22} color="#fff" />
          <ThemedText style={styles.actionText}>Search</ThemedText>
        </Pressable>
      </View>

      {/* Cart list */}
      {items.length === 0 ? (
        <View style={styles.emptyCart}>
          <IconSymbol name="cart.fill" size={48} color={colors.icon + '50'} />
          <ThemedText style={[styles.emptyText, { color: colors.icon }]}>
            Cart is empty. Tap Scan or Search to add products.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.product_id}
          renderItem={renderCartItem}
          contentContainerStyle={styles.cartList}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bottom bar */}
      {items.length > 0 && (
        <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.icon + '20' }]}>
          <View>
            <ThemedText style={[styles.totalLabel, { color: colors.icon }]}>
              {itemCount} item{itemCount > 1 ? 's' : ''}
            </ThemedText>
            <ThemedText type="subtitle">{formatPrice(total, currency)}</ThemedText>
          </View>
          <Pressable
            onPress={handleCheckout}
            style={[styles.checkoutBtn, { backgroundColor: colors.tint }]}
          >
            <ThemedText style={styles.checkoutText}>Checkout</ThemedText>
            <IconSymbol name="chevron.right" size={18} color="#fff" />
          </Pressable>
        </View>
      )}

      {/* Search modal */}
      <Modal visible={searchVisible} animationType="slide" onRequestClose={() => setSearchVisible(false)}>
        <ThemedView style={styles.modalFull}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.icon + '20' }]}>
            <ThemedText type="subtitle">Select Product</ThemedText>
            <Pressable onPress={() => setSearchVisible(false)} hitSlop={12}>
              <IconSymbol name="xmark" size={22} color={colors.text} />
            </Pressable>
          </View>
          <ProductSearchList companyId={id} onSelectProduct={handleSelectProduct} />
        </ThemedView>
      </Modal>

      {/* Scan (barcode entry) modal */}
      <Modal
        visible={scanVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setScanVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setScanVisible(false)}>
          <Pressable
            style={[styles.scanCard, { backgroundColor: colors.background }]}
            onPress={() => {}}
          >
            <ThemedText type="subtitle">Enter Barcode</ThemedText>
            <TextInput
              style={[styles.barcodeInput, { color: colors.text, borderColor: colors.icon + '40' }]}
              placeholder="Scan or type barcode…"
              placeholderTextColor={colors.icon}
              value={barcodeInput}
              onChangeText={(t) => { setBarcodeInput(t); setScanError(null); }}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={handleBarcodeLookup}
            />
            {scanError && (
              <ThemedText style={styles.scanError}>{scanError}</ThemedText>
            )}
            <View style={styles.scanActions}>
              <Pressable
                onPress={() => { setScanVisible(false); setBarcodeInput(''); setScanError(null); }}
                style={[styles.scanBtn, { backgroundColor: colors.icon + '15' }]}
              >
                <ThemedText>Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleBarcodeLookup}
                style={[styles.scanBtn, { backgroundColor: colors.tint }]}
              >
                <ThemedText style={{ color: '#fff', fontWeight: '600' }}>Look Up</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  emptyCart: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyText: { textAlign: 'center', lineHeight: 22 },
  cartList: { paddingHorizontal: 16, paddingBottom: 120 },
  separator: { height: 10 },
  cartCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  cartBody: { flex: 1, gap: 2 },
  unitPrice: { fontSize: 12 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 15, fontWeight: '600', minWidth: 20, textAlign: 'center' },
  subtotal: { minWidth: 70, textAlign: 'right', fontSize: 14 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
  },
  totalLabel: { fontSize: 12, marginBottom: 2 },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  checkoutText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  modalFull: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scanCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    gap: 16,
  },
  barcodeInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  scanError: { color: '#C62828', fontSize: 13 },
  scanActions: { flexDirection: 'row', gap: 12 },
  scanBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
});
