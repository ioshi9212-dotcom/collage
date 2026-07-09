# Что заменить в репозитории collage

Этот ZIP содержит не полный проект, а файлы для точечной замены в текущем репозитории.

Замени файлы по тем же путям:

- `server.js`
- `public/cloud-auth.js`
- `src/styles.css`
- `.gitignore`

После замены:

```bash
npm install
npm run build
```

Для Railway/production обязательно добавь переменную:

```text
SESSION_SECRET=<любой длинный случайный секрет>
```

Что исправлено:

1. Сервер больше не использует dev-secret в production.
2. Добавлен простой rate limit на login/register.
3. Ошибки сервера в production не раскрывают внутренний `error.message`.
4. Cloud save больше не ищет первую кнопку “Сохранить” по всему документу — теперь кликает только кнопку верхней файловой панели редактора.
5. `src/styles.css` переписан как чистая база без старых `UI cleanup pass`, `Theme pass`, `Clean top layout v07` и дублей topbar-правил.
6. Добавлен `.gitignore`, чтобы не заливать `node_modules`, `dist`, `.env`.
