import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/core/components/themed-text';
import { Colors } from '@/core/constants/theme';
import { useColorScheme } from '@/core/hooks/use-color-scheme';
import {
  QUICK_FILTER_HIGH_STOCK,
  QUICK_FILTER_LOW_STOCK,
  QUICK_FILTER_UNAVAILABLE,
  type ProductQuickFilter,
} from '@/core/types/product-quick-filter';

export type QuickFilterTab = { value: ProductQuickFilter; label: string };

type Props = {
  tabs: QuickFilterTab[];
  value: ProductQuickFilter;
  onChange: (v: ProductQuickFilter) => void;
  /** `inventory`: uniform-only tabs (tint active). `default`: includes stock chips with red/green. */
  variant: 'default' | 'inventory';
  /** Smaller padding/fonts for use in the navigation header. */
  compact?: boolean;
  testID?: string;
};

export function ProductQuickFilterChips({
  tabs,
  value,
  onChange,
  variant,
  compact = false,
  testID,
}: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      bounces={false}
      nestedScrollEnabled
      contentContainerStyle={[
        styles.content,
        compact && styles.contentCompact,
      ]}
      style={[styles.scroll, compact && styles.scrollCompact]}
      testID={testID}
    >
      {tabs.map((tab, chipIndex) => {
        const active = value === tab.value;
        const isUnavailableTab = tab.value === QUICK_FILTER_UNAVAILABLE;
        const isLowStockTab = tab.value === QUICK_FILTER_LOW_STOCK;
        const isHighStockTab = tab.value === QUICK_FILTER_HIGH_STOCK;
        const stockChipColors = variant === 'default';
        const activeBg =
          stockChipColors && (isUnavailableTab || isLowStockTab)
            ? '#C62828'
            : stockChipColors && isHighStockTab
              ? '#2E7D32'
              : colors.tint;
        return (
          <Pressable
            key={tab.value}
            onPress={() => onChange(tab.value)}
            style={({ pressed }) => [
              compact ? styles.chipCompact : styles.chip,
              chipIndex < tabs.length - 1 && (compact ? styles.chipSpacingCompact : styles.chipSpacing),
              active
                ? { backgroundColor: activeBg }
                : { backgroundColor: colors.icon + '12', borderWidth: 1, borderColor: colors.icon + '22' },
              pressed && { opacity: 0.85 },
            ]}
          >
            <ThemedText
              numberOfLines={1}
              includeFontPadding={false}
              style={[
                compact ? styles.chipTextCompact : styles.chipText,
                active ? { color: '#fff' } : { color: colors.text },
              ]}
            >
              {tab.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  /** No maxHeight: a tight cap clips chip labels (padding + lineHeight + borders). */
  scroll: { flexGrow: 0, flexShrink: 0 },
  scrollCompact: { maxHeight: 40 },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 8,
    paddingRight: 20,
  },
  contentCompact: {
    paddingVertical: 0,
    paddingLeft: 0,
    paddingRight: 8,
    alignItems: 'center',
  },
  chip: {
    flexShrink: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipCompact: {
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipSpacing: { marginRight: 8 },
  chipSpacingCompact: { marginRight: 6 },
  chipText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  chipTextCompact: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
});
