import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';

import { fetchRequestedOrderLines, fulfillSelectedItems } from '@/core/api/requested-orders';
import { ThemedText } from '@/core/components/themed-text';
import { ThemedView } from '@/core/components/themed-view';
import { CURRENCY_DEFAULT } from '@/core/constants/currency';
import { Colors } from '@/core/constants/theme';
import { useDataSource } from '@/core/context/data-source-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { formatAmount, formatPrice } from '@/core/services/format';
import { toast } from '@/core/services/toast';
import type { RequestedOrderLine } from '@/core/types/requested-orders';
import { Strings } from '@/core/strings';

const PAGE_LIMIT = 50;

export default function RequestedOrderDetailScreen() {
  const { orderId } = useLocalSearchParams<{ id: string; orderId: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { useMockData } = useDataSource();

  const [lines, setLines] = useState<RequestedOrderLine[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedLine, setSelectedLine] = useState<RequestedOrderLine | null>(null);
  const [confirmLine, setConfirmLine] = useState<RequestedOrderLine | null>(null);
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reloadFromStart = useCallback(
    (opts?: { silent?: boolean }) => {
      if (!orderId) return;
      const silent = opts?.silent === true;
      if (!silent) {
        setLoading(true);
        setLines([]);
      }
      setPage(1);
      fetchRequestedOrderLines(orderId, { page: 1, limit: PAGE_LIMIT }, useMockData)
        .then((res) => {
          if (!mountedRef.current) return;
          setLines(res.lines);
          setHasMore(res.lines.length < res.totalCount);
        })
        .catch(() => {})
        .finally(() => {
          if (mountedRef.current && !silent) setLoading(false);
        });
    },
    [orderId, useMockData],
  );

  useEffect(() => {
    reloadFromStart();
  }, [reloadFromStart]);

  const loadMore = useCallback(() => {
    if (!orderId || loadingMore || !hasMore || loading) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    fetchRequestedOrderLines(orderId, { page: nextPage, limit: PAGE_LIMIT }, useMockData)
      .then((res) => {
        if (!mountedRef.current) return;
        setLines((prev) => {
          const merged = [...prev, ...res.lines];
          setHasMore(merged.length < res.totalCount);
          return merged;
        });
        setPage(nextPage);
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setLoadingMore(false);
      });
  }, [orderId, loadingMore, hasMore, loading, page, useMockData]);

  const handleFulfillConfirm = useCallback(async () => {
    if (!orderId || !confirmLine) return;
    const requestId = confirmLine.request_id;
    setConfirmLine(null);
    setFulfillingId(requestId);
    try {
      const res = await fulfillSelectedItems(orderId, [requestId], useMockData);
      if (res.affected_rows > 0) {
        toast.show({ type: 'success', message: Strings.company.requestsMarkedFulfilled });
        reloadFromStart({ silent: true });
      } else {
        toast.show({ type: 'info', message: Strings.company.nothingToFulfill });
      }
    } catch {
      // gqlRequest already toasts
    } finally {
      if (mountedRef.current) setFulfillingId(null);
    }
  }, [orderId, confirmLine, useMockData, reloadFromStart]);

  const renderLine = useCallback(
    ({ item }: { item: RequestedOrderLine }) => {
      const pending = item.fulfillment_status === 'pending';
      const isFulfilling = fulfillingId === item.request_id;
      return (
        <Pressable
          onPress={() => setSelectedLine(item)}
          style={({ pressed }) => [
            styles.lineCard,
            { backgroundColor: colors.background, borderColor: colors.icon + '25' },
            pressed && { opacity: 0.92 },
          ]}
        >
          <View style={styles.lineRow}>
            <View style={styles.lineContent}>
              <ThemedText type="defaultSemiBold" numberOfLines={2} style={{ color: colors.text }}>
                {item.product_name}
              </ThemedText>
              <View style={styles.lineCodeBlock}>
                <ThemedText style={[styles.lineMeta, { color: colors.icon }]}>
                  {Strings.company.articleCode}: {item.article_code}
                </ThemedText>
                {item.size ? (
                  <ThemedText style={[styles.lineMeta, styles.lineSizeBelow, { color: colors.icon }]}>
                    {Strings.company.size}: {item.size}
                  </ThemedText>
                ) : null}
              </View>
              <ThemedText style={[styles.lineMeta, { color: colors.icon }]}>
                {item.quantity} × {formatAmount(item.unit_price)} = {formatAmount(item.total)}
              </ThemedText>
              <ThemedText style={[styles.statusBadge, { color: pending ? '#E65100' : '#2E7D32' }]}>
                {item.fulfillment_status}
              </ThemedText>
            </View>
            {pending ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  setConfirmLine(item);
                }}
                disabled={isFulfilling}
                hitSlop={8}
                style={[
                  styles.fulfillItemBtn,
                  { backgroundColor: isFulfilling ? colors.icon + '40' : colors.tint },
                ]}
              >
                {isFulfilling ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={styles.fulfillItemBtnText}>
                    {Strings.company.fulfillRequest}
                  </ThemedText>
                )}
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [colors, fulfillingId],
  );

  if (!orderId) {
    return (
      <ThemedView style={styles.center}>
        <Stack.Screen options={{ title: Strings.company.requestedOrdersTitle }} />
        <ThemedText style={{ color: colors.icon }}>Missing order</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen options={{ title: Strings.company.requestLineDetails }} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <FlatList
          data={lines}
          keyExtractor={(item) => item.line_key}
          renderItem={renderLine}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + insets.bottom }]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={colors.tint} />
            ) : null
          }
          ListEmptyComponent={
            <ThemedText style={[styles.centerText, { color: colors.icon }]}>
              {Strings.company.noRequestedOrders}
            </ThemedText>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Confirmation popup */}
      <Modal
        visible={confirmLine != null}
        animationType="fade"
        transparent
        onRequestClose={() => setConfirmLine(null)}
      >
        <Pressable style={styles.confirmOverlay} onPress={() => setConfirmLine(null)}>
          <Pressable style={[styles.confirmCard, { backgroundColor: colors.background }]}>
            <ThemedText type="defaultSemiBold" style={styles.confirmTitle}>
              {Strings.company.fulfillConfirmMessage}
            </ThemedText>
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => setConfirmLine(null)}
                style={[styles.confirmBtn, { borderColor: colors.icon + '40', borderWidth: 1 }]}
              >
                <ThemedText style={{ color: colors.text, fontWeight: '600' }}>
                  {Strings.common.cancel}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={handleFulfillConfirm}
                style={[styles.confirmBtn, { backgroundColor: colors.tint }]}
              >
                <ThemedText style={{ color: '#fff', fontWeight: '700' }}>
                  {Strings.company.fulfillRequest}
                </ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Line detail modal */}
      <Modal visible={selectedLine != null} animationType="slide" onRequestClose={() => setSelectedLine(null)}>
        <ThemedView style={[styles.modalRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.icon + '25' }]}>
            <ThemedText type="subtitle">{Strings.company.requestLineDetails}</ThemedText>
            <Pressable onPress={() => setSelectedLine(null)} hitSlop={12}>
              <ThemedText style={{ color: colors.tint, fontWeight: '600' }}>{Strings.common.done}</ThemedText>
            </Pressable>
          </View>
          {selectedLine && (
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContent}
              showsVerticalScrollIndicator={false}
            >
              <ThemedText style={[styles.detailRow, { color: colors.text }]} numberOfLines={3}>
                {selectedLine.product_name}
              </ThemedText>
              <View style={styles.detailCodeBlock}>
                <ThemedText style={[styles.detailRow, { color: colors.icon }]}>
                  {Strings.company.articleCode}: {selectedLine.article_code}
                </ThemedText>
                {selectedLine.size ? (
                  <ThemedText style={[styles.detailRow, styles.detailSizeBelow, { color: colors.icon }]}>
                    {Strings.company.size}: {selectedLine.size}
                  </ThemedText>
                ) : null}
              </View>
              <ThemedText style={[styles.detailRow, { color: colors.icon }]}>
                {selectedLine.quantity} × {formatPrice(selectedLine.unit_price, CURRENCY_DEFAULT)} ={' '}
                {formatPrice(selectedLine.total, CURRENCY_DEFAULT)}
              </ThemedText>
              <View style={[styles.detailDivider, { backgroundColor: colors.icon + '20' }]} />
              <ThemedText style={[styles.detailRow, { color: colors.icon }]}>
                {Strings.company.student}:{' '}
                <ThemedText style={{ color: colors.text, fontWeight: '600' }}>{selectedLine.student_name}</ThemedText>
              </ThemedText>
              <ThemedText style={[styles.detailRow, { color: colors.icon }]}>
                {Strings.company.classLabel}:{' '}
                <ThemedText style={{ color: colors.text, fontWeight: '600' }}>{selectedLine.student_class}</ThemedText>
              </ThemedText>
              {selectedLine.phone_number ? (
                <ThemedText style={[styles.detailRow, { color: colors.icon }]}>
                  {Strings.company.phone}:{' '}
                  <ThemedText style={{ color: colors.text }}>{selectedLine.phone_number}</ThemedText>
                </ThemedText>
              ) : null}
              <ThemedText style={[styles.detailRow, { color: colors.icon }]}>
                {Strings.company.fulfillmentStatus}:{' '}
                <ThemedText style={{ fontWeight: '600' }}>{selectedLine.fulfillment_status}</ThemedText>
              </ThemedText>
            </ScrollView>
          )}
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center', padding: 24 },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  lineCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lineContent: {
    flex: 1,
    gap: 4,
  },
  lineCodeBlock: { alignSelf: 'stretch' },
  lineMeta: { fontSize: 13 },
  lineSizeBelow: { marginTop: 6 },
  statusBadge: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  fulfillItemBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    minHeight: 36,
  },
  fulfillItemBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmCard: {
    borderRadius: 14,
    padding: 24,
    maxWidth: 340,
    width: '100%',
    gap: 20,
  },
  confirmTitle: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  confirmActions: { flexDirection: 'row', gap: 12 },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalScroll: { flex: 1 },
  modalContent: { padding: 16, gap: 8 },
  detailCodeBlock: { alignSelf: 'stretch' },
  detailRow: { fontSize: 15, lineHeight: 22 },
  detailSizeBelow: { marginTop: 6 },
  detailDivider: { height: 1, marginVertical: 12 },
});
