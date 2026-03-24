import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { fetchRequestedOrders } from '@/core/api/requested-orders';
import { ThemedText } from '@/core/components/themed-text';
import { ThemedView } from '@/core/components/themed-view';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { CURRENCY_DEFAULT } from '@/core/constants/currency';
import {
  OrderItemRequestField,
  type RequestItemSearchPayload,
} from '@/core/constants/order-item-request-fields';
import { Colors } from '@/core/constants/theme';
import { useDataSource } from '@/core/context/data-source-context';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { formatDate, formatPrice } from '@/core/services/format';
import type { FulfillmentTab, RequestedOrderListRow } from '@/core/types/requested-orders';
import { Strings } from '@/core/strings';

const PAGE_LIMIT = 50;

export default function RequestedItemsListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { useMockData } = useDataSource();

  const [tab, setTab] = useState<FulfillmentTab>('unfulfilled');
  const [searchOpen, setSearchOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<RequestItemSearchPayload>({});
  const [draftClass, setDraftClass] = useState('');
  const [draftStudent, setDraftStudent] = useState('');
  const [draftPhone, setDraftPhone] = useState('');

  const [orders, setOrders] = useState<RequestedOrderListRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const openSearchModal = useCallback(() => {
    setDraftClass(appliedFilters[OrderItemRequestField.STUDENT_CLASS] ?? '');
    setDraftStudent(appliedFilters[OrderItemRequestField.STUDENT_NAME] ?? '');
    setDraftPhone(appliedFilters[OrderItemRequestField.PHONE_NUMBER] ?? '');
    setSearchOpen(true);
  }, [appliedFilters]);

  const applySearch = useCallback(() => {
    const next: RequestItemSearchPayload = {};
    const c = draftClass.trim();
    const s = draftStudent.trim();
    const p = draftPhone.trim();
    if (c) next[OrderItemRequestField.STUDENT_CLASS] = c;
    if (s) next[OrderItemRequestField.STUDENT_NAME] = s;
    if (p) next[OrderItemRequestField.PHONE_NUMBER] = p;
    setAppliedFilters(next);
    setSearchOpen(false);
  }, [draftClass, draftStudent, draftPhone]);

  const clearSearchFilters = useCallback(() => {
    setDraftClass('');
    setDraftStudent('');
    setDraftPhone('');
    setAppliedFilters({});
    setSearchOpen(false);
  }, []);

  const searchIsActive = useMemo(() => {
    const f = appliedFilters;
    return Boolean(
      (f[OrderItemRequestField.STUDENT_NAME]?.trim() ?? '') ||
        (f[OrderItemRequestField.STUDENT_CLASS]?.trim() ?? '') ||
        (f[OrderItemRequestField.PHONE_NUMBER]?.trim() ?? ''),
    );
  }, [appliedFilters]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setOrders([]);
    setPage(1);
    fetchRequestedOrders(
      id,
      { page: 1, limit: PAGE_LIMIT, tab, searchFilters: appliedFilters },
      useMockData,
    )
      .then((res) => {
        if (!mountedRef.current) return;
        setOrders(res.orders);
        setHasMore(res.orders.length < res.totalCount);
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [id, tab, appliedFilters, useMockData, refreshKey]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const loadMore = useCallback(() => {
    if (!id || loadingMore || !hasMore || loading) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    fetchRequestedOrders(
      id,
      { page: nextPage, limit: PAGE_LIMIT, tab, searchFilters: appliedFilters },
      useMockData,
    )
      .then((res) => {
        if (!mountedRef.current) return;
        setOrders((prev) => {
          const merged = [...prev, ...res.orders];
          setHasMore(merged.length < res.totalCount);
          return merged;
        });
        setPage(nextPage);
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setLoadingMore(false);
      });
  }, [id, loadingMore, hasMore, loading, page, tab, appliedFilters, useMockData]);

  const onRowPress = useCallback(
    (orderId: string) => {
      router.push(`/company/${id}/requested-items/${orderId}` as any);
    },
    [id, router],
  );

  const renderItem = useCallback(
    ({ item }: { item: RequestedOrderListRow }) => (
      <Pressable
        onPress={() => onRowPress(item.order_id)}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.background, borderColor: colors.icon + '25' },
          pressed && { opacity: 0.92 },
        ]}
      >
        <ThemedText type="defaultSemiBold" style={styles.orderId}>
          #{item.order_id}
        </ThemedText>
        <ThemedText style={[styles.studentLine, { color: colors.text }]}>
          {item.student_name}
          {item.has_multiple_students ? ` · ${Strings.company.multipleStudentsNote}` : ''}
        </ThemedText>
        <ThemedText style={[styles.classLine, { color: colors.icon }]}>
          {Strings.company.classLabel}: {item.student_class}
        </ThemedText>
        <ThemedText style={[styles.meta, { color: colors.icon }]}>
          {formatDate(item.created_at)} · {formatPrice(item.total, CURRENCY_DEFAULT)}
        </ThemedText>
      </Pressable>
    ),
    [colors, onRowPress],
  );

  const tabOptions = [
    { label: Strings.company.unfulfilledOrders, value: 'unfulfilled' as const },
    { label: Strings.company.fulfilledOrders, value: 'fulfilled' as const },
  ];

  const headerRight = useCallback(
    () => (
      <View style={styles.headerActions}>
        <Pressable onPress={handleRefresh} hitSlop={12} style={styles.headerIconBtn}>
          <IconSymbol name="arrow.clockwise" size={22} color={colors.text} />
        </Pressable>
        <Pressable onPress={openSearchModal} hitSlop={12} style={styles.headerIconBtn}>
          <View style={styles.searchIconWrap}>
            <IconSymbol name="magnifyingglass" size={22} color={colors.text} />
            {searchIsActive ? (
              <View
                style={[
                  styles.searchActiveDot,
                  { backgroundColor: colors.tint, borderColor: colors.background },
                ]}
              />
            ) : null}
          </View>
        </Pressable>
      </View>
    ),
    [colors.text, colors.tint, colors.background, handleRefresh, openSearchModal, searchIsActive],
  );

  const inputStyle = [styles.searchInput, { borderColor: colors.icon + '30', color: colors.text }];

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen
        options={{
          title: Strings.company.requestedOrdersTitle,
          headerRight,
        }}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
        style={styles.tabScroll}
      >
        {tabOptions.map((opt) => {
          const active = tab === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setTab(opt.value)}
              style={[
                styles.tabPill,
                {
                  backgroundColor: active ? colors.tint + '22' : colors.icon + '12',
                  borderColor: active ? colors.tint : 'transparent',
                },
              ]}
            >
              <ThemedText
                includeFontPadding={false}
                numberOfLines={1}
                style={[
                  styles.tabPillText,
                  {
                    color: active ? colors.tint : colors.icon,
                    fontWeight: active ? '700' : '600',
                  },
                ]}
              >
                {opt.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          {searchIsActive ? (
            <View style={styles.emptySearchWrap}>
              <ThemedText style={[styles.emptySearchHint, { color: colors.icon }]}>
                {Strings.company.noRequestedOrdersWithSearch}
              </ThemedText>
              <Pressable
                onPress={openSearchModal}
                style={[styles.emptySearchPrimaryBtn, { backgroundColor: colors.tint }]}
              >
                <ThemedText style={styles.emptySearchPrimaryBtnText}>
                  {Strings.company.requestedOrdersSearchAgain}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={clearSearchFilters}
                style={[styles.emptySearchSecondaryBtn, { borderColor: colors.icon + '40' }]}
              >
                <ThemedText style={{ color: colors.text, fontWeight: '600' }}>
                  {Strings.company.requestedOrdersClearSearch}
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <ThemedText style={{ color: colors.icon }}>{Strings.company.noRequestedOrders}</ThemedText>
          )}
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.order_id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + insets.bottom }]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={colors.tint} />
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={searchOpen} animationType="slide" transparent onRequestClose={() => setSearchOpen(false)}>
        <Pressable style={styles.searchOverlay} onPress={() => setSearchOpen(false)} />
        <ThemedView style={[styles.searchSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.searchHeader, { borderBottomColor: colors.icon + '25' }]}>
            <ThemedText type="subtitle">{Strings.company.searchByStudent}</ThemedText>
            <Pressable onPress={() => setSearchOpen(false)} hitSlop={12}>
              <ThemedText style={{ color: colors.icon }}>{Strings.common.cancel}</ThemedText>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <ThemedText style={[styles.fieldLabel, { color: colors.icon }]}>
              {Strings.company.requestSearchClassLabel}
            </ThemedText>
            <TextInput
              value={draftClass}
              onChangeText={setDraftClass}
              placeholder={Strings.company.requestSearchClassLabel}
              placeholderTextColor={colors.icon}
              style={inputStyle}
              autoCapitalize="words"
              returnKeyType="next"
            />
            <ThemedText style={[styles.fieldLabel, { color: colors.icon }]}>
              {Strings.company.requestSearchStudentLabel}
            </ThemedText>
            <TextInput
              value={draftStudent}
              onChangeText={setDraftStudent}
              placeholder={Strings.company.requestSearchStudentLabel}
              placeholderTextColor={colors.icon}
              style={inputStyle}
              autoCapitalize="words"
              returnKeyType="next"
            />
            <ThemedText style={[styles.fieldLabel, { color: colors.icon }]}>
              {Strings.company.requestSearchPhoneLabel}
            </ThemedText>
            <TextInput
              value={draftPhone}
              onChangeText={setDraftPhone}
              placeholder={Strings.company.requestSearchPhoneLabel}
              placeholderTextColor={colors.icon}
              style={inputStyle}
              keyboardType="phone-pad"
              returnKeyType="done"
            />
            <Pressable
              onPress={applySearch}
              style={[styles.primaryBtn, { backgroundColor: colors.tint }]}
            >
              <ThemedText style={styles.primaryBtnText}>{Strings.company.requestSearchSubmit}</ThemedText>
            </Pressable>
            <Pressable onPress={clearSearchFilters} style={styles.secondaryBtn}>
              <ThemedText style={{ color: colors.tint, fontWeight: '600' }}>
                {Strings.company.requestSearchClear}
              </ThemedText>
            </Pressable>
          </ScrollView>
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerIconBtn: { padding: 8 },
  searchIconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchActiveDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
  },
  /** Avoid maxHeight — Android clips pill text when ScrollView height < content (font scale / padding). */
  tabScroll: { flexGrow: 0, flexShrink: 0, width: '100%' },
  tabRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  tabPillText: { fontSize: 14, lineHeight: 20 },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  orderId: { fontSize: 15 },
  studentLine: { fontSize: 15 },
  classLine: { fontSize: 13 },
  meta: { fontSize: 12, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptySearchWrap: { alignItems: 'center', gap: 14, maxWidth: 280 },
  emptySearchHint: { textAlign: 'center', lineHeight: 22, marginBottom: 4 },
  emptySearchPrimaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  emptySearchPrimaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  emptySearchSecondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  searchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  searchSheet: {
    maxHeight: '85%',
    marginTop: 'auto',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  searchInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 4,
  },
  primaryBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: { paddingVertical: 14, alignItems: 'center' },
});
