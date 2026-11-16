# Campus Nest AI Worker v3 — деплой

Цепочка: Gemini (основная модель) → Gemini (запасная) → Workers AI (Llama) → 502, дальше сайт сам переходит на офлайн-правила.

## 1. wrangler.toml (фрагмент)
```toml
name = "campus-nest-ai"
main = "worker.v3.js"
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
# {"ok":true,"gemini":true,"workersAi":true,"version":"v3"}

curl -s -X POST $URL -H 'Origin: https://YOUR-NAME.github.io' -H 'content-type: application/json' \
  -d '{"task":"ping"}'
# {"ok":true,"data":{"ok":true},"provider":"gemini","model":"...","ms":...}
```
Без заголовка Origin (или с чужим) POST вернёт 403.

## 4. Чек-лист живой проверки
1. Ключ создан бесплатно в Google AI Studio (aistudio.google.com → Get API key); модели из п. 1 есть в списке.
2. Ключ только через `wrangler secret put`: не вставлять в HTML/JS сайта, не отправлять в чат, не коммитить.
3. GET даёт `gemini:true, workersAi:true, version:"v3"`.
4. ping даёт `provider:"gemini"`; затем временно задай неверный `GEMINI_MODEL` и убедись, что сработала запасная модель (или `workers-ai`).
5. Реальные задачи с сайта (assistant, search, plan) возвращают JSON и отображаются; `plan` с длинным списком кандидатов проходит (лимит 9000 символов, тело до 32 КБ).
6. Лимиты и сбой: 13-й запрос за минуту с одного IP даёт 429 `rate_limited`; чужой Origin даёт 403.

## Если квота кончилась
Gemini free tier отвечает 429 → Worker берёт запасную Gemini, затем Workers AI. Если исчерпано всё, пользователь видит 429 `rate_limited` (с `retryAfter`) или 502 `no_model`; сайт молча переходит на офлайн-правила, кнопка «Test AI» показывает ошибку. Квота обновляется по суткам, ничего чинить не нужно.
