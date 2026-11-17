# Campus Nest AI Worker v4 — деплой

Что нового в v4: лимит промпта для задачи `assistant` поднят до 8000 символов (ассистент получает все тестовые квартиры и студентов с анонимными id). Остальное как в v3. Сайт `index.v4.html` работает и с Worker v3, но тогда длинные вопросы ассистенту получат 400 и уйдут в офлайн-ответ.

Цепочка: Gemini (основная модель) → Gemini (запасная) → Workers AI (Llama) → 502, дальше сайт сам переходит на офлайн-правила.

## 1. wrangler.toml (фрагмент)
```toml
name = "campus-nest-ai"
main = "worker.v4.js"
compatibility_date = "2025-01-01"

[ai]
binding = "AI"

[vars]
ALLOWED_ORIGIN = "https://YOUR-NAME.github.io"   # несколько через запятую; без слэша на конце
# необязательно: GEMINI_MODEL = "gemini-3.5-flash"
#                GEMINI_MODEL_FALLBACK = "gemini-3.1-flash-lite"
#                RATE_PER_MIN = "12"   RATE_PER_DAY = "150"
```
Названия моделей по умолчанию (`gemini-3.5-flash`, `gemini-3.1-flash-lite`) нужно сверить в Google AI Studio: список моделей и квоты бесплатного уровня меняются. Если имя другое, задай его в `GEMINI_MODEL` / `GEMINI_MODEL_FALLBACK`, код менять не надо.

## 2. Команды
```bash
npx wrangler secret put GEMINI_API_KEY   # вставить ключ в запрос терминала
npx wrangler deploy
```
`ALLOW_ANY=1` только для локальных тестов (`wrangler dev`), в проде не ставить.

## 3. Проверка curl
```bash
URL=https://campus-nest-ai.YOUR.workers.dev
curl -s $URL
# {"ok":true,"gemini":true,"workersAi":true,"version":"v4"}

curl -s -X POST $URL -H 'Origin: https://YOUR-NAME.github.io' -H 'content-type: application/json' \
  -d '{"task":"ping"}'
# {"ok":true,"data":{"ok":true},"provider":"gemini","model":"...","ms":...}
```
Без заголовка Origin (или с чужим) POST вернёт 403.

## 4. Чек-лист живой проверки
1. Ключ создан бесплатно в Google AI Studio (aistudio.google.com → Get API key); модели из п. 1 есть в списке.
2. Ключ только через `wrangler secret put`: не вставлять в HTML/JS сайта, не отправлять в чат, не коммитить.
3. GET даёт `gemini:true, workersAi:true, version:"v4"`.
4. ping даёт `provider:"gemini"`; затем временно задай неверный `GEMINI_MODEL` и убедись, что сработала запасная модель (или `workers-ai`).
5. Реальные задачи с сайта (assistant, search, plan) возвращают JSON и отображаются; `plan` с длинным списком кандидатов проходит (лимит 9000 символов), `assistant` до 8000, остальные до 4000; тело до 32 КБ.
6. Лимиты и сбой: по умолчанию 40 запросов в минуту и 600 в день с одного IP (`RATE_PER_MIN`, `RATE_PER_DAY`); 41-й запрос за минуту даёт 429 `rate_limited` с `retryAfter`, сайт пишет «AI rate limit, retrying in N s» и повторяет сам; чужой Origin даёт 403.

## Если квота кончилась
Gemini free tier отвечает 429 → Worker берёт запасную Gemini, затем Workers AI. Если исчерпано всё, пользователь видит 429 `rate_limited` (с `retryAfter`) или 502 `no_model`; сайт показывает статус и переходит на офлайн-правила, кнопка «Test AI» показывает ошибку. Квота обновляется по суткам, ничего чинить не нужно.

## Если сайт уже на GitHub Pages
В репозитории сейчас живой `index.html` и `worker.js`. Чтобы выкатить v4: скопируй `index.v4.html` поверх `index.html` (адрес Worker задан в `<meta name="cn-ai-endpoint" content="https://campus-nest.kasssaim291.workers.dev/">`; если Worker будет называться иначе, поменяй только этот адрес). Сайт v4 ждёт контракт Worker v3/v4 (`{task, prompt}`, GET-статус), поэтому старый `worker.js` нужно заменить на `worker.v4.js` под тем же именем `campus-nest` (в `wrangler.toml` поставь `name = "campus-nest"`), задеплой `worker.v4.js` командой из п. 2, открой сайт и пройди чек-лист выше.
