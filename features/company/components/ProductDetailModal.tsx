import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/core/components/themed-text';
import { Colors } from '@/core/constants/theme';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { formatPrice } from '@/core/services/format';
import { Strings } from '@/core/strings';
import type { Product } from '@/core/types/product';

interface ProductDetailModalProps {
  product: Product | null;
  visible: boolean;
  onClose: () => void;
}

export function ProductDetailModal({ product, visible, onClose }: ProductDetailModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  if (!product) return null;

  const quantity = product.quantity ?? 0;
  const reserved = product.reserved ?? 0;
  const available = Math.max(0, quantity - reserved);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingTop: 20 + insets.top, paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText type="title" style={styles.name}>
          {product.name}
        </ThemedText>
        <View style={[styles.row, { borderBottomColor: colors.icon + '20' }]}>
          <ThemedText style={{ color: colors.icon }}>Code</ThemedText>
          <ThemedText>{product.scan_code}</ThemedText>
        </View>
        {product.size != null && product.size !== '' && (
          <View style={[styles.row, { borderBottomColor: colors.icon + '20' }]}>
            <ThemedText style={{ color: colors.icon }}>Size</ThemedText>
            <ThemedText>{product.size}</ThemedText>
          </View>
        )}
        <View style={[styles.row, { borderBottomColor: colors.icon + '20' }]}>
          <ThemedText style={{ color: colors.icon }}>Quantity (stock)</ThemedText>
          <ThemedText>{quantity}</ThemedText>
        </View>
        <View style={[styles.row, { borderBottomColor: colors.icon + '20' }]}>
          <ThemedText style={{ color: colors.icon }}>Reserved</ThemedText>
          <ThemedText>{reserved}</ThemedText>
        </View>
        <View style={[styles.row, { borderBottomColor: colors.icon + '20' }]}>
          <ThemedText style={{ color: colors.icon }}>{Strings.company.available}</ThemedText>
          <ThemedText type="defaultSemiBold">{available}</ThemedText>
        </View>
        <View style={[styles.row, { borderBottomColor: colors.icon + '20' }]}>
          <ThemedText style={{ color: colors.icon }}>Price</ThemedText>
          <ThemedText>{formatPrice(product.price, product.currency)}</ThemedText>
        </View>
        <Pressable
          onPress={onClose}
          style={[styles.closeBtn, { backgroundColor: colors.tint }]}
        >
          <ThemedText style={styles.closeBtnText}>{Strings.common.done}</ThemedText>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  name: { marginBottom: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
