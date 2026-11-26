import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, { CustomerInfo, PurchasesPackage, PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { useStore } from '../store';

/**
 * Spendbrake Pro subscriptions via RevenueCat, which wraps Apple's and Google's billing.
 * Public SDK keys go in app.json → expo.extra (they're safe to ship in the app).
 * With no key set, the app runs as the free version and Pro stays hidden.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as {
  revenueCatAppleKey?: string;
  revenueCatGoogleKey?: string;
};
const API_KEY = Platform.select({ ios: extra.revenueCatAppleKey, android: extra.revenueCatGoogleKey }) ?? '';
export const ENTITLEMENT = 'pro';

let configured = false;

/** True when subscriptions are set up for this build (store keys + a server to run Pro features). */
export function proForSale(): boolean {
  return !!API_KEY && !!useStore.getState().settings.apiBaseUrl.trim();
}

function applyCustomerInfo(info: CustomerInfo) {
  const active = !!info.entitlements.active[ENTITLEMENT];
  useStore.getState().updateSettings({ proUnlocked: active, manageSubscriptionUrl: info.managementURL ?? undefined });
}

export async function initPurchases() {
  if (!API_KEY || configured) return;
  try {
    Purchases.configure({ apiKey: API_KEY });
    configured = true;
    Purchases.addCustomerInfoUpdateListener(applyCustomerInfo);
    applyCustomerInfo(await Purchases.getCustomerInfo());
  } catch (e) {
    console.warn('Purchases unavailable', e);
  }
}

/** Id the server uses to look up the subscription. Falls back to a random per-install id. */
export async function getUserId(): Promise<string> {
  if (configured) {
    try {
      return await Purchases.getAppUserID();
    } catch {
      /* fall through */
    }
  }
  const s = useStore.getState();
  if (!s.settings.installId) {
    s.updateSettings({ installId: `local_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}` });
  }
  return useStore.getState().settings.installId!;
}

export async function getProPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'not_active';

export async function buy(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    applyCustomerInfo(customerInfo);
    return customerInfo.entitlements.active[ENTITLEMENT] ? 'purchased' : 'not_active';
  } catch (e) {
    if ((e as { code?: string }).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return 'cancelled';
    throw e;
  }
}

/** Required by Apple: lets people get Pro back on a new phone or after reinstalling. */
export async function restore(): Promise<boolean> {
  if (!configured) return false;
  const info = await Purchases.restorePurchases();
  applyCustomerInfo(info);
  return !!info.entitlements.active[ENTITLEMENT];
}
