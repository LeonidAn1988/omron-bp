#!/usr/bin/env python3
"""Сторож справочников: не пустить плохую выгрузку к людям.

Между «реестр отдал мусор» и «мусор в аптечке у отца» преграды не было:
сборщики пишут прямо в `public/`, статистику печатают уже после записи файла,
а сборка на CI справочники не трогает вовсе. Этот скрипт — та самая преграда.

Запускается двумя способами:

    python3 tools/check_books.py                       # проверить то, что лежит
    python3 tools/check_books.py --against HEAD        # ещё и сверить с прежним

Первый нужен на сборке: он ловит файл, который сломает приложение. Второй —
при обновлении: он ловит выгрузку, которая приложение не сломает, но окажется
чепухой (реестр сменил формат, краул оборвался, источник отдал огрызок).

Код возврата: 0 — принимать можно, 1 — нельзя.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

BOOKS = {
    'public/drugs.json': {
        'title': 'лекарства',
        # Канарейки надёжнее процентов: смену формата они ловят там, где доли
        # ещё выглядят правдоподобно. Сверяются через нормализацию, как ищет
        # само приложение: в реестре «Конкор®», и точное сравнение по имени
        # даёт ложную тревогу — на этом я и наступил при первом прогоне.
        'canaries': [
            'конкор', 'лозап', 'анальгин', 'метформин', 'аспирин',
            'амлодипин', 'эутирокс', 'панангин', 'кардиомагнил', 'аторвастатин',
        ],
        'min_items': 8000,
    },
    'public/supplements.json': {
        'title': 'БАДы',
        # У каждого справочника канарейки свои: «Магне В6» и «Омега-3» — это
        # добавки, в лекарствах их нет и быть не должно.
        'canaries': ['омега', 'магне', 'витамин д', 'рыбий жир', 'кальций'],
        'min_items': 20000,
    },
}

#: Насколько число наименований может уехать от прежнего, не вызывая тревоги.
CORRIDOR = (0.9, 1.3)

#: Что не должно встречаться в текстовых полях ни при каких обстоятельствах.
#: `fetch_page` в сборщике БАДов читает cp1251 — первая же смена кодировки
#: реестра испортит все двадцать пять тысяч названий разом, и увидеть это
#: глазами в одной строке на три мегабайта нельзя.
#:
#: Ловим три разных беды. Первая — потерянный символ и мягкий перенос. Вторая —
#: неразобранные HTML-сущности: реестр верстался в прошлом веке. Третья, и
#: главная, — кириллица, прочитанная как латиница: «Анальгин» превращается в
#: «ÐÐ½Ð°Ð»ÑŒÐ³Ð¸Ð½», то есть в совершенно законные латинские буквы, и по
#: одному «испорченному символу» её не найти — только по характерным парам.
JUNK = re.compile(r'[\ufffd\u00ad]|&[a-z]+;|&#\d+;|[\u00c0-\u00d1][\u0080-\u00bf]')


def normalize(text: str) -> str:
    """Как ищет приложение: без знаков охраны, без пунктуации, в нижнем регистре."""
    return re.sub(r'[^а-яёa-z0-9]+', ' ', text.lower().replace('®', ' ').replace('™', ' ')).strip()


class Report:
    def __init__(self) -> None:
        self.hard: list[str] = []
        self.soft: list[str] = []

    def fail(self, message: str) -> None:
        self.hard.append(message)

    def warn(self, message: str) -> None:
        self.soft.append(message)


def check_shape(book: dict, report: Report) -> None:
    """Файл не сломает приложение: схема, индексы, словари, порядок."""
    for key in ('items', 'forms', 'makers', 'date'):
        if key not in book:
            report.fail(f'нет поля «{key}»')
            return

    forms, makers = len(book['forms']), len(book['makers'])
    used_forms: set[int] = set()
    used_makers: set[int] = set()
    junk = 0

    for item in book['items']:
        name = item.get('n')
        if not isinstance(name, str) or not name.strip():
            report.fail('запись без названия')
            return
        if JUNK.search(name + str(item.get('i', ''))):
            junk += 1
        for variant in item.get('v', []):
            index = variant[0] if variant else None
            # Сдвиг индекса на единицу превращает «капсулы» в «свечи», и
            # заметить это глазами невозможно — только счётом.
            if not isinstance(index, int) or not 0 <= index < forms:
                report.fail(f'{name}: форма {index!r} вне словаря из {forms}')
                return
            used_forms.add(index)
        for index in item.get('m', []):
            if not isinstance(index, int) or not 0 <= index < makers:
                report.fail(f'{name}: производитель {index!r} вне словаря из {makers}')
                return
            used_makers.add(index)

    if junk:
        report.fail(f'битая кодировка или HTML-сущности в {junk} записях')

    # Сирота в словаре безвредна сама по себе, но означает, что часть
    # препаратов перестала разбираться, а словарь остался от прошлого прохода.
    if forms - len(used_forms):
        report.fail(f'форм в словаре {forms}, используется {len(used_forms)}')
    if makers - len(used_makers):
        report.fail(f'производителей в словаре {makers}, используется {len(used_makers)}')

    names = [item['n'].lower() for item in book['items']]
    if names != sorted(names):
        report.fail('записи не отсортированы — сборка перестала быть детерминированной')


def check_date(book: dict, report: Report, previous: dict | None) -> None:
    stamp = book.get('date') or ''
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', stamp):
        report.fail(f'дата выгрузки не разобрана: {stamp!r}')
        return
    if stamp > date.today().isoformat():
        report.fail(f'дата выгрузки в будущем: {stamp}')
    if previous and previous.get('date') and stamp < previous['date']:
        # Дата, поехавшая назад, — это либо старый кэш, либо чужой файл.
        report.fail(f'дата уехала назад: было {previous["date"]}, стало {stamp}')


def check_canaries(book: dict, names: list[str], report: Report) -> None:
    index = [normalize(item['n']) for item in book['items']]
    missing = [name for name in names if not any(row.startswith(normalize(name)) for row in index)]
    if missing:
        report.fail('не находятся: ' + ', '.join(missing))


def check_volume(book: dict, spec: dict, report: Report, previous: dict | None) -> None:
    count = len(book['items'])
    if count < spec['min_items']:
        report.fail(f'наименований {count}, ожидалось не меньше {spec["min_items"]}')
    if previous:
        was = len(previous.get('items', []))
        if was:
            ratio = count / was
            if not CORRIDOR[0] <= ratio <= CORRIDOR[1]:
                report.fail(f'наименований {count} против прежних {was} — это {ratio:.0%}')


def previous_version(path: str, ref: str) -> dict | None:
    """Прежняя принятая версия — из git, а не из копии рядом."""
    done = subprocess.run(['git', 'show', f'{ref}:{path}'], capture_output=True, text=True)
    if done.returncode != 0:
        return None
    try:
        return json.loads(done.stdout)
    except json.JSONDecodeError:
        return None


def summarize(path: str, book: dict, previous: dict | None) -> list[str]:
    """Сводка для человека: то, что он читает вместо диффа.

    Диффа у этих файлов не бывает — обе выгрузки лежат одной строкой на
    полтора и три мегабайта. Читают вот это.
    """
    lines = [f'{path}: выгрузка от {book["date"]}, наименований {len(book["items"])}']
    if not previous:
        return lines
    now = {item['n'] for item in book['items']}
    was = {item['n'] for item in previous.get('items', [])}
    added, gone = sorted(now - was), sorted(was - now)
    lines.append(f'  было {previous.get("date", "?")}, наименований {len(was)}: +{len(added)}, −{len(gone)}')
    if added:
        lines.append('  добавились: ' + ', '.join(added[:5]) + ('…' if len(added) > 5 else ''))
    if gone:
        lines.append('  исчезли: ' + ', '.join(gone[:5]) + ('…' if len(gone) > 5 else ''))
    return lines


def main() -> int:
    parser = argparse.ArgumentParser(description='проверить справочники перед принятием')
    parser.add_argument('--against', metavar='REF', help='сверить с этой версией из git, например HEAD')
    parser.add_argument('files', nargs='*', default=list(BOOKS), help='какие файлы проверять')
    args = parser.parse_args()

    trouble = False
    for path in (args.files or list(BOOKS)):
        spec = BOOKS.get(path)
        if spec is None:
            print(f'{path}: неизвестный справочник, пропускаю', file=sys.stderr)
            continue
        source = Path(path)
        if not source.exists():
            print(f'{path}: файла нет', file=sys.stderr)
            trouble = True
            continue

        book = json.loads(source.read_text(encoding='utf-8'))
        previous = previous_version(path, args.against) if args.against else None

        report = Report()
        check_shape(book, report)
        check_date(book, report, previous)
        check_canaries(book, spec['canaries'], report)
        check_volume(book, spec, report, previous)

        for line in summarize(path, book, previous):
            print(line)
        for message in report.soft:
            print(f'  ⚠ {message}')
        for message in report.hard:
            print(f'  ✗ {message}', file=sys.stderr)
        if report.hard:
            trouble = True
        else:
            print(f'  ✓ {spec["title"]}: принимать можно')
        print()

    return 1 if trouble else 0


if __name__ == '__main__':
    raise SystemExit(main())
