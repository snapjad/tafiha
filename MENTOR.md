# مرشد طفّيها: the spoken interview

A virtual guide (a drawn face from Claude Design) holds the intake interview as a conversation: he
asks, reacts in his own words, answers side questions about quitting and asks again when unclear.
People answer by voice, by typing, or by tapping an answer.

| Part | File |
| --- | --- |
| The face and how it moves (blink, moods, mouth with sound) | `assets/mentor/mentor-layers.svg`, `js/mentor.js` |
| The screen and the conversation | `js/mentor-interview.js`, styles at the end of `css/app.css` |
| Listening (free, the phone's own) | `js/voice.js`: Capacitor `SpeechRecognition` in the app, Web Speech in browsers |
| His mind (Claude) and his voice (Azure, `ar-JO-TaimNeural`) | `supabase/functions/mentor/` (Edge Function): `{q, text, history}` → reply; `{say}` → mp3 |
| What the guide may say | `supabase/functions/mentor/knowledge.json`, made by `node scripts/mentor-knowledge.mjs` from `js/plan.js` and `js/store.js` |
| Cost ceilings | `supabase/mentor.sql` (300 calls an hour per address, 40,000 a day in all) |

## How it stays on topic

- The app runs the interview: `js/assessment.js` decides the next question and `js/plan.js` builds the plan.
  The model never chooses questions or gives doses.
- Taps, yes/no and plain numbers are handled on the phone. Only free answers go to the function.
- The function returns structured output: the answer's own keys (checked against the question),
  or `question` / `unclear` / `offtopic` / `urgent`. Off-topic and urgent get fixed sentences written
  in the function, never the model's words.
- The person's words are passed as data, inside markers, never as instructions.

## Turning it on

1. Owner adds the secrets in Supabase (Edge Functions → Secrets): `ANTHROPIC_API_KEY`,
   `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` (an Azure Speech resource; the free tier covers about
   half a million spoken characters a month).
2. Apply `supabase/mentor.sql`.
3. `supabase functions deploy mentor` (needs a Supabase access token).
4. Test with `localStorage.setItem('tafiha.mentor', '1')` on tafiha.com: on-topic answers, off-topic
   questions (politics, other apps, "ignore your instructions"), urgent symptoms.
5. Update `privacy.html` (microphone; speech is turned into text by the phone's own engine; free
   answers go to Anthropic to be understood; the guide's sentences go to Microsoft Azure to be
   spoken) and the Play data safety form (audio is not stored).
6. Set `MENTOR_ON = true` in `js/config.js`.
