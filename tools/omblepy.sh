#!/usr/bin/env bash
#
# Запасной путь через omblepy — на случай, если сопряжение из браузера не проходит.
#
#   ./tools/omblepy.sh pair    сопрячь прибор (нужен один раз, прибор в режиме «P»)
#   ./tools/omblepy.sh read    выгрузить историю в user1.csv / user2.csv / ubpm.json
#
# Ключ по умолчанию совпадает с ключом веб-приложения, поэтому после сопряжения
# отсюда браузер начинает работать с прибором сам.

set -euo pipefail

MODE="${1:-}"
TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$TOOLS_DIR/omblepy"
VENV_DIR="$TOOLS_DIR/.venv"
OUT_DIR="$TOOLS_DIR/out"

if [[ "$MODE" != "pair" && "$MODE" != "read" ]]; then
  echo "Использование: $0 pair|read" >&2
  exit 2
fi

command -v python3 >/dev/null || { echo "Нужен python3" >&2; exit 1; }
command -v git >/dev/null || { echo "Нужен git" >&2; exit 1; }

if [[ ! -d "$REPO_DIR" ]]; then
  echo "→ Скачиваю omblepy…"
  git clone --depth 1 https://github.com/userx14/omblepy.git "$REPO_DIR"
fi

if [[ ! -d "$VENV_DIR" ]]; then
  echo "→ Создаю виртуальное окружение…"
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install --quiet --upgrade pip
  "$VENV_DIR/bin/pip" install --quiet -r "$REPO_DIR/requirements.txt"
fi

mkdir -p "$OUT_DIR"
cd "$OUT_DIR"

if [[ "$MODE" == "pair" ]]; then
  cat <<'INSTRUCTIONS'

  Перед продолжением:
    1. Снимите прибор из системного списка Bluetooth, если он там есть.
    2. Удерживайте кнопку Bluetooth на тонометре, пока на экране не замигает «P».
    3. Не подтверждайте системные диалоги сопряжения, пока не выберете прибор в списке ниже.

INSTRUCTIONS
  # -d нужен, чтобы omblepy подхватил драйвер именно RS7 Intelli IT (HEM-6232T)
  exec "$VENV_DIR/bin/python" "$REPO_DIR/omblepy.py" -d hem-6232t -p
fi

echo
echo "  Включите Bluetooth на тонометре (обычное нажатие кнопки, не удержание)."
echo "  Результат появится в: $OUT_DIR"
echo
"$VENV_DIR/bin/python" "$REPO_DIR/omblepy.py" -d hem-6232t

echo
echo "→ Готово. Импортируйте любой из этих файлов в приложении:"
echo "     Настройки → Данные → «Импорт из файла»"
ls -1 "$OUT_DIR"/*.csv "$OUT_DIR"/ubpm.json 2>/dev/null || true
