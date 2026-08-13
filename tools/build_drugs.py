#!/usr/bin/env python3
"""
Сборка справочника лекарств из Государственного реестра лекарственных средств.

    python3 tools/build_drugs.py [--zip путь] [--out public/drugs.json]

Зачем это нужно. Название препарата на упаковке человек набирает руками, и
именно там рождаются «Лазартан», «метфорнин» и прочие опечатки, из-за которых
один и тот же препарат заводится в аптечку дважды. Справочник подсказывает
название, подставляет международное наименование и предлагает дозировки,
которые у этого препарата вообще бывают.

Почему справочник лежит в бандле, а не запрашивается по сети. У выгрузки ГРЛС
нет заголовков CORS — из браузера её не скачать ни при каких условиях. Значит,
либо своё зеркало (а это сервер, через который пойдёт перечень лекарств
конкретного человека), либо файл рядом со сборкой. Второе честнее: приложение
обещает, что данные не покидают устройство.

Источник: https://grls.minzdrav.gov.ru/GRLS.aspx, ежедневная выгрузка одним ZIP.
Берём лист «Действующий» — препараты с непросроченной регистрацией.

Дата выгрузки записывается в файл и показывается в интерфейсе: справочник
устаревает, и молчать об этом нельзя.
"""

import argparse
import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

GRLS_PAGE = 'https://grls.minzdrav.gov.ru/GRLS.aspx'
GRLS_HOST = 'https://grls.minzdrav.gov.ru/'
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}

# Колонки листа «Действующий». Шапка занимает пять строк, данные идут с шестой.
COL_TRADE, COL_MNN, COL_FORMS = 8, 9, 10
FIRST_DATA_ROW = 6

# Пометки о рецептурности приклеены к тому же полю, что и форма выпуска.
RX_NOISE = re.compile(r'-\s*(Без рецепта|По рецепту)\s*;?', re.I)

# «25 мг», «12,5 мг», «0,5 мл», «100 МЕ», «5 %». Единицы — только те, что
# человек видит на упаковке; «кг» и «шт» это фасовка, а не дозировка.
DOSE = re.compile(r'(?<![\d,.])(\d{1,4}(?:[,.]\d{1,3})?)\s*(мкг|мг|г|мл|МЕ|ЕД|%)(?![а-яА-Я])')

# Форма выпуска стоит в начале описания, до первой дозировки.
KNOWN_FORMS = [
    ('таблетки', 'таблетки'),
    ('капсулы', 'капсулы'),
    ('драже', 'драже'),
    ('гранулы', 'гранулы'),
    ('порошок', 'порошок'),
    ('раствор', 'раствор'),
    ('суспензия', 'суспензия'),
    ('сироп', 'сироп'),
    ('капли', 'капли'),
    ('спрей', 'спрей'),
    ('аэрозоль', 'аэрозоль'),
    ('мазь', 'мазь'),
    ('крем', 'крем'),
    ('гель', 'гель'),
    ('суппозитории', 'суппозитории'),
    ('пластырь', 'пластырь'),
    ('настойка', 'настойка'),
    ('лиофилизат', 'лиофилизат'),
    ('концентрат', 'концентрат'),
    ('эмульсия', 'эмульсия'),
    ('пастилки', 'пастилки'),
    ('сбор', 'сбор'),
]


def fetch_zip() -> bytes:
    """Скачивает свежую выгрузку. Ссылка на странице одноразовая — берём её оттуда же."""
    page = urllib.request.urlopen(
        urllib.request.Request(GRLS_PAGE, headers=UA), timeout=60
    ).read().decode('utf-8', 'replace')
    match = re.search(r'GetGRLS\.ashx\?FileGUID=[0-9a-fA-F-]+&UserReq=\d+', page)
    if not match:
        sys.exit('Не нашёл ссылку на выгрузку на странице ГРЛС — вероятно, изменилась вёрстка.')
    url = GRLS_HOST + match.group(0)
    print(f'качаю {url}', file=sys.stderr)
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600).read()


