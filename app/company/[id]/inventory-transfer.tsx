import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductSearchList } from '@/components/product-search-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useCompany } from '@/contexts/company-context';
import { useDataSource } from '@/contexts/data-source-context';
import { useProductCache } from '@/contexts/product-cache-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchCompanies } from '@/lib/api/companies';
import {
  acceptTransfer,
  createTransfer,
  fetchPendingTransfers,
  fetchTransferHistory,
  fetchTransferableCompanies,
  rejectTransfer,
} from '@/lib/api/transfers';
import type { CreateTransferItemInput } from '@/lib/backend/types';
import { formatDate } from '@/lib/format';
import type { CompanyWithRole } from '@/types/company';
import type { Product } from '@/types/product';
import type { InventoryTransfer, TransferStatus } from '@/types/transfer';

type TabIndex = 0 | 1 | 2;

interface TransferLineItem {
  product: Product;
  quantity: number;
}

const TABS: { label: string; index: TabIndex }[] = [
  { label: 'Create Transfer', index: 0 },
  { label: 'Requests', index: 1 },
  { label: 'History', index: 2 },
];

const STATUS_STYLE: Record<
  TransferStatus,
  { bg: string; fg: string; icon: Parameters<typeof IconSymbol>[0]['name'] }
> = {
  pending: { bg: '#FFF3E0', fg: '#E65100', icon: 'clock.fill' },
  accepted: { bg: '#E8F5E9', fg: '#2E7D32', icon: 'checkmark.circle.fill' },
  rejected: { bg: '#FFEBEE', fg: '#C62828', icon: 'xmark.circle.fill' },
};

