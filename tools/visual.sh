#!/usr/bin/env bash
#
# Визуальная проверка через Percy: собрать, поднять, снять, погасить.
#
#   npm run visual
#
# Ключ Percy лежит в ~/.browserstack.env рядом с ключами BrowserStack и в
# репозиторий не попадает. Percy запускается обёрткой `percy exec`: она поднимает
# локальный сервер, через который снимки уходят в облако, поэтому запускать
# tools/visual.mjs напрямую бесполезно — снимки просто некуда будет отдать.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="$HOME/.browserstack.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Нет $ENV_FILE — в нём должен лежать PERCY_TOKEN." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

if [ -z "${PERCY_TOKEN:-}" ]; then
  echo "В $ENV_FILE нет PERCY_TOKEN. Взять его: percy.io -> проект -> Project settings." >&2
  exit 1
fi

echo "Сборка…"
npm run build >/dev/null

echo "Поднимаю просмотр на 5199…"
npx vite preview --port 5199 --strictPort >/tmp/omron-preview.log 2>&1 &
SERVER=$!
# Гасим сервер, чем бы прогон ни кончился: без этого порт остаётся занят и
# следующий запуск падает на strictPort.
trap 'kill $SERVER 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  if curl -sf -o /dev/null http://localhost:5199/; then break; fi
  sleep 0.5
done
if ! curl -sf -o /dev/null http://localhost:5199/; then
  echo "Просмотр не поднялся, лог:" >&2
  cat /tmp/omron-preview.log >&2
  exit 1
fi

echo "Снимаю экраны…"
npx percy exec -- node tools/visual.mjs
