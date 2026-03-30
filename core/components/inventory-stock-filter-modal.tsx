import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/core/components/themed-text';
import { Colors } from '@/core/constants/theme';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import { Strings } from '@/core/strings';
import type { InventoryStockFilter } from '@/core/types/product';

type QuantityMode = 'gt' | 'lt' | 'between';

type Draft =
  | { section: 'none' }
  | { section: 'unavailable' }
  | { section: 'quantity'; mode: QuantityMode; v1: string; v2: string };

function filterToDraft(f: InventoryStockFilter | null): Draft {
  if (f == null) return { section: 'none' };
  if (f.kind === 'unavailable') return { section: 'unavailable' };
  if (f.kind === 'gt') return { section: 'quantity', mode: 'gt', v1: String(f.a), v2: '' };
  if (f.kind === 'lt') return { section: 'quantity', mode: 'lt', v1: String(f.a), v2: '' };
  return { section: 'quantity', mode: 'between', v1: String(f.a), v2: String(f.b) };
}

function parseNonNegInt(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

export type InventoryStockFilterModalProps = {
  visible: boolean;
  onClose: () => void;
  appliedFilter: InventoryStockFilter | null;
  onApply: (filter: InventoryStockFilter | null) => void;
};

export function InventoryStockFilterModal({
  visible,
  onClose,
  appliedFilter,
  onApply,
}: InventoryStockFilterModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [draft, setDraft] = useState<Draft>(() => filterToDraft(appliedFilter));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDraft(filterToDraft(appliedFilter));
      setError(null);
    }
  }, [visible, appliedFilter]);

  const apply = () => {
    if (draft.section === 'none') {
      onApply(null);
      onClose();
      return;
    }
    if (draft.section === 'unavailable') {
      onApply({ kind: 'unavailable' });
      onClose();
      return;
    }
    const { mode, v1, v2 } = draft;
    const n1 = parseNonNegInt(v1);
    if (n1 == null) {
      setError(Strings.company.inventoryStockFilterInvalid);
      return;
    }
    if (mode === 'between') {
      const n2 = parseNonNegInt(v2);
      if (n2 == null) {
        setError(Strings.company.inventoryStockFilterInvalid);
        return;
      }
      onApply({ kind: 'between', a: n1, b: n2 });
    } else if (mode === 'gt') {
      onApply({ kind: 'gt', a: n1 });
    } else {
      onApply({ kind: 'lt', a: n1 });
    }
    onClose();
  };

  const row = (label: string, active: boolean, onPress: () => void, danger?: boolean) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        {
          borderColor: active ? colors.tint : colors.icon + '30',
          backgroundColor: active ? colors.tint + '18' : colors.icon + '08',
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <ThemedText style={{ color: danger ? '#C62828' : colors.text, fontWeight: '600' }}>{label}</ThemedText>
    </Pressable>
  );

  const qtyActive = draft.section === 'quantity';
  const qtyMode = qtyActive ? draft.mode : 'gt';

  return visible ? (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.wrap}>
          <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
          <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.icon + '25' }]}>
            <ThemedText type="defaultSemiBold" style={[styles.title, { color: colors.text }]}>
              {Strings.company.inventoryStockFilterTitle}
            </ThemedText>

            <ScrollView
              style={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {row(
                Strings.company.inventoryStockFilterUnavailable,
                draft.section === 'unavailable',
                () => setDraft({ section: 'unavailable' }),
                true,
              )}

              <ThemedText style={[styles.sectionLabel, { color: colors.icon, marginTop: 6 }]}>
                {Strings.company.inventoryStockFilterByQuantity}
              </ThemedText>

              <View style={styles.opRow}>
                {(
                  [
                    ['gt', Strings.company.inventoryStockFilterGreaterThan] as const,
                    ['lt', Strings.company.inventoryStockFilterLessThan] as const,
                    ['between', Strings.company.inventoryStockFilterBetween] as const,
                  ] as const
                ).map(([mode, lbl]) => {
                  const active = qtyActive && qtyMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() =>
                        setDraft((d) => {
                          const carry =
                            d.section === 'quantity'
                              ? { v1: d.v1, v2: d.v2 }
                              : { v1: '', v2: '' };
                          return { section: 'quantity', mode, ...carry };
                        })
                      }
                      style={({ pressed }) => [
                        styles.opChip,
                        {
                          borderColor: active ? colors.tint : colors.icon + '30',
                          backgroundColor: active ? colors.tint + '22' : 'transparent',
                        },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <ThemedText
                        numberOfLines={1}
                        style={{ fontSize: 12, fontWeight: '600', color: active ? colors.tint : colors.text }}
                      >
                        {lbl}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              {qtyActive ? (
                <View style={styles.inputsRow}>
                  <TextInput
                    value={draft.v1}
                    onChangeText={(v1) => setDraft({ ...draft, v1 })}
                    placeholder="0"
                    placeholderTextColor={colors.icon}
                    keyboardType="number-pad"
                    style={[
                      styles.input,
                      { color: colors.text, borderColor: colors.icon + '35', backgroundColor: colors.icon + '08' },
                    ]}
                  />
                  {draft.mode === 'between' ? (
                    <>
                      <ThemedText style={[styles.betweenAnd, { color: colors.icon }]}>
                        {Strings.company.inventoryStockFilterAnd}
                      </ThemedText>
                      <TextInput
                        value={draft.v2}
                        onChangeText={(v2) => setDraft({ ...draft, v2 })}
                        placeholder="0"
                        placeholderTextColor={colors.icon}
                        keyboardType="number-pad"
                        style={[
                          styles.input,
                          { color: colors.text, borderColor: colors.icon + '35', backgroundColor: colors.icon + '08' },
                        ]}
                      />
                    </>
                  ) : null}
                </View>
              ) : null}

              {error ? (
                <ThemedText style={[styles.error, { color: '#C62828' }]}>{error}</ThemedText>
              ) : null}

              <ThemedText style={[styles.hint, { color: colors.icon }]}>
                {Strings.company.inventoryStockFilterCombineHint}
              </ThemedText>
            </ScrollView>

            <View style={styles.actions}>
              <Pressable
                onPress={() => {
                  onApply(null);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.btn,
                  { borderColor: colors.icon + '40', borderWidth: 1 },
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={Strings.company.clearFilter}
              >
                <ThemedText style={{ color: colors.text, fontWeight: '600' }}>
                  {Strings.company.clearFilter}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={apply}
                style={({ pressed }) => [
                  styles.btn,
                  { backgroundColor: colors.tint },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <ThemedText style={{ color: '#fff', fontWeight: '700' }}>
                  {Strings.company.inventoryStockFilterApply}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  ) : null;
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    maxHeight: '88%',
    zIndex: 1,
    overflow: 'hidden',
  },
  title: { fontSize: 18, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8, textAlign: 'center' },
  scroll: { maxHeight: 400, paddingHorizontal: 20 },
  sectionLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  optionRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  opRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opChip: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  inputsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8, flexWrap: 'wrap' },
  input: {
    minWidth: 72,
    maxWidth: 100,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  betweenAnd: { fontSize: 14, fontWeight: '500' },
  error: { marginTop: 8, fontSize: 13 },
  hint: { marginTop: 10, marginBottom: 8, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 12, padding: 16, paddingTop: 8 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
