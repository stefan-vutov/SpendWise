import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_LABELS, Category, ReasonablePersonCheck, Verdict } from '../domain/types';
import { REASONABLE_PERSON_QUESTIONS, VERDICT_COPY, buildCheck, categoryForVerdict } from '../domain/assessment';
import { assessItem } from '../services/api';
import { hasServer, useStore } from '../store';
import { Button, colors, money } from '../components/ui';

const ORDER: Verdict[] = ['justified', 'borderline', 'not_justified'];

/** Combine the person's own answers with the AI's view — the more cautious one wins, by one step at most. */
function combine(self: Verdict, ai?: Verdict): Verdict {
  if (!ai) return self;
  const a = ORDER.indexOf(self);
  const b = ORDER.indexOf(ai);
  return b > a ? ORDER[a + 1] : self;
}

export function ReasonablePersonModal(props: {
  visible: boolean;
  itemName: string;
  price: number;
  notes?: string;
  chosen: Category;
  onCancel: () => void;
  onDecide: (category: Category, check: ReasonablePersonCheck) => void;
}) {
  const settings = useStore((s) => s.settings);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [ai, setAi] = useState<{ verdict: Verdict; challenge: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(hasServer(settings));

  useEffect(() => {
    if (!hasServer(settings)) return;
    let live = true;
    assessItem(settings, { name: props.itemName, price: props.price, notes: props.notes, chosenCategory: props.chosen })
      .then((r) => live && setAi(r.reasonablePerson ?? null))
      .finally(() => live && setAiLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const complete = REASONABLE_PERSON_QUESTIONS.every((q) => q.id in answers);
  const check = complete ? buildCheck(answers) : null;
  const verdict = check ? combine(check.verdict, ai?.verdict) : null;
  const recommended = verdict ? categoryForVerdict(props.chosen, verdict) : null;

  return (
    <Modal visible={props.visible} animationType="fade" transparent onRequestClose={props.onCancel}>
      <View style={st.backdrop}>
        <View style={st.sheet}>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <Text style={st.title}>Would a reasonable person need this?</Text>
            <Text style={st.muted}>
              You put <Text style={st.bold}>{props.itemName}</Text> ({money(props.price, settings.currency)}) in{' '}
              <Text style={st.bold}>{CATEGORY_LABELS[props.chosen]}</Text>. Take 20 seconds to be honest with yourself.
            </Text>

            <View style={st.aiBox}>
              {aiLoading ? (
                <ActivityIndicator />
              ) : ai?.challenge ? (
                <Text style={st.aiText}>💭 {ai.challenge}</Text>
              ) : (
                <Text style={st.muted}>Answer the questions below.</Text>
              )}
            </View>

            {REASONABLE_PERSON_QUESTIONS.map((q) => (
              <View key={q.id} style={st.q}>
                <Text style={st.qText}>{q.text}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[true, false].map((v) => (
                    <Pressable
                      key={String(v)}
                      onPress={() => setAnswers((a) => ({ ...a, [q.id]: v }))}
                      style={[st.yn, answers[q.id] === v && st.ynActive]}
                    >
                      <Text style={[st.ynText, answers[q.id] === v && { color: '#fff' }]}>{v ? 'Yes' : 'No'}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}

            {verdict && recommended && check && (
              <View style={[st.verdict, verdict === 'justified' ? st.ok : st.warn]}>
                <Text style={st.bold}>{VERDICT_COPY[verdict].title}</Text>
                <Text style={st.muted}>{VERDICT_COPY[verdict].body}</Text>
              </View>
            )}

            {check && recommended && verdict && (
              <View style={{ gap: 8 }}>
                {recommended !== props.chosen && (
                  <Button
                    title={`Put it in ${CATEGORY_LABELS[recommended]}`}
                    onPress={() => props.onDecide(recommended, { ...check, verdict })}
                  />
                )}
                <Button
                  title={`Keep in ${CATEGORY_LABELS[props.chosen]}`}
                  kind={recommended === props.chosen ? 'primary' : 'secondary'}
                  onPress={() => props.onDecide(props.chosen, { ...check, verdict })}
                />
              </View>
            )}
            <Button title="Back" kind="ghost" onPress={props.onCancel} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '92%' },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  muted: { color: colors.muted, fontSize: 14 },
  bold: { fontWeight: '700', color: colors.text },
  aiBox: { backgroundColor: '#F5F3FF', borderRadius: 12, padding: 12, minHeight: 44, justifyContent: 'center' },
  aiText: { color: '#5B21B6', fontSize: 15 },
  q: { gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.border },
  qText: { fontSize: 15, color: colors.text },
  yn: { paddingVertical: 8, paddingHorizontal: 22, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  ynActive: { backgroundColor: colors.text, borderColor: colors.text },
  ynText: { fontWeight: '600', color: colors.text },
  verdict: { borderRadius: 12, padding: 12, gap: 4 },
  ok: { backgroundColor: colors.dealBg },
  warn: { backgroundColor: colors.warnBg },
});
