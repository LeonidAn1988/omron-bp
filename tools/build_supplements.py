#!/usr/bin/env python3
"""
Сборка справочника БАДов из единого реестра свидетельств о государственной
регистрации (форма ЕАЭС).

    python3 tools/build_supplements.py [--out public/supplements.json]

Зачем отдельный сборщик. БАД — не лекарство, и в Государственном реестре
лекарственных средств его нет и не будет: добавки регистрируются не Минздравом,
а санитарной службой, и попадают в реестр свидетельств о государственной
регистрации. Поэтому источника два, а справочник — общий: человек, который
набирает «омега», не обязан знать, по какому ведомству проходит его баночка.

Почему именно этот реестр. Российский реестр свидетельств старой формы
(fp.crc.ru/gosregfr) заморожен на 24 марта 2019 года и на запросы отвечает
«Сбой при работе с базой данных». Реестр формы ЕАЭС на том же сервере живой —
в выдаче свидетельства текущего месяца.

Почему http, а не https. Сервер отдаёт сертификат российского удостоверяющего
центра, которого нет в системном хранилище, — curl и python рвут соединение.
Данные тут публичные и в одну сторону: утечь при их скачивании нечему, а личное
в запрос не попадает, потому что запрос один на всех и не зависит от человека.

Страницы кэшируются в tools/out/sgr — повторный разбор не дёргает реестр
заново. Между запросами пауза: реестр государственный и не наш.
"""

import argparse
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

REGISTRY = 'http://fp.crc.ru/evrazes/'
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}

# Запрос по названию продукции: у всех БАДов оно начинается одинаково.
QUERY = 'биологически активная добавка'
PER_PAGE = 100  # потолок сервера: больше он всё равно не отдаёт
PAUSE = 0.7

CACHE = Path('tools/out/sgr')

# Запись реестра: подписи столбцов идут ровно в этом виде.
FIELD = re.compile(
    r'<td class=w30r>([^<]*?)\s*(?:&nbsp;)?&#151;.*?</td>\s*<td[^>]*>(.*?)</td>',
    re.S,
)
RECORD_SPLIT = re.compile(r'<td colspan="2"><hr[^>]*><b>\d+\.</b></td>')

# Начало записи, одинаковое у всех: «биологически активная добавка к пище».
PREFIX = re.compile(r'^\s*(?:биологически\s+активн\w*\s+добавк\w*(?:\s+к\s+пище)?|БАД\s+к\s+пище)\s*', re.I)

QUOTE = '"«»'

# Хвост после названия: «со вкусом малины», «товарного знака РАНКОФ®»,
# «без ароматизатора». Приметы одни и те же — строчная буква после кавычки.
TAIL_START = re.compile(r'^\s+[a-zа-яё]')

# Форма выпуска в скобках после названия. Список закрытый: в реестре пишут
# свободным текстом, и открытый разбор тащит в справочник «массой 625 мг».
FORMS = [
    ('капсул', 'капсулы'),
    ('таблет', 'таблетки'),
    ('драже', 'драже'),
    ('порош', 'порошок'),
    ('гранул', 'гранулы'),
    ('капл', 'капли'),
    ('сироп', 'сироп'),
    ('раствор', 'раствор'),
    ('жидкост', 'жидкость'),
    ('масл', 'масло'),
    ('концентрат', 'концентрат'),
    ('напит', 'напиток'),
    ('фильтр-пакет', 'фильтр-пакеты'),
    ('чай', 'чай'),
    ('батонч', 'батончик'),
    ('желе', 'желе'),
    ('плитк', 'плитки'),
    ('леден', 'леденцы'),
    ('паст', 'пастилки'),
    ('спрей', 'спрей'),
    ('гель', 'гель'),
    ('бальзам', 'бальзам'),
    ('сырь', 'сырьё'),
    ('брикет', 'брикет'),
]

# «источника инозита, дополнительного источника витамина В9» — то, ради чего
# добавку и покупают. Ближайший аналог действующего вещества у лекарства.
SOURCE = re.compile(r'источник(?:а|ом|ов)?\s+([^,.;()]{2,60})', re.I)

# Хвосты, которые тащатся из области применения и смыслом не являются.
SOURCE_NOISE = re.compile(r'^(?:биологически|пищевых|веществ|для\b|и\b)', re.I)

