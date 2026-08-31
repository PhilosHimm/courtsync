'use client';

import { createContext, useContext, useState } from 'react';
import type { StorageAdapter } from '@/lib/storage';
import { LocalStorageAdapter } from '@/lib/storage';

/**
 * Dependency injection for the data layer, as a context.
 *
 * Components never touch `localStorage`; they ask this context for a
 * `StorageAdapter` and call its methods. Swapping the app onto a server
 * adapter later means changing the default here — one line — and nothing in
 * any component.
 */

const StorageContext = createContext<StorageAdapter | null>(null);

export function StorageProvider({
  adapter,
  children,
}: {
  /** Override for tests or a future server adapter. */
  adapter?: StorageAdapter;
  children: React.ReactNode;
}) {
  // Lazy init so the adapter is constructed once, on the client.
  const [defaultAdapter] = useState<StorageAdapter>(() => adapter ?? new LocalStorageAdapter());
  return <StorageContext.Provider value={defaultAdapter}>{children}</StorageContext.Provider>;
}

export function useStorage(): StorageAdapter {
  const adapter = useContext(StorageContext);
  if (!adapter) {
    throw new Error('useStorage must be used inside <StorageProvider>.');
  }
  return adapter;
}