export default function InventoryTransferScreen() {
  const { id: companyId } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  useCompany();
  const { session } = useAuth();
  const { useMockData } = useDataSource();
  const { refreshProducts } = useProductCache();
  const userId = session?.user?.id ?? '';

  const [activeTab, setActiveTab] = useState<TabIndex>(0);
  const [companies, setCompanies] = useState<CompanyWithRole[]>([]);
  const [destinationCompanyId, setDestinationCompanyId] = useState<string | null>(null);
  const [transferItems, setTransferItems] = useState<TransferLineItem[]>([]);
  const [addItemModalVisible, setAddItemModalVisible] = useState(false);
  const [companyPickerVisible, setCompanyPickerVisible] = useState(false);
  const [pendingTransfers, setPendingTransfers] = useState<InventoryTransfer[]>([]);
  const [historyTransfers, setHistoryTransfers] = useState<InventoryTransfer[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [acceptRejectLoading, setAcceptRejectLoading] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const transferableCompanies = companies.length
    ? fetchTransferableCompanies(companies, companyId ?? '')
    : [];

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchCompanies(useMockData).then((list: CompanyWithRole[]) => {
      if (!cancelled && mountedRef.current) setCompanies(list);
    });
    return () => { cancelled = true; };
  }, [useMockData]);

  useFocusEffect(
    useCallback(() => {
      if (!companyId) return;
      if (activeTab === 1) {
        setLoadingPending(true);
        fetchPendingTransfers(companyId, useMockData)
          .then((data) => { if (mountedRef.current) setPendingTransfers(data); })
          .finally(() => { if (mountedRef.current) setLoadingPending(false); });
      } else if (activeTab === 2) {
        setLoadingHistory(true);
        fetchTransferHistory(companyId, useMockData)
          .then((data) => { if (mountedRef.current) setHistoryTransfers(data); })
          .finally(() => { if (mountedRef.current) setLoadingHistory(false); });
      }
    }, [companyId, activeTab, useMockData]),
  );

  const handleSelectProduct = useCallback((product: Product) => {
    setTransferItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        const max = Math.max(1, existing.product.quantity ?? 1);
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: Math.min(i.quantity + 1, max) }
            : i,
        );
      }
      const max = Math.max(1, product.quantity ?? 1);
      return [...prev, { product, quantity: 1 }];
    });
    setAddItemModalVisible(false);
  }, []);

  const updateTransferQuantity = useCallback((productId: string, delta: number) => {
    setTransferItems((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        const max = Math.max(1, item.product.quantity ?? 1);
        const next = Math.max(1, Math.min(max, item.quantity + delta));
        return { ...item, quantity: next };
      }),
    );
  }, []);

  const setTransferQuantity = useCallback((productId: string, value: string) => {
    const num = parseInt(value, 10);
    if (Number.isNaN(num) || num < 1) return;
    setTransferItems((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        const max = Math.max(1, item.product.quantity ?? 1);
        return { ...item, quantity: Math.min(max, num) };
      }),
    );
  }, []);

  const removeTransferItem = useCallback((productId: string) => {
    setTransferItems((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const handleInitiateTransfer = useCallback(async () => {
    if (!companyId || !destinationCompanyId || transferItems.length === 0) return;
    if (!userId) return;
    setSubmitting(true);
    try {
      const items: CreateTransferItemInput[] = transferItems.map((item) => ({
        article_code: item.product.id,
        quantity: item.quantity,
      }));
      await createTransfer(
        {
          source_company_id: companyId,
          destination_company_id: destinationCompanyId,
          created_by: userId,
          items,
        },
        useMockData,
      );
      setTransferItems([]);
      setDestinationCompanyId(null);
      setActiveTab(1);
    } catch (_e) {
      // Error could be shown via Alert or toast
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }, [companyId, destinationCompanyId, transferItems, useMockData, userId]);

  const handleAccept = useCallback(
    async (transferId: string) => {
      setAcceptRejectLoading(transferId);
      try {
        await acceptTransfer(transferId, useMockData);
        if (companyId) refreshProducts(companyId);
        setPendingTransfers((prev) => prev.filter((t) => t.id !== transferId));
      } catch (_e) {
        // show error
      } finally {
        if (mountedRef.current) setAcceptRejectLoading(null);
      }
    },
    [companyId, useMockData, refreshProducts],
  );

  const handleReject = useCallback(
    async (transferId: string) => {
      setAcceptRejectLoading(transferId);
      try {
        await rejectTransfer(transferId, useMockData);
        setPendingTransfers((prev) => prev.filter((t) => t.id !== transferId));
      } catch (_e) {
        // show error
      } finally {
        if (mountedRef.current) setAcceptRejectLoading(null);
      }
    },
    [useMockData],
  );

  const destinationCompany = transferableCompanies.find((c) => c.id === destinationCompanyId);
  const canInitiate =
    !!userId &&
    !!destinationCompanyId &&
    transferItems.length > 0 &&
    transferItems.every((i) => i.quantity >= 1);

  const renderCreateTab = () => (
    <>
      <View style={styles.section}>
        <ThemedText style={[styles.sectionLabel, { color: colors.icon }]}>Destination</ThemedText>
        <Pressable
          onPress={() => setCompanyPickerVisible(true)}
          style={[styles.dropdown, { backgroundColor: colors.background, borderColor: colors.icon + '30' }]}
        >
          <ThemedText numberOfLines={1} style={styles.dropdownText}>
            {destinationCompany ? destinationCompany.name : 'Select company'}
          </ThemedText>
          <IconSymbol name="chevron.down" size={18} color={colors.icon} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Pressable
          onPress={() => setAddItemModalVisible(true)}
          style={[styles.addItemBtn, { backgroundColor: colors.tint }]}
        >
          <IconSymbol name="plus.circle.fill" size={22} color="#fff" />
          <ThemedText style={styles.addItemBtnText}>Add item</ThemedText>
        </Pressable>
      </View>

      {transferItems.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol name="shippingbox" size={48} color={colors.icon + '50'} />
          <ThemedText style={[styles.emptyText, { color: colors.icon }]}>
            No items. Tap Add item to select products.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={transferItems}
          keyExtractor={(item) => item.product.id}
          renderItem={({ item }) => {
            const max = Math.max(1, item.product.quantity ?? 1);
            return (
              <View style={[styles.transferCard, { backgroundColor: colors.background, borderColor: colors.icon + '25' }]}>
                <View style={styles.transferCardBody}>
                  <ThemedText type="defaultSemiBold" numberOfLines={1}>{item.product.name}</ThemedText>
                  <ThemedText style={[styles.skuText, { color: colors.icon }]}>
                    Code: {item.product.scan_code} · Max: {max}
                  </ThemedText>
                </View>
                <View style={styles.qtyRow}>
                  <Pressable
                    onPress={() => updateTransferQuantity(item.product.id, -1)}
                    style={[styles.qtyBtn, { backgroundColor: colors.icon + '15' }]}
                  >
                    <IconSymbol name="minus" size={16} color={colors.text} />
                  </Pressable>
                  <TextInput
                    style={[styles.qtyInput, { color: colors.text, borderColor: colors.icon + '30' }]}
                    value={String(item.quantity)}
                    keyboardType="number-pad"
                    onChangeText={(t) => setTransferQuantity(item.product.id, t)}
                  />
                  <Pressable
                    onPress={() => updateTransferQuantity(item.product.id, 1)}
                    style={[styles.qtyBtn, { backgroundColor: colors.icon + '15' }]}
                  >
                    <IconSymbol name="plus" size={16} color={colors.text} />
                  </Pressable>
                </View>
                <Pressable onPress={() => removeTransferItem(item.product.id)} hitSlop={8}>
                  <IconSymbol name="trash" size={18} color="#C62828" />
                </Pressable>
              </View>
            );
          }}
          contentContainerStyle={[styles.transferList, { paddingBottom: 100 + insets.bottom }]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {transferItems.length > 0 && (
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
            onPress={handleInitiateTransfer}
            disabled={!canInitiate || submitting}
            style={[styles.initiateBtn, { backgroundColor: canInitiate && !submitting ? colors.tint : colors.icon + '40' }]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <ThemedText style={styles.initiateBtnText}>Initiate transfer</ThemedText>
                <IconSymbol name="arrow.right" size={18} color="#fff" />
              </>
            )}
          </Pressable>
        </View>
      )}
    </>
  );

  const renderRequestsTab = () => {
    if (loadingPending) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      );
    }
    if (pendingTransfers.length === 0) {
      return (
        <View style={styles.center}>
          <ThemedText style={{ color: colors.icon }}>No pending requests</ThemedText>
        </View>
      );
    }
    return (
      <FlatList
        data={pendingTransfers}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => {
          const s = STATUS_STYLE[item.status];
          const loading = acceptRejectLoading === item.id;
          return (
            <View style={[styles.requestCard, { backgroundColor: colors.background, borderColor: colors.icon + '25' }]}>
              <View style={styles.requestCardTop}>
                <ThemedText type="defaultSemiBold">{item.source_company_name}</ThemedText>
                <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                  <IconSymbol name={s.icon} size={12} color={s.fg} />
                  <ThemedText style={[styles.statusText, { color: s.fg }]}>{item.status}</ThemedText>
                </View>
              </View>
              <ThemedText style={[styles.dateText, { color: colors.icon }]}>
                {formatDate(item.created_at)} · {item.items.length} item(s)
              </ThemedText>
              <View style={styles.requestActions}>
                <Pressable
                  onPress={() => handleAccept(item.id)}
                  disabled={loading}
                  style={[styles.acceptBtn, { backgroundColor: '#2E7D32' }]}
                >
                  {loading ? <ActivityIndicator size="small" color="#fff" /> : <ThemedText style={styles.actionBtnText}>Accept</ThemedText>}
                </Pressable>
                <Pressable
                  onPress={() => handleReject(item.id)}
                  disabled={loading}
                  style={[styles.rejectBtn, { borderColor: '#C62828' }]}
                >
                  <ThemedText style={[styles.actionBtnTextSecondary, { color: '#C62828' }]}>Reject</ThemedText>
                </Pressable>
              </View>
            </View>
          );
        }}
        contentContainerStyle={[styles.listContent, { paddingBottom: 24 + insets.bottom }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  const renderHistoryTab = () => {
    if (loadingHistory) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      );
    }
    if (historyTransfers.length === 0) {
      return (
        <View style={styles.center}>
          <ThemedText style={{ color: colors.icon }}>No transfer history</ThemedText>
        </View>
      );
    }
    return (
      <FlatList
        data={historyTransfers}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => {
          const s = STATUS_STYLE[item.status];
          const isOutgoing = item.source_company_id === companyId;
          return (
            <View style={[styles.historyCard, { backgroundColor: colors.background, borderColor: colors.icon + '25' }]}>
              <View style={styles.historyCardTop}>
                <ThemedText type="defaultSemiBold" numberOfLines={1}>
                  {isOutgoing ? `To: ${item.destination_company_name}` : `From: ${item.source_company_name}`}
                </ThemedText>
                <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                  <IconSymbol name={s.icon} size={12} color={s.fg} />
                  <ThemedText style={[styles.statusText, { color: s.fg }]}>{item.status}</ThemedText>
                </View>
              </View>
              <ThemedText style={[styles.dateText, { color: colors.icon }]}>
                {formatDate(item.created_at)} · {item.items.length} item(s)
              </ThemedText>
            </View>
          );
        }}
        contentContainerStyle={[styles.listContent, { paddingBottom: 24 + insets.bottom }]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Inventory Transfer' }} />

      <View style={[styles.tabBar, { borderBottomColor: colors.icon + '20' }]}>
        {TABS.map((tab) => {
          const active = activeTab === tab.index;
          return (
            <Pressable
              key={tab.index}
              onPress={() => setActiveTab(tab.index)}
              style={[styles.tab, active && { borderBottomColor: colors.tint, borderBottomWidth: 2 }]}
            >
              <ThemedText
                style={[styles.tabLabel, active ? { color: colors.tint, fontWeight: '600' } : { color: colors.icon }]}
                numberOfLines={1}
              >
                {tab.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.tabContent}>
        {activeTab === 0 && renderCreateTab()}
        {activeTab === 1 && renderRequestsTab()}
        {activeTab === 2 && renderHistoryTab()}
      </View>

      <Modal visible={addItemModalVisible} animationType="slide" onRequestClose={() => setAddItemModalVisible(false)}>
        <ThemedView style={[styles.modalFull, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.icon + '20' }]}>
            <ThemedText type="subtitle">Select product</ThemedText>
            <Pressable onPress={() => setAddItemModalVisible(false)} hitSlop={12}>
              <IconSymbol name="xmark" size={22} color={colors.text} />
            </Pressable>
          </View>
          <ProductSearchList companyId={companyId} onSelectProduct={handleSelectProduct} showQuantity />
        </ThemedView>
      </Modal>

      <Modal visible={companyPickerVisible} animationType="slide" onRequestClose={() => setCompanyPickerVisible(false)}>
        <ThemedView style={[styles.modalFull, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.icon + '20' }]}>
            <ThemedText type="subtitle">Destination company</ThemedText>
            <Pressable onPress={() => setCompanyPickerVisible(false)} hitSlop={12}>
              <IconSymbol name="xmark" size={22} color={colors.text} />
            </Pressable>
          </View>
          <FlatList
            data={transferableCompanies}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setDestinationCompanyId(item.id);
                  setCompanyPickerVisible(false);
                }}
                style={[styles.companyRow, { borderBottomColor: colors.icon + '15' }]}
              >
                <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
                <IconSymbol name="chevron.right" size={18} color={colors.icon} />
              </Pressable>
            )}
            contentContainerStyle={styles.companyList}
          />
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: { fontSize: 14 },
  tabContent: { flex: 1 },
  section: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600' },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  dropdownText: { flex: 1, fontSize: 16 },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
  },
  addItemBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyText: { textAlign: 'center' },
  transferList: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 },
  separator: { height: 10 },
  transferCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  transferCardBody: { flex: 1, gap: 2 },
  skuText: { fontSize: 12 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qtyInput: {
    width: 48,
    height: 32,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  initiateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  initiateBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  requestCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 16,
    gap: 10,
  },
  requestCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  dateText: { fontSize: 13 },
  requestActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  acceptBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  rejectBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, borderWidth: 2 },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  actionBtnTextSecondary: { fontWeight: '600', fontSize: 14 },
  historyCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 16,
    gap: 6,
  },
  historyCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listContent: { paddingTop: 16, paddingBottom: 24 },
  modalFull: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  companyList: { paddingBottom: 24 },
});
