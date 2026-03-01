import { Stack } from 'expo-router';
import { CartProvider } from '@/contexts/cart-context';

export default function CompanyIdLayout() {
  return (
    <CartProvider>
      <Stack screenOptions={{ headerBackTitle: '' }} />
    </CartProvider>
  );
}