# «(капсулы массой 625 мг)» — вес капсулы, а не дозировка действующего
# вещества. В подсказку такое ставить нельзя: человек прочтёт его как дозу.
MASS = re.compile(r'масс', re.I)


def fetch_page(page: int, retries: int = 3) -> str:
    """Страница реестра. Кодировка windows-1251 — и в ответе, и в параметрах."""
    cached = CACHE / f'{page:04d}.html'
    if cached.exists():
        return cached.read_text(encoding='utf-8')

    query = urllib.parse.urlencode(
        {'oper': 's', 'type': 'max', 'rpp': PER_PAGE, 'pg': page, 'text_prodnm': QUERY},
        encoding='cp1251',
    )
    last: Exception | None = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(REGISTRY + '?' + query, headers=UA)
            body = urllib.request.urlopen(request, timeout=180).read().decode('cp1251', 'replace')
            CACHE.mkdir(parents=True, exist_ok=True)
            cached.write_text(body, encoding='utf-8')
            # Пауза только после настоящего запроса. Разбор из кэша сотен
            # страниц иначе тратит три минуты на сон в пустоту.
            time.sleep(PAUSE)
            return body
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last = error
            time.sleep(2 + attempt * 3)
    raise SystemExit(f'страница {page} не отдалась: {last}')


def total_pages(body: str) -> int:
    found = re.search(r'Страницы \(всего (\d+)\)', body)
    return int(found.group(1)) if found else 1


def text_of(fragment: str) -> str:
    """HTML-обрывок в человеческий текст: реестр верстался в прошлом веке."""
    plain = re.sub(r'<[^>]+>', ' ', fragment)
    return re.sub(r'\s+', ' ', html.unescape(plain)).strip()


def parse_records(body: str) -> list[dict]:
    out = []
    for block in RECORD_SPLIT.split(body)[1:]:
        fields = {text_of(key): text_of(value) for key, value in FIELD.findall(block)}
        product = fields.get('Продукция', '')
        if not product:
            continue
        out.append(
            {
                'product': product,
                'maker': fields.get('Изготовитель (производитель)', ''),
                'area': fields.get('Область применения', ''),
            }
        )
    return out


def parse_name(product: str) -> tuple[str, str]:
    """
    Торговое название и всё, что стоит после него.

    Разбор сложнее, чем кажется: кавычки в реестре вложенные и непарные.

        "Согревающий напиток "Лимон-имбирь" (порошок по 5 г)
        "Гематоген Детский" со вкусом клубники или земляники (плитки)
        "Сироп ТИМ" товарного знака РАНКОФ® (жидкость во флаконах)

    В первом случае кавычек три, и название — всё до скобки. Во втором и
    третьем название кончается на первой же кавычке, а дальше идёт описание,
    которое названием не является. Различает их то, что стоит сразу за
    кавычкой: **строчная буква** — значит, пошло описание («со вкусом»,
    «товарного знака», «без ароматизатора»); прописная — кавычка внутренняя и
    название продолжается.

    Кавычки из готового названия убираются целиком: искать по ним всё равно
    никто не будет, а непарная кавычка посреди подсказки выглядит поломкой.
    """
    text = PREFIX.sub('', product).strip()
    if not text:
        return '', ''

    if text[0] not in QUOTE:
        # Без кавычек вовсе: имя — всё до описания формы в скобках.
        head, _, tail = text.partition(' (')
        return clean_name(head), tail

    close = None
    index = 1
    while index < len(text):
        if text[index] in QUOTE:
            rest = text[index + 1 :]
            close = index
            if not rest.strip() or rest.lstrip().startswith('(') or TAIL_START.match(rest):
                break
        index += 1

    if close is None:
        head, _, tail = text[1:].partition(' (')
        return clean_name(head), tail
    return clean_name(text[1:close]), text[close + 1 :]


def clean_name(raw: str) -> str:
    without_quotes = ''.join(' ' if ch in QUOTE else ch for ch in raw)
    return re.sub(r'\s+', ' ', without_quotes).strip(' ,;-')


def parse_form(tail: str) -> str:
    lowered = tail.lower()
    for needle, title in FORMS:
        if needle in lowered:
            return title
    return ''


