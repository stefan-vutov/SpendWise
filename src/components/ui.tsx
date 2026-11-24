import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Category } from '../domain/types';

export const colors = {
  bg: '#F6F7F9',
  card: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
  border: '#E5E7EB',
  primary: '#2563EB',
  danger: '#DC2626',
  success: '#059669',
  warn: '#B45309',
  warnBg: '#FEF3C7',
  dealBg: '#D1FAE5',
};

export const categoryColors: Record<Category, string> = {
  need: '#DC2626',
  must: '#EA580C',
  good: '#2563EB',
  nice: '#7C3AED',
};

export function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg = { primary: colors.primary, secondary: '#E5E7EB', danger: colors.danger, ghost: 'transparent' }[kind];
  const fg = kind === 'secondary' || kind === 'ghost' ? colors.text : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }, style]}
    >
      <Text style={[s.btnText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <View style={s.seg}>
      {options.map((o) => (
        <Pressable
          key={o}
          onPress={() => onChange(o)}
          accessibilityRole="button"
          accessibilityState={{ selected: o === value }}
          style={[s.segItem, o === value && s.segItemActive]}
        >
          <Text style={[s.segText, o === value && s.segTextActive]}>{labels?.[o] ?? o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

const s = StyleSheet.create({
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
  btnText: { fontSize: 16, fontWeight: '600' },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segItem: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  segItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segText: { color: colors.text, fontSize: 14 },
  segTextActive: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border },
});
