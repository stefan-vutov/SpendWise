import { Assessment, Category, ReasonablePersonCheck, Verdict } from './types';

/**
 * Offline fallback classifier. The server-side AI assessment is preferred; this keeps
 * the app useful with no connection and gives an instant first guess while typing.
 */
const KEYWORDS: Record<Category, string[]> = {
  need: [
    'medicine', 'medication', 'prescription', 'insulin', 'inhaler', 'groceries', 'food',
    'formula', 'nappies', 'diapers', 'rent', 'mortgage', 'electricity', 'water bill',
    'heating', 'smoke alarm', 'first aid', 'glasses', 'contact lenses', 'hearing aid',
    'car repair', 'brake', 'tyre', 'tire', 'winter coat', 'school uniform', 'toilet paper',
    'soap', 'toothpaste', 'baby', 'wheelchair',
  ],
  must: [
    'laptop for work', 'work boots', 'uniform', 'textbook', 'phone repair', 'fridge',
    'refrigerator', 'washing machine', 'mattress', 'bed', 'shoes', 'boiler', 'stove',
    'oven', 'car seat', 'helmet', 'charger', 'replacement', 'broken', 'insurance',
    'vaccination', 'dental',
  ],
  good: [
    'vacuum', 'blender', 'microwave', 'desk', 'chair', 'office chair', 'monitor',
    'printer', 'backpack', 'kettle', 'toaster', 'pan', 'pot', 'tool', 'drill', 'bike',
    'bicycle', 'jacket', 'storage', 'shelf', 'lamp', 'router', 'course',
  ],
  nice: [
    'game', 'console', 'playstation', 'xbox', 'nintendo', 'jewellery', 'jewelry', 'watch',
    'perfume', 'designer', 'handbag', 'sneakers', 'drone', 'vr', 'headset', 'tv',
    'television', 'speaker', 'airpods', 'earbuds', 'upgrade', 'holiday', 'vacation',
    'decor', 'collectible', 'lego', 'gadget', 'subscription', 'new phone', 'iphone',
    'tablet', 'ipad', 'camera', 'sunglasses',
  ],
};

export function localAssess(name: string, price: number): Assessment {
  const text = ` ${name.toLowerCase()} `;
  const scores: Record<Category, number> = { need: 0, must: 0, good: 0, nice: 0 };
  for (const cat of Object.keys(KEYWORDS) as Category[]) {
    for (const kw of KEYWORDS[cat]) {
      if (text.includes(kw)) scores[cat] += kw.split(' ').length; // multi-word = stronger
    }
  }
  const ranked = (Object.keys(scores) as Category[]).sort((a, b) => scores[b] - scores[a]);
  let best: Category = scores[ranked[0]] > 0 ? ranked[0] : 'good';
  const matched = scores[ranked[0]] > 0;

  // Expensive items without a clear essential signal lean discretionary.
  if (!matched && price >= 500) best = 'nice';

  return {
    suggestedCategory: best,
    reasoning: matched
      ? `Looks like a typical "${best}" purchase based on the item name.`
      : 'No strong signal from the name — defaulting conservatively. Adjust if needed.',
    confidence: matched ? 0.55 : 0.25,
    source: 'local',
  };
}

// ---------- "Would a reasonable person need this?" ----------

export interface CheckQuestion {
  id: string;
  text: string;
  /** The answer that supports the item being genuinely needed. */
  supportive: boolean;
}

export const REASONABLE_PERSON_QUESTIONS: CheckQuestion[] = [
  { id: 'harm', text: 'Would going without it for the next month harm your health, safety or income?', supportive: true },
  { id: 'replaces', text: 'Is it replacing something broken, lost or used up?', supportive: true },
  { id: 'alternative', text: 'Do you already own something (or could borrow/rent something) that does the job?', supportive: false },
  { id: 'cheaper', text: 'Is there a cheaper version that would meet the need just as well?', supportive: false },
  { id: 'impulse', text: 'Did you first want this in the last 48 hours (an ad, a friend, a store display)?', supportive: false },
];

export function evaluateCheck(
  answers: Record<string, boolean>,
  questions: CheckQuestion[] = REASONABLE_PERSON_QUESTIONS,
): Verdict {
  let score = 0;
  for (const q of questions) {
    if (!(q.id in answers)) continue;
    score += answers[q.id] === q.supportive ? 1 : -1;
  }
  // "Harm" is the defining trait of a genuine need — it's weighted extra.
  if (answers.harm === true) score += 1;
  if (answers.harm === false) score -= 1;
  if (score >= 3) return 'justified';
  if (score >= 0) return 'borderline';
  return 'not_justified';
}

export const VERDICT_COPY: Record<Verdict, { title: string; body: string }> = {
  justified: {
    title: 'Sounds like a genuine need',
    body: 'A reasonable person in your position would likely buy this.',
  },
  borderline: {
    title: 'It could go either way',
    body: 'Consider "Good to have" for now — you can always move it up later.',
  },
  not_justified: {
    title: 'Probably a want, not a need',
    body: 'Most people would get by without this. We suggest a lower category.',
  },
};

/** Lowest category we'd recommend for a given verdict on an item placed in need/must. */
export function categoryForVerdict(chosen: Category, verdict: Verdict): Category {
  if (verdict === 'justified') return chosen;
  if (verdict === 'borderline') return chosen === 'need' ? 'must' : 'good';
  return 'good';
}

export function buildCheck(answers: Record<string, boolean>, now = new Date()): ReasonablePersonCheck {
  return { answers, verdict: evaluateCheck(answers), checkedAt: now.toISOString() };
}
