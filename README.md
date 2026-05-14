# Email Layout Builder

Веб-интерфейс для менеджеров: загрузка CSV → очередь в Supabase → n8n обрабатывает → смотреть/скачать результат.

## Деплой на Railway

### 1. Создать новый проект

```
railway new
```

Или через dashboard: New Project → Deploy from GitHub Repo.

### 2. Env Variables

В Railway dashboard → Variables добавить:

| Переменная | Описание |
|---|---|
| `SUPABASE_URL` | `https://xxxxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service Role key из Supabase → Settings → API |
| `N8N_WEBHOOK_URL` | URL вебхука n8n (см. ниже) — **опционально** |

`PORT` Railway проставляет автоматически.

### 3. Добавить Webhook trigger в n8n

Текущий воркфлоу использует `manualTrigger`. Чтобы приложение могло запускать его автоматически:

1. Открой воркфлоу `верстка`
2. Добавь ноду **Webhook** (рядом с `manualTrigger`)
3. Метод: `POST`, путь: `/layout-trigger`
4. Подключи к `Get many rows` (параллельно с `manualTrigger`)
5. Активируй воркфлоу
6. Скопируй Webhook URL и вставь в `N8N_WEBHOOK_URL`

> Если `N8N_WEBHOOK_URL` не задан — приложение всё равно загружает строки в Supabase.
> n8n подхватит их при следующем ручном запуске (он забирает строки где `final_HTML IS NULL`).

### 4. Deploy

```bash
git init
git add .
git commit -m "init"
railway up
```

## Структура таблицы Supabase

Приложение работает с таблицей `letter_texts`:

```sql
create table letter_texts (
  id         bigserial primary key,
  created_at timestamptz default now(),
  template   text,
  image_URL  text,
  text       text,
  final_HTML text,
  CTA_URL    text,
  descr      text
);
```

## Формат входного CSV

```
<descr>,<text>,<image_URL>,<CTA_URL>,<template>
DAY 1,"Subject: ...\nBody: ...",https://img.url,https://cta.url,"<body>...</body>"
```

Первая строка с заголовками (`,text,image_URL,CTA_URL,template`) обрезается автоматически.

## Local dev

```bash
npm install
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_KEY=eyJ... \
node server.js
```

Открыть `http://localhost:3000`
