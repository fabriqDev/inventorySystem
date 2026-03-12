import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/core/components/themed-text';
import { IconSymbol } from '@/core/components/ui/icon-symbol';
import { Colors } from '@/core/constants/theme';
import type { CompanyWithRole } from '@/core/types/company';

export function CompanyCard({
  company,
  onPress,
  colors,
}: {
  company: CompanyWithRole;
  onPress: () => void;
  colors: (typeof Colors)['light'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.background, borderColor: colors.icon + '30' },
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.tint + '18' }]}>
        <ThemedText style={[styles.avatarText, { color: colors.tint }]}>
          {company.name.charAt(0)}
        </ThemedText>
      </View>
      <View style={styles.cardContent}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {company.name}
        </ThemedText>
        {(company.address ?? company.meta?.address) && (
          <ThemedText style={[styles.addressText, { color: colors.icon }]} numberOfLines={1}>
            {company.address ?? company.meta?.address}
          </ThemedText>
        )}
        <View style={[styles.roleBadge, { backgroundColor: colors.tint + '15' }]}>
          <ThemedText style={[styles.roleText, { color: colors.tint }]}>
            {company.role.replace('_', ' ')}
          </ThemedText>
        </View>
      </View>
      <IconSymbol name="chevron.right" size={20} color={colors.icon} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardPressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
  },
  cardContent: {
    flex: 1,
    marginLeft: 14,
    gap: 3,
  },
  addressText: {
    fontSize: 13,
    lineHeight: 18,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
