import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Category, Item, Offer, ReasonablePersonCheck, Settings, Assessment } from './domain/types';
import { bestDeal, moveToCategory, nextCategoryDown, round2 } from './domain/logic';

export interface NewItem {
  name: string;
  price: number;
  notes?: string;
  category: Category;
  assessment?: Assessment;
  check?: ReasonablePersonCheck;
}

interface State {
  items: Item[];
  settings: Settings;
  addItem: (input: NewItem) => Item;
  updateItem: (id: string, patch: Partial<Omit<Item, 'id'>>) => void;
  setCategory: (id: string, category: Category, check?: ReasonablePersonCheck) => void;
  downgrade: (id: string) => void;
  keepInCategory: (id: string) => void;
  markPurchased: (id: string) => void;
  removeItem: (id: string) => void;
  dismissSale: (id: string) => void;
  /** Applies scan results; returns the items that newly got a deal. */
  applyScan: (results: { id: string; offers: Offer[] }[], at: Date) => Item[];
  updateSettings: (patch: Partial<Settings>) => void;
}

const defaultSettings: Settings = {
  country: 'US',
  currency: 'USD',
  scanFrequency: 'weekly',
  includeInternational: true,
  staleThreshold: '1m',
  // Empty = free mode: everything runs on the phone, no AI or automatic price scanning.
  apiBaseUrl: (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? '',
};

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      items: [],
      settings: defaultSettings,

      addItem: (input) => {
        const now = new Date().toISOString();
        const item: Item = {
          id: uid(),
          name: input.name.trim(),
          notes: input.notes?.trim() || undefined,
          price: round2(input.price),
          category: input.category,
          createdAt: now,
          categoryEnteredAt: now,
          assessment: input.assessment,
          check: input.check,
        };
        set((s) => ({ items: [item, ...s.items] }));
        return item;
      },

      updateItem: (id, patch) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),

      setCategory: (id, category, check) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id ? { ...moveToCategory(i, category), ...(check ? { check } : {}) } : i,
          ),
        })),

      downgrade: (id) =>
        set((s) => ({
          items: s.items.map((i) => {
            if (i.id !== id) return i;
            const next = nextCategoryDown(i.category);
            return next ? moveToCategory(i, next) : i;
          }),
        })),

      keepInCategory: (id) => get().updateItem(id, { lastReviewedAt: new Date().toISOString() }),

      markPurchased: (id) => get().updateItem(id, { purchasedAt: new Date().toISOString() }),

      removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

      dismissSale: (id) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === id && i.sale ? { ...i, sale: { ...i.sale, dismissed: true } } : i)),
        })),

      applyScan: (results, at) => {
        const fresh: Item[] = [];
        const byId = new Map(results.map((r) => [r.id, r.offers]));
        set((s) => ({
          settings: { ...s.settings, lastScanAt: at.toISOString() },
          items: s.items.map((item) => {
            const offers = byId.get(item.id);
            if (!offers) return item;
            const deal = bestDeal(item, offers);
            if (!deal) return { ...item, sale: undefined };
            // Re-alert only if the price dropped further than what we already showed.
            const isNew = !item.sale || deal.price < item.sale.bestOffer.price;
            const updated: Item = {
              ...item,
              sale: {
                bestOffer: deal,
                foundAt: at.toISOString(),
                savings: round2(item.price - deal.price),
                dismissed: isNew ? false : item.sale?.dismissed,
              },
            };
            if (isNew) fresh.push(updated);
            return updated;
          }),
        }));
        return fresh;
      },

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
    }),
    {
      name: 'spendwise-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Pick<State, 'items' | 'settings'>;
        // v1 defaulted to a localhost server that phones can't reach; switch those to free mode.
        if (version < 2 && state?.settings?.apiBaseUrl === 'http://localhost:8787') {
          state.settings.apiBaseUrl = '';
        }
        return state as State;
      },
    },
  ),
);

/**
 * SpendWise Pro = AI suggestions + automatic price checks. Both cost money per use, so they need
 * the hosted server AND a paid unlock. Free users get everything else, fully on-device.
 * Development builds skip the payment check so the paid features can be tested.
 */
export const proActive = (s: Settings) =>
  s.apiBaseUrl.trim().length > 0 && (s.proUnlocked === true || __DEV__);

/** Wait until persisted state has loaded (needed in the background task). */
export function whenHydrated(): Promise<void> {
  if (useStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}
