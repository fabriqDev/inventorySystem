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

import { fetchRequestedOrderLines, fulfillOrderRequests } from '@/core/api/requested-orders';
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
  const [fulfilling, setFulfilling] = useState(false);
  const [selectedLine, setSelectedLine] = useState<RequestedOrderLine | null>(null);

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

  const hasPending = lines.some((l) => l.fulfillment_status === 'pending');

  const handleFulfill = useCallback(async () => {
    if (!orderId || !hasPending || fulfilling) return;
    setFulfilling(true);
    try {
      const res = await fulfillOrderRequests(orderId, useMockData);
      if (res.affected_rows > 0) {
        toast.show({ type: 'success', message: Strings.company.requestsMarkedFulfilled });
        reloadFromStart({ silent: true });
      } else {
        toast.show({ type: 'info', message: Strings.company.nothingToFulfill });
      }
    } catch {
      // gqlRequest already toasts
    } finally {
      if (mountedRef.current) setFulfilling(false);
    }
  }, [orderId, hasPending, fulfilling, useMockData, reloadFromStart]);

  const renderLine = useCallback(
    ({ item }: { item: RequestedOrderLine }) => {
      const pending = item.fulfillment_status === 'pending';
      return (
        <Pressable
          onPress={() => setSelectedLine(item)}
          style={({ pressed }) => [
            styles.lineCard,
            { backgroundColor: colors.background, borderColor: colors.icon + '25' },
            pressed && { opacity: 0.92 },
          ]}
        >
          <ThemedText type="defaultSemiBold" numberOfLines={2} style={{ color: colors.text }}>
            {item.product_name}
          </ThemedText>
          <ThemedText style={[styles.lineMeta, { color: colors.icon }]}>
            {Strings.company.articleCode}: {item.article_code}
          </ThemedText>
          <ThemedText style={[styles.lineMeta, { color: colors.icon }]}>
            {item.quantity} × {formatAmount(item.unit_price)} = {formatAmount(item.total)}
          </ThemedText>
          <ThemedText style={[styles.statusBadge, { color: pending ? '#E65100' : '#2E7D32' }]}>
            {item.fulfillment_status}
          </ThemedText>
        </Pressable>
      );
    },
    [colors],
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
          contentContainerStyle={[styles.list, { paddingBottom: 120 + insets.bottom }]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.35}
          ListHeaderComponent={
            <ThemedText style={[styles.hint, { color: colors.icon }]}>
              {Strings.company.fulfillRequestHint}
            </ThemedText>
          }
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

      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.icon + '20',
            paddingBottom: 16 + insets.bottom,
          },
        ]}
      >
        <Pressable
          onPress={handleFulfill}
          disabled={!hasPending || fulfilling}
          style={[
            styles.fulfillBtn,
            { backgroundColor: hasPending && !fulfilling ? colors.tint : colors.icon + '40' },
          ]}
        >
          {fulfilling ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.fulfillBtnText}>{Strings.company.fulfillRequest}</ThemedText>
          )}
        </Pressable>
      </View>

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
              <ThemedText style={[styles.detailRow, { color: colors.icon }]}>
                {Strings.company.articleCode}: {selectedLine.article_code}
              </ThemedText>
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
  hint: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  lineCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  lineMeta: { fontSize: 13 },
  statusBadge: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  fulfillBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  fulfillBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
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
  detailRow: { fontSize: 15, lineHeight: 22 },
  detailDivider: { height: 1, marginVertical: 12 },
});
