import { Stack } from 'expo-router';
import { CartProvider } from '@/core/context/cart-context';

export default function CompanyIdLayout() {
  return (
    <CartProvider>
      <Stack screenOptions={{ headerBackTitle: '' }} />
    </CartProvider>
  );
}
