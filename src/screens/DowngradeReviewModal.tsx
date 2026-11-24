import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_LABELS, STALE_THRESHOLD_LABELS } from '../domain/types';
import { daysOnList, nextCategoryDown, staleItems } from '../domain/logic';
import { useStore } from '../store';
import { Button, colors, money } from '../components/ui';

/** Walks through each Need/Must item that's been waiting longer than the person's threshold. */
export function DowngradeReviewModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const items = useStore((s) => s.items);
  const settings = useStore((s) => s.settings);
  const { downgrade, keepInCategory, markPurchased } = useStore.getState();
  const queue = staleItems(items, settings.staleThreshold);
  const item = queue[0];

  if (visible && !item) {
    // Queue emptied — close on next tick.
    setTimeout(onClose, 0);
  }

  return (
    <Modal visible={visible && !!item} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.backdrop}>
        {item && (
          <View style={st.card}>
            <Text style={st.kicker}>{queue.length} to review</Text>
            <Text style={st.title}>Do you still need “{item.name}”?</Text>
            <Text style={st.body}>
              It's been in <Text style={st.bold}>{CATEGORY_LABELS[item.category]}</Text> for {daysOnList(item)} days
              (your limit is {STALE_THRESHOLD_LABELS[settings.staleThreshold]}). If it were truly essential, you'd
              probably have bought it by now.
            </Text>
            <Text style={st.price}>{money(item.price, settings.currency)}</Text>
            <View style={{ gap: 8 }}>
              <Button
                title={`Move down to ${CATEGORY_LABELS[nextCategoryDown(item.category)!]}`}
                onPress={() => downgrade(item.id)}
              />
              <Button title="Keep it here — I still need it" kind="secondary" onPress={() => keepInCategory(item.id)} />
              <Button title="I already bought it" kind="secondary" onPress={() => markPurchased(item.id)} />
              <Button title="Later" kind="ghost" onPress={onClose} />
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 20, gap: 10 },
  kicker: { color: colors.warn, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  body: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  bold: { fontWeight: '700', color: colors.text },
  price: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 },
});
