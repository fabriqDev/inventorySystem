import { Stack, useLocalSearchParams } from 'expo-router';

import { CartProvider } from '@/core/context/cart-context';
import { LocalOrderDraftsProvider } from '@/core/context/local-order-drafts-context';

export default function CompanyIdLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const companyId = typeof id === 'string' ? id : '';

  return (
    <CartProvider>
      <LocalOrderDraftsProvider companyId={companyId}>
        <Stack screenOptions={{ headerBackTitle: '' }} />
      </LocalOrderDraftsProvider>
    </CartProvider>
  );
}
