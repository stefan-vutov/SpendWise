import React, { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { STALE_THRESHOLDS, STALE_THRESHOLD_LABELS, ScanFrequency } from '../domain/types';
import { proActive, useStore } from '../store';
import { Button, colors, Segmented } from '../components/ui';
import { estimatedMonthlyChecks } from '../domain/logic';
import { fetchUsage } from '../services/api';
import { proForSale } from '../services/purchases';
import { PaywallModal } from './PaywallModal';

const FREQS: readonly ScanFrequency[] = ['daily', 'weekly', 'off'];

export function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const activeCount = useStore((s) => s.items.filter((i) => !i.purchasedAt).length);
  const [paywall, setPaywall] = useState(false);
  const pro = proActive(settings);
  const usage = settings.usage;
  const limit = usage?.priceChecksLimit ?? 100;
  const estimate = estimatedMonthlyChecks(activeCount, settings.scanFrequency);

  // Refresh the allowance whenever Settings opens.
  useEffect(() => {
    if (visible && pro) fetchUsage(useStore.getState().settings).then((u) => u && update({ usage: u }));
  }, [visible, pro, update]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={st.header}>
        <View style={{ width: 50 }} />
        <Text style={st.title}>Settings</Text>
        <Pressable onPress={onClose}><Text style={st.link}>Done</Text></Pressable>
      </View>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 22 }}>
        <Section title="Where you shop" hint="Used to search retailers in your country and to show prices in your currency.">
          <Row label="Country code (e.g. US, GB, AU, BG)">
            <TextInput
              style={st.input}
              value={settings.country}
              autoCapitalize="characters"
              maxLength={2}
              onChangeText={(v) => update({ country: v.toUpperCase() })}
            />
          </Row>
          <Row label="Currency (e.g. USD, GBP, EUR)">
            <TextInput
              style={st.input}
              value={settings.currency}
              autoCapitalize="characters"
              maxLength={3}
              onChangeText={(v) => update({ currency: v.toUpperCase() })}
            />
          </Row>
        </Section>

        {proActive(settings) ? (
        <Section title="Sale scanning" hint="How often to check stores for price drops on your list.">
          <View style={st.switchRow}>
            <Text style={st.label}>Include international online retailers</Text>
            <Switch value={settings.includeInternational} onValueChange={(v) => update({ includeInternational: v })} />
          </View>
          <Segmented
            options={FREQS}
            value={settings.scanFrequency}
            onChange={(v) => update({ scanFrequency: v })}
            labels={{ daily: 'Daily', weekly: 'Weekly', off: 'Off' }}
          />
          {estimate > limit && (
            <Text style={st.warn}>
              {activeCount} items {settings.scanFrequency} ≈ {estimate} checks a month, more than your {limit}. The most
              important items (Need to have first) are checked first; switch to weekly to cover them all.
            </Text>
          )}
          {settings.lastScanAt && (
            <Text style={st.hint}>Last scan: {new Date(settings.lastScanAt).toLocaleString()}</Text>
          )}
        </Section>
        ) : proForSale() ? (
          <View style={st.pro}>
            <Text style={st.proTitle}>SpendWise Pro</Text>
            <Text style={st.hint}>
              Automatic price checks at major stores in your country, with an alert when something on your list goes on
              sale, plus AI category suggestions. Or tap any item and use “Search stores for this”.
            </Text>
            <Button title="See Pro" onPress={() => setPaywall(true)} />
          </View>
        ) : null}

        {pro && (
          <Section title="Your Pro plan">
            {usage ? (
              <Text style={st.label}>
                {usage.priceChecksLeft} of {usage.priceChecksLimit} price checks left this month · renews{' '}
                {new Date(usage.resetsAt).toLocaleDateString()}
              </Text>
            ) : (
              <Text style={st.hint}>Your monthly allowance appears after the first price check.</Text>
            )}
            {settings.manageSubscriptionUrl && (
              <Button title="Manage subscription" kind="secondary" onPress={() => Linking.openURL(settings.manageSubscriptionUrl!)} />
            )}
          </Section>
        )}

        <Section
          title="Ask to downgrade after"
          hint="When something sits in Need to have or Must have longer than this, we'll ask if it should move down a category."
        >
          <Segmented
            options={STALE_THRESHOLDS}
            value={settings.staleThreshold}
            onChange={(v) => update({ staleThreshold: v })}
            labels={STALE_THRESHOLD_LABELS}
          />
        </Section>

        {__DEV__ && (
        <Section title="Developer: server address" hint="Only shown in development builds. Enter a SpendWise server address to test Pro features.">
          <TextInput
            style={st.input}
            value={settings.apiBaseUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="Empty = free mode"
            onChangeText={(v) => update({ apiBaseUrl: v.trim() })}
          />
        </Section>
        )}
      </ScrollView>
      <PaywallModal visible={paywall} onClose={() => setPaywall(false)} />
    </Modal>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={st.sectionTitle}>{title}</Text>
      {hint && <Text style={st.hint}>{hint}</Text>}
      {children}
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={st.label}>{label}</Text>
      {children}
    </View>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  link: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  label: { fontSize: 14, color: colors.text, flexShrink: 1 },
  hint: { fontSize: 13, color: colors.muted },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16 },
  pro: { backgroundColor: '#F5F3FF', borderRadius: 12, padding: 14, gap: 6 },
  proTitle: { fontSize: 16, fontWeight: '800', color: '#5B21B6' },
  warn: { fontSize: 13, color: colors.warn },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
});