def open_active_sheet(blob: bytes):
    """
    Отдаёт лист «Действующий».

    По имени файла его не найти: имена внутри архива в однобайтовой кодировке
    без флага UTF-8, и распаковщики их курочат. Ищем по имени листа.
    """
    import openpyxl

    archive = zipfile.ZipFile(io.BytesIO(blob))
    for info in archive.infolist():
        if not info.filename.lower().endswith('.xlsx'):
            continue
        book = openpyxl.load_workbook(io.BytesIO(archive.read(info)), read_only=True)
        sheet = book.active
        if sheet.title.strip().lower().startswith('действующ'):
            return book, sheet
        book.close()
    sys.exit('В архиве нет листа «Действующий».')


def parse_forms(raw: str) -> tuple[str | None, list[str]]:
    """Из описания упаковки вытаскивает форму выпуска и все дозировки."""
    text = RX_NOISE.sub('', raw or '').strip(' ;/')
    if not text:
        return None, []

    head = text[:120].lower()
    form = next((title for needle, title in KNOWN_FORMS if needle in head), None)

    doses: list[str] = []
    for value, unit in DOSE.findall(text):
        dose = f'{value.replace(".", ",")} {unit}'
        if dose not in doses:
            doses.append(dose)
    return form, doses


def dose_key(dose: str) -> tuple[str, float]:
    """Сортировка дозировок по числу внутри единицы, а не по строке: 5 мг раньше 100 мг."""
    value, unit = dose.rsplit(' ', 1)
    return unit, float(value.replace(',', '.'))


def build(blob: bytes) -> dict:
    book, sheet = open_active_sheet(blob)
    merged: dict[str, dict] = {}
    rows = 0

    for row in sheet.iter_rows(min_row=FIRST_DATA_ROW, values_only=True):
        trade = str(row[COL_TRADE] or '').strip()
        if not trade:
            continue
        rows += 1

        mnn = str(row[COL_MNN] or '').strip()
        if mnn in ('~', '-'):
            mnn = ''
        form, doses = parse_forms(str(row[COL_FORMS] or ''))

        # Одно торговое наименование выпускают несколько заводов — записи
        # сливаются, иначе в подсказке двадцать одинаковых строк подряд.
        item = merged.setdefault(trade.lower(), {'n': trade, 'i': mnn, 'f': form, 'd': []})
        if not item['i'] and mnn:
            item['i'] = mnn
        if not item['f'] and form:
            item['f'] = form
        for dose in doses:
            if dose not in item['d']:
                item['d'].append(dose)

    book.close()

    items = []
    for item in merged.values():
        item['d'] = sorted(set(item['d']), key=dose_key)[:12]
        if not item['i']:
            del item['i']
        if not item['f']:
            del item['f']
        if not item['d']:
            del item['d']
        items.append(item)
    items.sort(key=lambda x: x['n'].lower())

    return {'source': 'ГРЛС', 'rows': rows, 'items': items}


def main() -> None:
    parser = argparse.ArgumentParser(description='Сборка справочника лекарств из ГРЛС')
    parser.add_argument('--zip', help='готовый ZIP вместо скачивания')
    parser.add_argument('--out', default='public/drugs.json', help='куда положить справочник')
    args = parser.parse_args()

    blob = Path(args.zip).read_bytes() if args.zip else fetch_zip()

    # Дата выгрузки берётся из имени файла внутри архива: она надёжнее даты сборки.
    stamp = ''
    for info in zipfile.ZipFile(io.BytesIO(blob)).infolist():
        found = re.search(r'(\d{4}-\d{2}-\d{2})', info.filename)
        if found:
            stamp = found.group(1)
            break

    data = build(blob)
    data['date'] = stamp
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    with_mnn = sum(1 for i in data['items'] if 'i' in i)
    with_form = sum(1 for i in data['items'] if 'f' in i)
    with_dose = sum(1 for i in data['items'] if 'd' in i)
    total = len(data['items'])
    print(
        f'записей в реестре: {data["rows"]}\n'
        f'наименований после слияния: {total}\n'
        f'  с международным наименованием: {with_mnn} ({with_mnn / total:.1%})\n'
        f'  с формой выпуска: {with_form} ({with_form / total:.1%})\n'
        f'  с дозировками: {with_dose} ({with_dose / total:.1%})\n'
        f'выгрузка от {stamp}, файл {out} — {out.stat().st_size / 1024:.0f} КБ',
        file=sys.stderr,
    )


if __name__ == '__main__':
    main()
