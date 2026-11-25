import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CATEGORIES, CATEGORY_LABELS, Item } from '../domain/types';
import { computeTotals, daysOnList, isStale, staleItems } from '../domain/logic';
import { hasServer, useStore } from '../store';
import { runChecks } from '../services/background';
import { Button, Card, categoryColors, colors, money } from '../components/ui';
import { AddItemModal } from './AddItemModal';
import { SettingsModal } from './SettingsModal';
import { DowngradeReviewModal } from './DowngradeReviewModal';
import { ItemActionsModal } from './ItemActionsModal';

export function HomeScreen() {
  const items = useStore((s) => s.items);
  const settings = useStore((s) => s.settings);
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [showPurchased, setShowPurchased] = useState(false);

  const active = items.filter((i) => !i.purchasedAt);
  const purchased = items.filter((i) => i.purchasedAt);
  const totals = useMemo(() => computeTotals(items), [items]);
  const stale = staleItems(items, settings.staleThreshold);
  const deals = active.filter((i) => i.sale && !i.sale.dismissed);
  const selected = items.find((i) => i.id === selectedId) ?? null;

  // Prompt for downgrades whenever the app comes to the foreground; run due scans too.
  useEffect(() => {
    const check = () => {
      if (staleItems(useStore.getState().items, useStore.getState().settings.staleThreshold).length) setReviewing(true);
      runChecks().catch(() => {});
    };
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, []);

  async function scanNow() {
    setScanning(true);
    try {
      const r = await runChecks({ force: true });
      Alert.alert(
        'Scan complete',
        r.deals.length ? `Found ${r.deals.length} new deal(s) on your list.` : `Checked ${r.scanned} item(s). No new price drops.`,
      );
    } catch (e) {
      Alert.alert('Scan failed', `Couldn't reach the price service (${settings.apiBaseUrl}). Check Settings → Server.`);
    } finally {
      setScanning(false);
    }
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.header}>
        <Text style={st.appTitle}>SpendWise</Text>
        <Pressable onPress={() => setSettingsOpen(true)} accessibilityLabel="Settings" hitSlop={12}>
          <Text style={st.gear}>⚙︎</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
        <Card>
          <Text style={st.muted}>Planned spending · {totals.overall.count} items</Text>
          <Text style={st.grand}>{money(totals.overall.total, settings.currency)}</Text>
          <View style={st.bar}>
            {CATEGORIES.map((c) =>
              totals.byCategory[c].total > 0 ? (
                <View key={c} style={{ flex: totals.byCategory[c].total, backgroundColor: categoryColors[c] }} />
              ) : null,
            )}
          </View>
          <View style={st.legend}>
            {CATEGORIES.map((c) => (
              <View key={c} style={st.legendItem}>
                <View style={[st.dot, { backgroundColor: categoryColors[c] }]} />
                <Text style={st.legendText}>
                  {CATEGORY_LABELS[c]}: {money(totals.byCategory[c].total, settings.currency)}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {stale.length > 0 && (
          <Pressable style={[st.banner, { backgroundColor: colors.warnBg }]} onPress={() => setReviewing(true)}>
            <Text style={[st.bannerText, { color: colors.warn }]}>
              ⏳ {stale.length} item{stale.length > 1 ? 's have' : ' has'} been in Need/Must a while. Tap to review.
            </Text>
          </Pressable>
        )}
        {deals.length > 0 && (
          <View style={[st.banner, { backgroundColor: colors.dealBg }]}>
            <Text style={[st.bannerText, { color: colors.success }]}>
              🏷️ {deals.length} item{deals.length > 1 ? 's are' : ' is'} cheaper than your price right now.
            </Text>
          </View>
        )}

        {active.length === 0 && (
          <Card>
            <Text style={st.emptyTitle}>Your plan is empty</Text>
            <Text style={st.muted}>
              Add things you're thinking of buying. We'll help you sort needs from wants, watch for sales, and nudge you
              when a "need" turns out not to be one.
            </Text>
          </Card>
        )}

        {CATEGORIES.map((c) => {
          const list = active.filter((i) => i.category === c);
          if (!list.length) return null;
          return (
            <View key={c} style={{ gap: 8 }}>
              <View style={st.sectionHead}>
                <View style={[st.dot, { backgroundColor: categoryColors[c] }]} />
                <Text style={st.sectionTitle}>{CATEGORY_LABELS[c]}</Text>
                <Text style={st.sectionTotal}>{money(totals.byCategory[c].total, settings.currency)}</Text>
              </View>
              {list.map((item) => (
                <ItemRow key={item.id} item={item} currency={settings.currency} stale={isStale(item, settings.staleThreshold)} onPress={() => setSelectedId(item.id)} />
              ))}
            </View>
          );
        })}

        {active.length > 0 && hasServer(settings) && (
          <Button
            title={scanning ? 'Checking stores…' : 'Check prices now'}
            kind="secondary"
            onPress={scanNow}
            disabled={scanning}
          />
        )}
        {scanning && <ActivityIndicator />}
        {active.length > 0 && !hasServer(settings) && (
          <Text style={[st.muted, { textAlign: 'center' }]}>
            Tip: tap an item, then “Search stores” to compare prices for free.
          </Text>
        )}

        {purchased.length > 0 && (
          <Pressable onPress={() => setShowPurchased((v) => !v)}>
            <Text style={st.link}>{showPurchased ? 'Hide' : 'Show'} purchased ({purchased.length})</Text>
          </Pressable>
        )}
        {showPurchased &&
          purchased.map((item) => (
            <ItemRow key={item.id} item={item} currency={settings.currency} stale={false} onPress={() => setSelectedId(item.id)} />
          ))}
      </ScrollView>

      <Pressable style={st.fab} onPress={() => setAdding(true)} accessibilityLabel="Add item">
        <Text style={st.fabText}>＋ Add item</Text>
      </Pressable>

      <AddItemModal visible={adding} onClose={() => setAdding(false)} />
      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <DowngradeReviewModal visible={reviewing && !adding && !settingsOpen} onClose={() => setReviewing(false)} />
      <ItemActionsModal item={selected} onClose={() => setSelectedId(null)} />
    </SafeAreaView>
  );
}

function ItemRow({ item, currency, stale, onPress }: { item: Item; currency: string; stale: boolean; onPress: () => void }) {
  const deal = item.sale && !item.sale.dismissed ? item.sale : null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.row, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[st.rowTitle, item.purchasedAt && st.strike]}>{item.name}</Text>
        <Text style={st.rowMeta}>
          {item.purchasedAt ? `Bought ${new Date(item.purchasedAt).toLocaleDateString()}` : `${daysOnList(item)}d on list`}
          {stale ? ' · review due' : ''}
        </Text>
        {deal && (
          <Text style={st.dealText}>
            {deal.bestOffer.store}: {money(deal.bestOffer.price, deal.bestOffer.currency)} (save {money(deal.savings, currency)})
          </Text>
        )}
      </View>
      <Text style={st.rowPrice}>{money(item.price, currency)}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  appTitle: { fontSize: 26, fontWeight: '800', color: colors.text },
  gear: { fontSize: 26, color: colors.muted },
  muted: { color: colors.muted, fontSize: 14 },
  grand: { fontSize: 34, fontWeight: '800', color: colors.text, marginVertical: 6 },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.border, gap: 2 },
  legend: { marginTop: 12, gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendText: { fontSize: 14, color: colors.text },
  dot: { width: 10, height: 10, borderRadius: 5 },
  banner: { borderRadius: 12, padding: 12 },
  bannerText: { fontWeight: '600', fontSize: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4, color: colors.text },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, flex: 1 },
  sectionTotal: { fontSize: 15, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 12 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.muted },
  rowPrice: { fontSize: 16, fontWeight: '700', color: colors.text },
  strike: { textDecorationLine: 'line-through', color: colors.muted },
  dealText: { fontSize: 13, color: colors.success, fontWeight: '600' },
  link: { color: colors.primary, textAlign: 'center', padding: 8 },
  fab: { position: 'absolute', right: 20, bottom: 34, backgroundColor: colors.primary, borderRadius: 28, paddingVertical: 16, paddingHorizontal: 22, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
