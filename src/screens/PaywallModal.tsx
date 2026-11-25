import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import type { PurchasesPackage } from 'react-native-purchases';
import { buy, getProPackages, proForSale, restore } from '../services/purchases';
import { Button, colors } from '../components/ui';

const FEATURES = [
  ['🏷️', 'Sale alerts', 'We check major stores in your country (and big online retailers) and tell you when something on your list drops below your price.'],
  ['📅', 'Daily or weekly checks', 'Up to 100 item price checks a month — e.g. 25 items checked every week.'],
  ['🧠', 'Smarter suggestions', 'AI category suggestions and a personal “do you really need it?” question.'],
] as const;

const extra = (Constants.expoConfig?.extra ?? {}) as { termsUrl?: string; privacyUrl?: string };

function periodLabel(pkg: PurchasesPackage) {
  switch (pkg.packageType) {
    case 'ANNUAL':
      return 'per year';
    case 'MONTHLY':
      return 'per month';
    default:
      return pkg.product.title;
  }
}

export function PaywallModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const forSale = proForSale();

  useEffect(() => {
    if (!visible || !forSale) return;
    getProPackages()
      .then(setPackages)
      .catch(() => setPackages([]));
  }, [visible, forSale]);

  async function onBuy(pkg: PurchasesPackage) {
    setBusy(true);
    try {
      const r = await buy(pkg);
      if (r === 'purchased') {
        Alert.alert('Welcome to SpendWise Pro', 'Sale alerts are on. Set daily or weekly checks in Settings.');
        onClose();
      }
    } catch {
      Alert.alert('Purchase failed', 'Nothing was charged. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    setBusy(true);
    try {
      const ok = await restore();
      Alert.alert(ok ? 'Pro restored' : 'No subscription found', ok ? 'Welcome back!' : 'We couldn’t find an active Pro subscription for this account.');
      if (ok) onClose();
    } catch {
      Alert.alert('Restore failed', 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={st.wrap}>
        <Pressable onPress={onClose} style={st.close} accessibilityLabel="Close">
          <Text style={st.closeText}>✕</Text>
        </Pressable>
        <Text style={st.kicker}>SpendWise Pro</Text>
        <Text style={st.title}>Buy what you need — when it’s cheapest.</Text>

        {FEATURES.map(([icon, title, body]) => (
          <View key={title} style={st.feature}>
            <Text style={st.icon}>{icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.fTitle}>{title}</Text>
              <Text style={st.fBody}>{body}</Text>
            </View>
          </View>
        ))}

        {!forSale ? (
          <View style={st.soon}>
            <Text style={st.fTitle}>Coming soon</Text>
            <Text style={st.fBody}>Everything else in SpendWise stays free.</Text>
          </View>
        ) : packages === null || busy ? (
          <ActivityIndicator style={{ marginVertical: 24 }} />
        ) : packages.length === 0 ? (
          <Text style={st.fBody}>Subscriptions aren’t available right now. Please try again later.</Text>
        ) : (
          <View style={{ gap: 10, marginTop: 8 }}>
            {packages.map((pkg) => (
              <Button
                key={pkg.identifier}
                title={`${pkg.product.priceString} ${periodLabel(pkg)}`}
                kind={pkg.packageType === 'ANNUAL' ? 'secondary' : 'primary'}
                onPress={() => onBuy(pkg)}
              />
            ))}
            <Button title="Restore purchases" kind="ghost" onPress={onRestore} />
            <Text style={st.legal}>
              Subscriptions renew automatically until cancelled. Cancel anytime in your{' '}
              {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} account settings at least 24 hours before the period ends. Everything else in SpendWise
              stays free.
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20 }}>
              {extra.termsUrl && <Text style={st.link} onPress={() => Linking.openURL(extra.termsUrl!)}>Terms</Text>}
              {extra.privacyUrl && <Text style={st.link} onPress={() => Linking.openURL(extra.privacyUrl!)}>Privacy</Text>}
            </View>
          </View>
        )}
      </ScrollView>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 24, gap: 16, paddingBottom: 48 },
  close: { alignSelf: 'flex-end', padding: 4 },
  closeText: { fontSize: 22, color: colors.muted },
  kicker: { color: '#5B21B6', fontWeight: '800', textTransform: 'uppercase', fontSize: 13 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  feature: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  icon: { fontSize: 26 },
  fTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  fBody: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  soon: { backgroundColor: '#F5F3FF', borderRadius: 12, padding: 14, gap: 4 },
  legal: { fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 17 },
  link: { color: colors.primary, fontSize: 13 },
});
