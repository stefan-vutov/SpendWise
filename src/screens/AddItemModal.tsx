import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { CATEGORIES, CATEGORY_HINTS, CATEGORY_LABELS, Category, ReasonablePersonCheck } from '../domain/types';
import { isProtected } from '../domain/logic';
import { localAssess } from '../domain/assessment';
import { AiAssessment, assessItem } from '../services/api';
import { useStore } from '../store';
import { Button, categoryColors, colors } from '../components/ui';
import { ReasonablePersonModal } from './ReasonablePersonModal';

export function AddItemModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const addItem = useStore((s) => s.addItem);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [assessment, setAssessment] = useState<AiAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const reqId = useRef(0);

  const priceNum = parseFloat(price.replace(',', '.'));
  const valid = name.trim().length > 1 && Number.isFinite(priceNum) && priceNum > 0;

  useEffect(() => {
    if (!visible) {
      setName(''); setPrice(''); setNotes(''); setCategory(null); setAssessment(null); setChecking(false);
    }
  }, [visible]);

  // Debounced smart suggestion: instant local guess, then the AI answer replaces it.
  useEffect(() => {
    if (!valid) { setAssessment(null); return; }
    setAssessment(localAssess(name, priceNum));
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await assessItem(settings, { name, price: priceNum, notes });
      if (id === reqId.current) { setAssessment(r); setLoading(false); }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, price, notes]);

  const chosen = category ?? assessment?.suggestedCategory ?? null;

  function save(final: Category, check?: ReasonablePersonCheck) {
    addItem({ name, price: priceNum, notes, category: final, assessment: assessment ?? undefined, check });
    onClose();
  }

  function onSavePress() {
    if (!chosen) return;
    if (isProtected(chosen)) setChecking(true); // Need/Must → reasonable person check first
    else save(chosen);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={st.header}>
          <Pressable onPress={onClose}><Text style={st.link}>Cancel</Text></Pressable>
          <Text style={st.title}>Add to plan</Text>
          <View style={{ width: 50 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={st.label}>What do you want to buy?</Text>
            <TextInput style={st.input} value={name} onChangeText={setName} placeholder="e.g. Winter boots" autoFocus />
          </View>
          <View>
            <Text style={st.label}>Price you'd pay / found in store ({settings.currency})</Text>
            <TextInput style={st.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00" />
          </View>
          <View>
            <Text style={st.label}>Notes (optional — model, size, why you want it)</Text>
            <TextInput style={[st.input, { minHeight: 60 }]} value={notes} onChangeText={setNotes} multiline />
          </View>

          {assessment && (
            <View style={st.suggest}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={st.suggestTitle}>
                  Suggested: {CATEGORY_LABELS[assessment.suggestedCategory]}
                </Text>
                {loading && <ActivityIndicator size="small" />}
              </View>
              <Text style={st.muted}>{assessment.reasoning}</Text>
              <Text style={st.tiny}>{assessment.source === 'ai' ? 'Smart assessment' : 'Quick on-device guess'}</Text>
            </View>
          )}

          <Text style={st.label}>Category</Text>
          {CATEGORIES.map((c) => {
            const active = chosen === c;
            return (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={[st.cat, active && { borderColor: categoryColors[c], backgroundColor: '#fff' }]}
              >
                <View style={[st.dot, { backgroundColor: categoryColors[c] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[st.catTitle, active && { color: categoryColors[c] }]}>
                    {CATEGORY_LABELS[c]}{assessment?.suggestedCategory === c ? '  · suggested' : ''}
                  </Text>
                  <Text style={st.muted}>{CATEGORY_HINTS[c]}</Text>
                </View>
              </Pressable>
            );
          })}

          <Button title="Save" onPress={onSavePress} disabled={!valid || !chosen} style={{ marginTop: 8 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {checking && chosen && (
        <ReasonablePersonModal
          visible
          itemName={name}
          price={priceNum}
          notes={notes}
          chosen={chosen}
          onCancel={() => setChecking(false)}
          onDecide={(final, check) => { setChecking(false); save(final, check); }}
        />
      )}
    </Modal>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  link: { color: colors.primary, fontSize: 16 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16 },
  suggest: { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, gap: 4 },
  suggestTitle: { fontWeight: '700', color: colors.primary },
  muted: { color: colors.muted, fontSize: 13 },
  tiny: { color: colors.muted, fontSize: 11 },
  cat: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: '#FAFAFA' },
  catTitle: { fontWeight: '700', fontSize: 15, color: colors.text },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
