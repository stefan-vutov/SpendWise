import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { useStore, whenHydrated } from '../store';
import { scanPrices } from './api';
import { isScanDue, staleItems } from '../domain/logic';
import { CATEGORY_LABELS, Item } from '../domain/types';

export const SCAN_TASK = 'spendwise-price-scan';
const DAY = 24 * 60 * 60 * 1000;

/**
 * Runs a price scan if one is due (or when forced from the UI) and checks for items
 * that have sat in Need/Must too long. Safe to call from foreground or background.
 */
export async function runChecks(opts: { force?: boolean } = {}): Promise<{ scanned: number; deals: Item[] }> {
  await whenHydrated();
  const { items, settings, applyScan, updateSettings } = useStore.getState();
  let deals: Item[] = [];
  let scanned = 0;

  const active = items.filter((i) => !i.purchasedAt);
  if (active.length && (opts.force || isScanDue(settings.scanFrequency, settings.lastScanAt))) {
    const results = await scanPrices(settings, active);
    // Only compare like with like — ignore offers in a different currency.
    const sameCurrency = results.map((r) => ({
      id: r.id,
      offers: r.offers.filter((o) => o.currency.toUpperCase() === settings.currency.toUpperCase()),
    }));
    deals = applyScan(sameCurrency, new Date());
    scanned = active.length;
    for (const d of deals.slice(0, 3)) {
      await notify(
        `Price drop: ${d.name}`,
        `${d.sale!.bestOffer.store} has it for ${fmt(d.sale!.bestOffer.price, settings.currency)} — ${fmt(d.sale!.savings, settings.currency)} below your price.`,
      );
    }
    if (deals.length > 3) await notify('More deals found', `${deals.length - 3} more items on your list are cheaper now.`);
  }

  // Downgrade reminders: at most once a day.
  const stale = staleItems(useStore.getState().items, settings.staleThreshold);
  const lastNotify = settings.lastStaleNotifyAt ? Date.parse(settings.lastStaleNotifyAt) : 0;
  if (stale.length && Date.now() - lastNotify > DAY) {
    const first = stale[0];
    await notify(
      'Still need it?',
      stale.length === 1
        ? `"${first.name}" has been in ${CATEGORY_LABELS[first.category]} a while. Time to move it down?`
        : `${stale.length} items have been in Need/Must a while. Review them?`,
    );
    updateSettings({ lastStaleNotifyAt: new Date().toISOString() });
  }

  return { scanned, deals };
}

function fmt(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

async function notify(title: string, body: string) {
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch {
    // Notifications not permitted — the in-app banners still show the information.
  }
}

// Must be defined at module scope so the OS can run it while the app is closed.
TaskManager.defineTask(SCAN_TASK, async () => {
  try {
    await runChecks();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Registers the periodic background task. The OS decides the exact timing (typically
 * every few hours at best); runChecks() itself enforces the person's daily/weekly choice.
 */
export async function registerBackgroundChecks() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (!(await TaskManager.isTaskRegisteredAsync(SCAN_TASK))) {
      await BackgroundTask.registerTaskAsync(SCAN_TASK, { minimumInterval: 6 * 60 }); // minutes
    }
  } catch {
    // Unsupported (e.g. web or Expo Go) — foreground checks on app open still run.
  }
}

export async function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  try {
    await Notifications.requestPermissionsAsync();
  } catch {
    /* ignore */
  }
}
