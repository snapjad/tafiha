// طفّيها — writes what the virtual guide may draw on (supabase/functions/mentor/knowledge.json)
// from the app's own reviewed texts, so the guide never knows more, or other, than the app says.
//
//   node scripts/mentor-knowledge.mjs      (run again after editing js/plan.js or js/store.js)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TRIGGERS, WITHDRAWAL, SOURCES } from '../js/plan.js';
import { everyQuestion, ASK_OUTRIGHT } from '../js/assessment.js';
import { MILESTONES } from '../js/store.js';

const out = fileURLToPath(new URL('../supabase/functions/mentor/knowledge.json', import.meta.url));
const knowledge = {
  milestones: MILESTONES.map((m) => `${m.name}: ${m.text}`),
  triggers: TRIGGERS.map((t) => `${t.label}: ${t.plan}`),
  withdrawal: WITHDRAWAL.map((w) => `${w.label}: ${w.tip}`),
  sources: SOURCES,
  // questions whose answers may be picked up from what someone says in passing (keys = positions)
  questions: everyQuestion().filter(({ it }) => !ASK_OUTRIGHT.has(it.id) && it.type !== 'date').map(({ it, group }) => ({
    id: it.id,
    label: it.type === 'num' && group ? `${group}: ${it.label}` : it.label,
    kind: it.type,
    ...(it.options ? { options: it.options.map(([, l], i) => ({ v: String(i), l })) } : {}),
  })),
};
writeFileSync(out, JSON.stringify(knowledge, null, 2) + '\n');
console.log(`knowledge.json: ${knowledge.milestones.length} milestones, ${knowledge.triggers.length} triggers, ${knowledge.withdrawal.length} symptoms, ${knowledge.questions.length} questions`);
