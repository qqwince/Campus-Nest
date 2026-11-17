# Campus Nest: v3 → v4

Base: `index.v3.html` (589,912 bytes). Result: `index.v4.html` (665,981 bytes, +76 KB: the AI output filter, phrase parser and contract X-ray, written as plain readable code with no libraries).
Ids follow the first professor's report (`prof/report1_summary.md`).

## Blockers (Б)
- **Б-1 No AI timeouts.** Already fixed in v3 (12 s timeout). v4 also stops a failed call from leaving a spinner: any error returns the rules version with the reason.
- **Б-2 "Live" shown when the AI is down.** Already fixed in v3. v4 adds a rate-limit state: "AI rate limit, retrying in N s · rules for now", with automatic retry.
- **Б-3 AI answers not checked outside the plan.** Fixed. A single filter `aiSafe(kind, data, ctx)` now checks every AI text: why-this-score, conflict warnings, group check, chat starters, assistant, application letter, listing text and contract notes. It checks types, length, a stop list (looks, nationality, religion, gender, age, photo requests, phone, e-mail, links, cash or payment outside the app, "no deposit"), made-up amenities, unknown flat ids, percentages and prices that differ from the data, and claims that contradict the data (pets, verified, "no risk"). A rejected answer is replaced by the rules text with the label "AI answer rejected by checks (reason)".
- **Б-4 3D house windows not clickable with a mouse.** Checked in v4: they open the card (test PASS).
- **Б-5 Tour room buttons mixed up.** Fixed: each button shows the named room; checked by test and screenshot at 1280 and 390.
- **Б-6 Presenter steals arrows and Esc.** Fixed: keys pass through when a sheet, dialog, text field, slider or the 3D tour is open. Esc closes the top layer first.

## Important (В)
- **В-1 "AI" label on plain formulas.** Fixed: "Conflict check · rules", "Rules: no conflicts found", "Learned from your swipes", "Group check found a risk", "Counts less in your score". The "AI warning" label appears only on text the AI actually wrote and that passed the checks.
- **В-2 "Use AI matching" switch did nothing.** Fixed and renamed "Smart matching". Off now really turns off the learned weights (percentages change, test PASS) and stops AI calls for notes.
- **В-3 Made-up sentence "Swipes show sleep matters most to N members".** Removed.
- **В-4 Presenter contradicts itself.** Step texts rewritten to match the code: in the plan the AI decides and code checks; elsewhere the formula decides.
- **В-5 Phrase parsing of negations.** Fixed: "без кота и без собаки", "курящих нет", "не курим", "allergic to cats", "итіміз жоқ", solo/"мы с подругой", budgets in words (RU/EN/KZ, including "мың"). 27 phrases tested. When the text clearly says something, the text wins over the AI.
- **В-6 Smart search trusted the AI blindly.** Fixed: the AI answer is compared with the text parser; conflicts are shown as "what was applied". An empty query highlights the field. "No filters found" is shown honestly.
- **В-7 Garbage shown as is.** Fixed by the type checks in `aiSafe`.
- **В-8 AI1 scroll jumps.** Fixed: scrolls only on a new message.
- **В-9 Assistant promised "every flat" but got 7.** Fixed: it now gets all sample flats and students in a compact form (≤ 8,000 characters, anonymous ids s1, s2…, no names or photos) and shows "Data sent: N flats, M people, no names or photos". Offline it answers basic questions in Russian and English. Off-topic questions get an honest refusal.
- **В-10 "Send application" silently replaced the group.** Fixed: you choose to apply with the plan's line-up or with your group.
- **В-11 3D tour: no focus trap, wheel scrolled the page.** Fixed: focus trap and focus return, page scroll lock, auto-rotation only after 2 s idle, tilt ±20°, "360° preview" label.
- **В-12 Double click on "Send application".** Fixed: a send lock; one application only.
- **В-13 Worker limit.** Worker limit is 40/min and 600/day. The site reads `retryAfter` from 429 and retries by itself.
- **В-14 X-ray and "Contract in plain words" duplicated.** Merged into one card. Clauses are built from the listing data with rule flags (deposit, term, joint liability, exit, repairs, guests, utilities, pets, guarantor). The AI only adds plain-language notes per clause and cannot soften a red flag.
- **В-15 Empty input did nothing.** Fixed: field highlight and a hint in search, assistant and hero chat.

## Other changes
- Privacy Center and landing text now say what is really sent: habits, budget, anonymous ids. Checked for every prompt: no names, photos, age, gender or nationality.
- Dead controls fixed: bell on M2.1, avatar "You" in S3.2, landlord bell; "Support chat" opens a real sheet; "Download my data" downloads a JSON file.
- Deck: "Show more people" when the deck runs out. Plan picks vary with the phrase.
- Touch targets ≥ 44 px on mobile; map labels enlarged to ≥ 11 px.
- 3D house: tilt ±45°; after a drag, auto motion stops until "Reset view".

## After the second review (professor #2)
- AI Home Plan texts (why, rejected flats, roommate notes, house rules, letter) now go through the same filter. A hostile answer (looks, nationality, "no men", "never clean", cash, "no pets" with a cat) is replaced by the rules text, and the reason is listed in "How the AI decided".
- Filter gaps closed: plural amenities (pools, saunas, gyms, villas), payment by Kaspi or to a personal card, "no need for Campus Nest". "Dana (Dana)" no longer appears.
- Privacy Center: the false "servers in Kazakhstan" line is replaced by the real path (browser → Cloudflare Worker → Google Gemini, backup Llama). "What the AI receives" opens its own explanation. The FAQ says the checks are rules and can miss a rare wording.
- "Smart matching" off now really stops all AI calls (chat starters too).
- Plan badge says "Mixed: N parts by rules, the rest by Gemini" instead of "Decided by Gemini" when rules made part of the plan.
- "Send application" is disabled when the best flat breaks a hard rule (e.g. 6 people, 100k).
- Esc in a 3D tour opened from the plan closes the tour first, then the plan.

## Known risks (not fixed)
- Worker: the prompt prefix and Origin header can be faked, so the Worker can be used as a free proxy to Gemini by someone who reads the code; the rate limit lives in one Worker instance. Proper fix: build prompts on the server from JSON data, Turnstile, Cloudflare rate limiting.
- 3D tour inertia turns further than the drag; plan scene labels can overlap at 390 px; the "Ctrl + scroll" hint shows on phones.

## Worker v4
- `assistant` prompt limit raised to 8,000 characters (others 4,000, plan 9,000). Status version "v4". Tests 33/33.

## Tests (sandbox, no network, AI simulated)
- JS blocks 12/12 pass `node --check`; smoke in 4 modes without errors; AI layer 43/43; 3D 78/78; X1 filter and parser 79/79; X2 behaviour 31/31; professor #2 fixes 12/12; 38 screens at 1280 and 390 without JS errors and without text under 11 px; Worker 33/33.
- Not tested: live Gemini, voice input, Safari/iPhone.