def parse_maker(raw: str) -> str:
    """
    Из адресной простыни — только название фирмы.

    В реестре изготовитель записан одной строкой вместе с индексом, областью и
    улицей. Человеку на упаковке видно название, по нему он и ищет.
    """
    head = raw.split(',')[0].strip()
    head = re.sub(r'\s*\((?:ПРИЛОЖЕНИЕ|адрес).*$', '', head, flags=re.I).strip()
    return head if 2 <= len(head) <= 70 else ''


def parse_sources(area: str) -> list[str]:
    """Чего добавка источник: «витамина D», «ПНЖК омега-3», «кальция»."""
    found = []
    for match in SOURCE.findall(area):
        value = re.sub(r'\s+', ' ', match).strip(' -–—')
        if not value or SOURCE_NOISE.match(value) or len(value) < 3:
            continue
        if value.lower() not in (v.lower() for v in found):
            found.append(value)
    return found[:4]


def normalize(name: str) -> str:
    """Ключ склейки: один продукт регистрируют десятками свидетельств."""
    return re.sub(r'[\s"«»\'`]+', ' ', name).strip().lower()


def build(records: list[dict]) -> dict:
    merged: dict[str, dict] = {}
    dropped = 0

    for record in records:
        name, tail = parse_name(record['product'])
        if not name or len(name) > 90:
            dropped += 1
            continue

        item = merged.setdefault(
            normalize(name), {'n': name, 'sources': [], 'makers': set(), 'forms': set()}
        )
        form = parse_form(tail)
        if form:
            item['forms'].add(form)
        maker = parse_maker(record['maker'])
        if maker:
            item['makers'].add(maker)
        for source in parse_sources(record['area']):
            if len(item['sources']) < 4 and source.lower() not in (s.lower() for s in item['sources']):
                item['sources'].append(source)

    forms_index: dict[str, int] = {}
    makers_index: dict[str, int] = {}
    items = []
    for item in merged.values():
        record: dict = {'n': item['n'], 'k': 1}
        if item['sources']:
            record['i'] = ', '.join(item['sources'])
        variants = [
            [forms_index.setdefault(form, len(forms_index)), [], []]
            for form in sorted(item['forms'])
        ]
        if variants:
            record['v'] = sorted(variants, key=lambda v: v[0])
        makers = sorted(item['makers'])[:3]
        if makers:
            record['m'] = [makers_index.setdefault(name, len(makers_index)) for name in makers]
        items.append(record)

    items.sort(key=lambda x: x['n'].lower())
    return {
        'source': 'Реестр свидетельств о государственной регистрации (ЕАЭС)',
        'certificates': len(records),
        'dropped': dropped,
        'forms': [name for name, _ in sorted(forms_index.items(), key=lambda kv: kv[1])],
        'makers': [name for name, _ in sorted(makers_index.items(), key=lambda kv: kv[1])],
        'items': items,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Сборка справочника БАДов из реестра СГР')
    parser.add_argument('--out', default='public/supplements.json')
    parser.add_argument('--pages', type=int, default=0, help='ограничить число страниц (для отладки)')
    args = parser.parse_args()

    first = fetch_page(1)
    pages = total_pages(first)
    if args.pages:
        pages = min(pages, args.pages)
    print(f'страниц в реестре: {pages}', file=sys.stderr)

    records = parse_records(first)
    for page in range(2, pages + 1):
        body = fetch_page(page)
        found = parse_records(body)
        if not found:
            print(f'страница {page} пуста — реестр кончился раньше счётчика', file=sys.stderr)
            break
        records.extend(found)
        if page % 25 == 0:
            print(f'  {page}/{pages}, свидетельств: {len(records)}', file=sys.stderr)

    data = build(records)
    # Реестр не сообщает дату актуализации, поэтому честнее ставить дату сборки.
    data['date'] = date.today().isoformat()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    with_source = sum(1 for i in data['items'] if 'i' in i)
    with_form = sum(1 for i in data['items'] if i.get('v'))
    with_maker = sum(1 for i in data['items'] if i.get('m'))
    total = len(data['items'])
    print(
        f'{out}: {total} наименований из {data["certificates"]} свидетельств, '
        f'{out.stat().st_size / 1024:.0f} КБ\n'
        f'  с формой: {with_form / total:.1%}, с источником: {with_source / total:.1%}, '
        f'с производителем: {with_maker / total:.1%}, отброшено записей: {data["dropped"]}',
        file=sys.stderr,
    )


if __name__ == '__main__':
    main()
