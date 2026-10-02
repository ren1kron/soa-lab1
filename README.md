# Управление организациями

Проект содержит OpenAPI-спецификацию и Swagger UI для двух сервисов из задания.

- `openapi.yaml` — описание всех REST API.
- `index.html` — страница Swagger UI.
- `EXPLANATION_RU.md` — подробное объяснение задания простым языком.
- `tests` — автоматические проверки.

Самих backend-сервисов и базы данных в проекте нет.

## Запуск

Нужны Node.js 22 и npm.

```sh
npm ci
npm run build
npm run preview
```

После запуска документация доступна по адресу:

```text
http://127.0.0.1:4400/
```

По умолчанию Swagger UI отправляет запросы на:

- `http://localhost:8080` — первый сервис;
- `http://localhost:8081` — второй сервис.

## Проверка

```sh
npm run check
```

Команда проверяет OpenAPI, XML-примеры и работу Swagger UI в браузере.

## Сборка с другими адресами сервисов

```sh
ORGANIZATION_API_URL=https://example.com/api \
MANAGER_API_URL=https://example.com/manager \
npm run build
```

Готовые файлы появляются в папке `dist`.
