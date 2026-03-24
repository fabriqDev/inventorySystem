import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Calendar, type DateData, type MarkedDates } from 'react-native-calendars';

import { ThemedText } from '@/core/components/themed-text';
import { Strings } from '@/core/strings';

export type SalesDatePreset = 'today' | '3days' | '7days' | '1month' | 'custom';

interface ThemeSlice {
  text: string;
  icon: string;
  background: string;
}

interface Props {
  activePreset: SalesDatePreset | null;
  onSelectPreset: (p: SalesDatePreset) => void;
  /** Custom range as YYYY-MM-DD */
  rangeFrom: string;
  rangeTo: string;
  onDayPress: (day: DateData) => void;
  tint: string;
  colors: ThemeSlice;
  disabled?: boolean;
}

function buildPeriodMarked(from: string, to: string, tintHex: string): MarkedDates {
  if (!from) return {};
  const single = !to || from === to;
  if (single) {
    return {
      [from]: {
        startingDay: true,
        endingDay: true,
        color: tintHex,
        textColor: '#ffffff',
      },
    };
  }
  const a = new Date(from + 'T12:00:00');
  const b = new Date(to + 'T12:00:00');
  const [start, end] = a <= b ? [from, to] : [to, from];
  const out: MarkedDates = {};
  const cur = new Date(start + 'T12:00:00');
  const endDt = new Date(end + 'T12:00:00');
  while (cur <= endDt) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${d}`;
    out[key] = {
      color: tintHex,
      textColor: '#ffffff',
      startingDay: key === start,
      endingDay: key === end,
    };
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function PresetHalfButton({
  label,
  active,
  onPress,
  tint,
  colors,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  tint: string;
  colors: ThemeSlice;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.halfBtn,
        {
          backgroundColor: active ? tint : 'transparent',
          borderColor: active ? tint : colors.icon + '40',
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <ThemedText
        numberOfLines={1}
        includeFontPadding={false}
        style={[styles.halfBtnText, { color: active ? '#fff' : colors.text }]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

function PresetFullButton({
  label,
  active,
  onPress,
  tint,
  colors,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  tint: string;
  colors: ThemeSlice;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.fullBtn,
        {
          backgroundColor: active ? tint : 'transparent',
          borderColor: active ? tint : colors.icon + '40',
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <ThemedText
        numberOfLines={1}
        includeFontPadding={false}
        style={[styles.halfBtnText, { color: active ? '#fff' : colors.text }]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function SalesDatePresetPicker({
  activePreset,
  onSelectPreset,
  rangeFrom,
  rangeTo,
  onDayPress,
  tint,
  colors,
  disabled,
}: Props) {
  const marked = useMemo(
    () => buildPeriodMarked(rangeFrom, rangeTo, tint),
    [rangeFrom, rangeTo, tint],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <PresetHalfButton
          label={Strings.company.today}
          active={activePreset === 'today'}
          onPress={() => onSelectPreset('today')}
          tint={tint}
          colors={colors}
          disabled={disabled}
        />
        <PresetHalfButton
          label={Strings.company.last3Days}
          active={activePreset === '3days'}
          onPress={() => onSelectPreset('3days')}
          tint={tint}
          colors={colors}
          disabled={disabled}
        />
      </View>
      <View style={styles.row}>
        <PresetHalfButton
          label={Strings.company.last7Days}
          active={activePreset === '7days'}
          onPress={() => onSelectPreset('7days')}
          tint={tint}
          colors={colors}
          disabled={disabled}
        />
        <PresetHalfButton
          label={Strings.company.last1Month}
          active={activePreset === '1month'}
          onPress={() => onSelectPreset('1month')}
          tint={tint}
          colors={colors}
          disabled={disabled}
        />
      </View>
      <View style={styles.rowSingle}>
        <PresetFullButton
          label={Strings.company.customRange}
          active={activePreset === 'custom'}
          onPress={() => onSelectPreset('custom')}
          tint={tint}
          colors={colors}
          disabled={disabled}
        />
      </View>

      {activePreset === 'custom' && (
        <View style={styles.calendarBlock}>
          <ThemedText style={[styles.hint, { color: colors.icon }]}>
            {Strings.company.dateRangeCalendarHint}
          </ThemedText>
          <Calendar
            markingType="period"
            markedDates={marked}
            onDayPress={disabled ? undefined : onDayPress}
            enableSwipeMonths
            theme={{
              backgroundColor: colors.background,
              calendarBackground: colors.background,
              textSectionTitleColor: colors.icon,
              dayTextColor: colors.text,
              textDisabledColor: colors.icon + '66',
              monthTextColor: colors.text,
              arrowColor: tint,
              todayTextColor: tint,
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, width: '100%' },
  row: { flexDirection: 'row', gap: 10 },
  rowSingle: { flexDirection: 'row' },
  halfBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halfBtnText: { fontSize: 13, fontWeight: '600', lineHeight: 18, textAlign: 'center' },
  calendarBlock: { marginTop: 4, width: '100%' },
  hint: { fontSize: 12, marginBottom: 8, textAlign: 'center' },
});
