import React, { useState } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CATEGORIES, CATEGORY_LABELS, Category, Item } from '../domain/types';
import { daysOnList, isProtected, isUpgrade } from '../domain/logic';
import { VERDICT_COPY } from '../domain/assessment';
import { useStore } from '../store';
import { Button, categoryColors, colors, money } from '../components/ui';
import { ReasonablePersonModal } from './ReasonablePersonModal';

export function ItemActionsModal({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const { setCategory, markPurchased, removeItem, dismissSale } = useStore.getState();
  const [checkFor, setCheckFor] = useState<Category | null>(null);

  if (!item) return null;

  function move(to: Category) {
    if (!item || to === item.category) return;
    // Moving an item UP into Need/Must re-triggers the reasonable-person check.
    if (isProtected(to) && isUpgrade(item.category, to)) setCheckFor(to);
    else { setCategory(item.id, to); onClose(); }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose}>
        <Pressable style={st.sheet} onPress={() => {}}>
          <Text style={st.title}>{item.name}</Text>
          <Text style={st.muted}>
            {money(item.price, settings.currency)} · {daysOnList(item)} days in {CATEGORY_LABELS[item.category]}
          </Text>
          {item.notes ? <Text style={st.muted}>{item.notes}</Text> : null}
          {item.check && (
            <Text style={st.muted}>Your check: {VERDICT_COPY[item.check.verdict].title.toLowerCase()}</Text>
          )}

          {item.sale && (
            <View style={st.deal}>
              <Text style={st.bold}>
                {item.sale.bestOffer.store}: {money(item.sale.bestOffer.price, item.sale.bestOffer.currency)}
                {item.sale.bestOffer.onSale ? ' (on sale)' : ''}
              </Text>
              <Text style={st.muted}>
                {money(item.sale.savings, settings.currency)} below your price · found {new Date(item.sale.foundAt).toLocaleDateString()}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                {item.sale.bestOffer.url && (
                  <Button title="Open store" onPress={() => Linking.openURL(item.sale!.bestOffer.url!)} style={{ flex: 1 }} />
                )}
                {!item.sale.dismissed && (
                  <Button title="Dismiss" kind="secondary" onPress={() => dismissSale(item.id)} style={{ flex: 1 }} />
                )}
              </View>
            </View>
          )}

          <Text style={st.section}>Move to</Text>
          <View style={st.cats}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => move(c)}
                style={[st.cat, { borderColor: categoryColors[c] }, c === item.category && { backgroundColor: categoryColors[c] }]}
              >
                <Text style={[st.catText, { color: c === item.category ? '#fff' : categoryColors[c] }]}>{CATEGORY_LABELS[c]}</Text>
              </Pressable>
            ))}
          </View>

          <Button title="Mark as purchased" onPress={() => { markPurchased(item.id); onClose(); }} />
          <Button
            title="Remove from list"
            kind="ghost"
            onPress={() =>
              Alert.alert('Remove item?', `"${item.name}" will be deleted.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => { removeItem(item.id); onClose(); } },
              ])
            }
          />
        </Pressable>
      </Pressable>

      {checkFor && (
        <ReasonablePersonModal
          visible
          itemName={item.name}
          price={item.price}
          notes={item.notes}
          chosen={checkFor}
          onCancel={() => setCheckFor(null)}
          onDecide={(final, check) => { setCategory(item.id, final, check); setCheckFor(null); onClose(); }}
        />
      )}
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10, paddingBottom: 34 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  muted: { color: colors.muted, fontSize: 14 },
  bold: { fontWeight: '700', color: colors.text },
  deal: { backgroundColor: colors.dealBg, borderRadius: 12, padding: 12, gap: 2 },
  section: { fontWeight: '700', color: colors.text, marginTop: 6 },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  cat: { borderWidth: 1.5, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 12 },
  catText: { fontWeight: '600', fontSize: 13 },
});
