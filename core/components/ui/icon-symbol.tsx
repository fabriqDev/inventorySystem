// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.left': 'chevron-left',
  'chevron.right': 'chevron-right',
  'line.3.horizontal': 'menu',
  'rectangle.portrait.and.arrow.right': 'logout',
  'building.2': 'business',
  'xmark': 'close',
  'safari': 'explore',
  'sun.max.fill': 'light-mode',
  'moon.fill': 'dark-mode',
  'archivebox.fill': 'inventory',
  'chart.bar.fill': 'bar-chart',
  'cart.fill': 'shopping-cart',
  'magnifyingglass': 'search',
  'barcode.viewfinder': 'qr-code-scanner',
  'trash': 'delete',
  'plus': 'add',
  'minus': 'remove',
  'cloud.fill': 'cloud',
  'checkmark.circle.fill': 'check-circle',
  'xmark.circle.fill': 'cancel',
  'clock.fill': 'schedule',
  'bag.fill': 'shopping-bag',
  'arrow.clockwise': 'refresh',
  'plus.circle.fill': 'add-circle',
  'arrow.uturn.backward.circle': 'undo',
  'shippingbox.fill': 'local-shipping',
  'shippingbox': 'inventory-2',
  'arrow.right': 'arrow-forward',
  'chevron.down': 'keyboard-arrow-down',
  'banknote': 'payments',
  'creditcard': 'credit-card',
  'printer.fill': 'print',
  'line.3.horizontal.decrease.circle': 'filter-list',
  'list.bullet.clipboard.fill': 'assignment',
  'slash.circle': 'block',
  'square.and.arrow.down': 'download',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
