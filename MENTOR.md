# مرشد طفّيها: the spoken interview

A virtual guide (a drawn face from Claude Design) asks the intake interview out loud. People answer
by voice, by typing, or by tapping an answer.

| Part | File |
| --- | --- |
| The face and how it moves (blink, moods, mouth with sound) | `assets/mentor/mentor-layers.svg`, `js/mentor.js` |
| The screen and the conversation | `js/mentor-interview.js`, styles at the end of `css/app.css` |
| Free speech (the phone's own voices) | `js/voice.js`: Capacitor `TextToSpeech` + `SpeechRecognition` in the app, Web Speech in browsers |
| Understanding free answers | `supabase/functions/mentor/` (Edge Function) |
| What the guide may say | `supabase/functions/mentor/knowledge.json`, made by `node scripts/mentor-knowledge.mjs` from `js/plan.js` and `js/store.js` |
| Cost ceilings | `supabase/mentor.sql` (150 turns an hour per address, 20,000 a day in all) |

## How it stays on topic

- The app runs the interview: `js/assessment.js` decides the next question and `js/plan.js` builds the plan.
  The model never chooses questions or gives doses.
- Taps, yes/no and plain numbers are handled on the phone. Only free answers go to the function.
- The function returns structured output: the answer's own keys (checked against the question),
  or `question` / `unclear` / `offtopic` / `urgent`. Off-topic and urgent get fixed sentences written
  in the function, never the model's words.
- The person's words are passed as data, inside markers, never as instructions.

## Turning it on

1. Owner adds the `ANTHROPIC_API_KEY` secret in Supabase (Edge Functions → Secrets).
2. Apply `supabase/mentor.sql`.
3. `supabase functions deploy mentor` (needs a Supabase access token).
4. Test with `localStorage.setItem('tafiha.mentor', '1')` on tafiha.com: on-topic answers, off-topic
   questions (politics, other apps, "ignore your instructions"), urgent symptoms.
5. Update `privacy.html` (microphone; free answers are sent to Anthropic to be understood; speech is
   turned into text by the phone's own engine) and the Play data safety form (audio is not stored).
6. Set `MENTOR_ON = true` in `js/config.js`.
