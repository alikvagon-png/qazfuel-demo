# QAZFUEL Demo

Telegram Mini App: топливо на маршруте Казахстан — Россия и доставка по Москве.

## Состав
- `public/index.html` — последняя версия демо (v8), карта 8 направлений, выбор топлива и объёма, локальные заявки.
- `render.yaml` — Render Blueprint для Static Site.
- Telegram Web App SDK подключён; приложение вызывает ready() и expand() внутри Telegram.

## Публикация на Render
Создайте Blueprint из этого репозитория: Render прочитает render.yaml.
Либо создайте Static Site со следующими настройками:
- Branch: main
- Build Command: `test -f public/index.html`
- Publish Directory: `public`
- Root Directory: оставить пустым

После успешного деплоя скопируйте выданный Render HTTPS URL.
В @BotFather для @QazFuelServiceBot: /setmenubutton → выбрать бота → текст «Открыть QAZFUEL» → HTTPS URL приложения.
Проверьте открытие кнопки меню в Telegram.

## Демо-ограничения
Заявки и контакты хранятся в localStorage браузера/устройства и не отправляются менеджеру.
Цены, оплата и сервер обработки заказов не подключены.
Карта показывает ориентиры населённых пунктов, а не точные стоянки бензовозов.
Карта (Leaflet/OpenStreetMap), шрифт Google Fonts и Telegram SDK требуют интернет-доступа.
Репозиторий публичный. Токен бота здесь не нужен; не добавляйте его в HTML или git.

## Локальный просмотр
`python3 -m http.server 8000 --directory public`
Откройте http://localhost:8000.

