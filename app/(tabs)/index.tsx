import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useAppTheme } from '@/contexts/theme-context';
import { useDataSource } from '@/contexts/data-source-context';
import { useCompany } from '@/contexts/company-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchCompanies } from '@/lib/api/companies';
import type { CompanyWithRole } from '@/types/company';

function CompanyCard({
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
        {company.meta.address && (
          <ThemedText style={[styles.addressText, { color: colors.icon }]} numberOfLines={1}>
            {company.meta.address}
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

export default function HomeScreen() {
  const { signOut, session } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { toggleTheme, isDark } = useAppTheme();
  const { useMockData, toggleDataSource } = useDataSource();
  const { setSelectedCompany } = useCompany();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  const [menuVisible, setMenuVisible] = useState(false);
  const [companies, setCompanies] = useState<CompanyWithRole[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCompanies = useCallback(() => {
    setLoading(true);
    fetchCompanies(useMockData)
      .then(setCompanies)
      .catch(() => setCompanies([]))
      .finally(() => setLoading(false));
  }, [useMockData]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const handleCompanyPress = useCallback(
    (company: CompanyWithRole) => {
      setSelectedCompany(company);
      router.push(`/company/${company.id}` as any);
    },
    [setSelectedCompany, router],
  );

  const handleLogout = useCallback(async () => {
    setMenuVisible(false);
    await signOut();
  }, [signOut]);

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => setMenuVisible(true)} hitSlop={12}>
          <IconSymbol name="line.3.horizontal" size={26} color={colors.text} />
        </Pressable>
        <ThemedText type="subtitle" style={styles.headerTitle}>Your Schools</ThemedText>
        <Pressable onPress={loadCompanies} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.5 }}>
          <IconSymbol name="arrow.clockwise" size={22} color={colors.text} />
        </Pressable>
      </View>

      {/* Company List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : companies.length === 0 ? (
        <View style={styles.center}>
          <ThemedText style={{ color: colors.icon }}>No companies yet</ThemedText>
        </View>
      ) : (
        <FlatList
          data={companies}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <CompanyCard
              company={item}
              onPress={() => handleCompanyPress(item)}
              colors={colors}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Hamburger Menu */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setMenuVisible(false)}>
          <View
            style={[
              styles.menu,
              {
                backgroundColor: colors.background,
                paddingTop: insets.top + 12,
              },
            ]}
          >
            <View style={styles.menuHeader}>
              <ThemedText type="subtitle">Menu</ThemedText>
              <Pressable onPress={() => setMenuVisible(false)} hitSlop={12}>
                <IconSymbol name="xmark" size={22} color={colors.text} />
              </Pressable>
            </View>

            {/* User profile */}
            {session?.user && (
              <>
                <View style={styles.profileSection}>
                  <View style={[styles.profileAvatar, { backgroundColor: colors.tint + '18' }]}>
                    <ThemedText style={[styles.profileAvatarText, { color: colors.tint }]}>
                      {(session.user.displayName?.[0] ?? session.user.email?.[0] ?? '?').toUpperCase()}
                    </ThemedText>
                  </View>
                  <View style={styles.profileInfo}>
                    {session.user.displayName && (
                      <ThemedText type="defaultSemiBold" numberOfLines={1}>
                        {session.user.displayName}
                      </ThemedText>
                    )}
                    {session.user.email && (
                      <ThemedText style={[styles.profileDetail, { color: colors.icon }]} numberOfLines={1}>
                        {session.user.email}
                      </ThemedText>
                    )}
                    {session.user.phoneNumber && (
                      <ThemedText style={[styles.profileDetail, { color: colors.icon }]} numberOfLines={1}>
                        {session.user.phoneNumber}
                      </ThemedText>
                    )}
                  </View>
                </View>
                <View style={[styles.menuDivider, { backgroundColor: colors.icon + '25' }]} />
              </>
            )}

            {/* Theme toggle */}
            <Pressable
              onPress={toggleTheme}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { opacity: 0.6 },
              ]}
            >
              <IconSymbol
                name={isDark ? 'sun.max.fill' : 'moon.fill'}
                size={22}
                color={colors.text}
              />
              <ThemedText style={styles.menuItemText}>
                {isDark ? 'Light Mode' : 'Dark Mode'}
              </ThemedText>
            </Pressable>

            <View style={[styles.menuDivider, { backgroundColor: colors.icon + '25' }]} />

            {/* Data source toggle */}
            <View style={styles.menuItem}>
              <IconSymbol name="cloud.fill" size={22} color={colors.text} />
              <ThemedText style={[styles.menuItemText, { flex: 1 }]}>
                {useMockData ? 'Mock Data' : 'Live Data'}
              </ThemedText>
              <Switch
                value={useMockData}
                onValueChange={toggleDataSource}
                trackColor={{ false: colors.icon + '30', true: colors.tint + '60' }}
                thumbColor={useMockData ? colors.tint : '#f4f3f4'}
              />
            </View>

            <View style={[styles.menuDivider, { backgroundColor: colors.icon + '25' }]} />

            {/* Logout */}
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { opacity: 0.6 },
              ]}
            >
              <IconSymbol name="rectangle.portrait.and.arrow.right" size={22} color="#E53935" />
              <ThemedText style={styles.logoutText}>Logout</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  separator: {
    height: 12,
  },
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  menu: {
    width: '75%',
    height: '100%',
    paddingHorizontal: 20,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  logoutText: {
    fontSize: 16,
    color: '#E53935',
    fontWeight: '600',
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    marginBottom: 4,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    fontSize: 22,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  profileDetail: {
    fontSize: 13,
    lineHeight: 18,
  },
});
