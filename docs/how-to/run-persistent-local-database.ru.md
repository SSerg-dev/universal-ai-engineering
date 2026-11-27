# Запуск проекта с постоянной локальной базой

Эта инструкция запускает Universal Agentic OS с постоянной локальной PostgreSQL-базой. Загруженные документы и поисковый индекс сохраняются между запусками приложения и после перезагрузки компьютера.

## 1. Требования

- Docker Desktop запущен.
- Node.js версии `26.x`.
- PowerShell.
- Один постоянный пароль для локальной базы.

Проверьте установленные версии:

```powershell
node --version
docker --version
docker compose version
```

Команда `node --version` должна показать `v26.x.x` (миграция проверена на `v26.11.1`).

## 2. Первоначальная подготовка

Выполните после первого получения проекта или обновления зависимостей:

```powershell
cd D:\projects-ai\_devin\universal-ai-engineering

npm ci
npm --prefix ui ci

npm run build
npm run build:ui
```

## 3. Первый запуск постоянной базы

Придумайте пароль и сохраните его в менеджере паролей. Не добавляйте пароль в Git.

Замените `YOUR_STRONG_PASSWORD` своим паролем:

```powershell
cd D:\projects-ai\_devin\universal-ai-engineering

$env:UAOS_POSTGRES_PASSWORD = 'password'
$env:UAOS_DATABASE_URL = "postgresql://uaos:$($env:UAOS_POSTGRES_PASSWORD)@127.0.0.1:55432/uaos_course"
$env:UAOS_INDEX_ID = 'course-docs-v1'
```

Запустите PostgreSQL:

```powershell
docker compose -f compose.retrieval.yaml up -d --wait
```

Проверьте состояние:

```powershell
docker compose -f compose.retrieval.yaml ps
```

Контейнер должен иметь состояние `healthy`.

### Загрузка учебных документов

На первом запуске выполните:

```powershell
npm run ingest
```

Команда загружает учебные документы из `fixtures/docs`. Повторять ее при каждом запуске не требуется.

## 4. Запуск API

Оставьте первое окно PowerShell открытым и выполните:

```powershell
node --input-type=module -e 'import {startServer} from "./dist/src/composition/server.js"; await startServer({iteration:8,documentLibrary:true,databaseUrl:process.env.UAOS_DATABASE_URL,indexId:process.env.UAOS_INDEX_ID});'
```

API будет работать по адресу:

```text
http://127.0.0.1:3000
```

Терминал может ничего не печатать и оставаться занятым — это нормально. Не закрывайте его, пока работает приложение.

## 5. Запуск UI

Откройте второе окно PowerShell:

```powershell
cd D:\projects-ai\_devin\universal-ai-engineering
npm --prefix ui start
```

Откройте приложение в браузере:

<http://127.0.0.1:4200>

Схема локального запуска:

```text
Браузер :4200 → Angular UI → API :3000 → PostgreSQL :55432
```

## 6. Обычный запуск после перезагрузки

Сначала запустите Docker Desktop.

### Терминал №1 — база и API

```powershell
cd D:\projects-ai\_devin\universal-ai-engineering

$env:UAOS_POSTGRES_PASSWORD = 'password'
$env:UAOS_DATABASE_URL = "postgresql://uaos:$($env:UAOS_POSTGRES_PASSWORD)@127.0.0.1:55432/uaos_course"
$env:UAOS_INDEX_ID = 'course-docs-v1'

docker compose -f compose.retrieval.yaml up -d --wait

node --input-type=module -e 'import {startServer} from "./dist/src/composition/server.js"; await startServer({iteration:8,documentLibrary:true,databaseUrl:process.env.UAOS_DATABASE_URL,indexId:process.env.UAOS_INDEX_ID});'
```

### Терминал №2 — UI

```powershell
cd D:\projects-ai\_devin\universal-ai-engineering
npm --prefix ui start
```

Откройте <http://127.0.0.1:4200>.

При обычном запуске не требуется повторять:

```powershell
npm ci
npm run ingest
```

## 7. Правильная остановка

Останавливайте компоненты в указанном порядке.

### Шаг 1 — остановить UI

В терминале Angular нажмите `Ctrl+C`.

Если PowerShell спросит `Terminate batch job (Y/N)?`, нажмите `Y`.

### Шаг 2 — остановить API

В терминале API нажмите `Ctrl+C`.

### Шаг 3 — остановить PostgreSQL

```powershell
cd D:\projects-ai\_devin\universal-ai-engineering
docker compose -f compose.retrieval.yaml down
```

Эта команда останавливает контейнер, но сохраняет базу и загруженные документы.

## 8. Команда, которую нельзя использовать

Не выполняйте следующую команду, если хотите сохранить документы:

```powershell
docker compose -f compose.retrieval.yaml down -v
```

Параметр `-v` удаляет постоянный Docker-том вместе с базой, документами и поисковым индексом.

Безопасная команда:

```powershell
docker compose -f compose.retrieval.yaml down
```

## 9. Проверка работы

Проверка базы:

```powershell
docker compose -f compose.retrieval.yaml ps
Test-NetConnection 127.0.0.1 -Port 55432
```

Проверка API:

```powershell
Test-NetConnection 127.0.0.1 -Port 3000
```

Проверка UI:

```powershell
Test-NetConnection 127.0.0.1 -Port 4200
```

В успешном результате будет:

```text
TcpTestSucceeded : True
```

## 10. Краткая памятка

Запуск:

1. Запустить Docker Desktop.
2. Задать тот же пароль и переменные окружения.
3. Выполнить `docker compose -f compose.retrieval.yaml up -d --wait`.
4. Запустить API в первом терминале.
5. Запустить UI во втором терминале.
6. Открыть <http://127.0.0.1:4200>.

Остановка:

1. Остановить UI через `Ctrl+C`.
2. Остановить API через `Ctrl+C`.
3. Выполнить `docker compose -f compose.retrieval.yaml down`.

Главное правило: сохраняйте тот же пароль и не используйте `docker compose down -v`.
