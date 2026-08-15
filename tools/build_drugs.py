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
COL_MAKER = 6
COL_TRADE, COL_MNN, COL_FORMS, COL_GROUP = 8, 9, 10, 13
FIRST_DATA_ROW = 6

# Пометки о рецептурности приклеены к тому же полю, что и форма выпуска.
RX_NOISE = re.compile(r'-\s*(Без рецепта|По рецепту)\s*;?', re.I)

# Единицы, которые человек видит на упаковке. «кг» и «шт» — фасовка, не дозировка.
UNIT = r'(?:мкг|мг|г|мл|МЕ|ЕД|%)'

# «25 мг», «12,5 мг», «1000 мг», «100 000 МЕ», «10 мг/мл», «5 мг/5 мл».
DOSE_ONE = re.compile(
    rf'^(\d{{1,7}}(?:[\s\u00a0]\d{{3}})*(?:[,.]\d{{1,3}})?)\s*({UNIT})'
    rf'(?:\s*/\s*(\d{{1,4}}(?:[,.]\d{{1,3}})?)?\s*({UNIT}))?$',
    re.I,
)

# «14 шт.», «30 доз» — количество в упаковке, а не сила препарата.
COUNT = re.compile(r'^\d+(?:[,.]\d+)?\s*(?:шт|доз|табл|капс)\.?$', re.I)

# «(28 шт.)» в хвосте записи — итог на пачку, а не на блистер.
PACK = re.compile(r'\((\d{1,4})\s*шт\.?\)', re.I)

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


def normalize_dose(match: re.Match) -> str:
    """«12.5 мг» → «12,5 мг», «10 мг / мл» → «10 мг/мл». Разделитель дробной части — запятая."""
    value = match.group(1).replace('.', ',').replace('\u00a0', ' ')
    unit = match.group(2)
    if match.group(4):
        per = f'{match.group(3)} ' if match.group(3) else ''
        return f'{value} {unit}/{per}{match.group(4)}'
    return f'{value} {unit}'


def parse_dose(part: str) -> str | None:
    """
    Дозировка целиком, включая комбинированные препараты.

    «5 мг+160 мг» — это один препарат из двух веществ, а не две дозировки.
    Пока правило требовало одну дозировку на долю, такая запись не опознавалась
    и целиком уезжала в название формы: в справочнике заводились «формы» вроде
    «Таблетки покрытые пленочной оболочкой 5 мг+160 мг». Комбинаций много —
    почти тысяча наименований.
    """
    chunks = [c.strip() for c in part.split('+')]
    parsed = []
    for chunk in chunks:
        found = DOSE_ONE.match(chunk)
        if not found:
            return None
        parsed.append(normalize_dose(found))
    return ' + '.join(parsed)


def normalize_form(text: str) -> str:
    """
    Приводит запись формы к сравнимому виду.

    Реестр пишет и «таблетки, покрытые пленочной оболочкой», и то же самое без
    запятой. Без приведения одна форма двоится и в подсказке идут две одинаковые
    строки подряд.
    """
    text = re.sub(r'\s+', ' ', text.replace(',', ' ')).strip(' -;.')
    return text[0].upper() + text[1:] if text else ''


def parse_pack(entry: str) -> int | None:
    """
    Сколько штук в упаковке.

    Реестр перечисляет вложенность от внутренней тары к внешней:
    `14 шт. - блистеры (2 шт.) - пачки картонные (28 шт.)`. Нужен итог на пачку,
    то есть **последнее** число в скобках. Первое — это блистер, и «купил
    упаковку» на него дало бы вдвое меньше, чем на самом деле.
    """
    found = PACK.findall(entry)
    if found:
        return int(found[-1])
    # Без вложенности упаковка описана прямо: «таблетки, 25 мг, 30 шт. - флаконы».
    plain = re.search(r'(?<![(\d])(\d{1,4})\s*шт\.', entry)
    return int(plain.group(1)) if plain else None


def plausible_pack(value: int | None) -> int | None:
    """
    Отсев заведомо не бытовых упаковок.

    В реестре рядом с домашними пачками лежат больничные короба на тысячи
    таблеток. Предлагать «купил упаковку 6000 шт.» человеку с гипертонией
    бессмысленно, а ошибиться кнопкой — значит испортить остаток.
    """
    return value if value is not None and 1 <= value <= 200 else None


def parse_entry(entry: str) -> tuple[str, str | None]:
    """
    Разбирает одну запись упаковки.

    Реестр держит порядок: `форма, дозировка, фасовка - упаковка - упаковка`.
    Поэтому форма — всё до первой доли, похожей на дозировку, а дозировка —
    первая такая доля. Первая, а не любая: у капель это «1 %», а следующие
    «5 мл» — объём флакона, и подставлять его как силу препарата нельзя.
    """
    head = re.split(r'\s+-\s+', entry)[0]
    form_parts: list[str] = []
    dose: str | None = None

    for part in (p.strip() for p in head.split(',')):
        if not part:
            continue
        found = parse_dose(part)
        if found:
            if dose is None:
                dose = found
        elif dose is None and not COUNT.match(part):
            form_parts.append(part)

    return normalize_form(', '.join(form_parts)), dose


def split_entries(raw: str) -> list[str]:
    """
    Разбивает поле «Формы выпуска» на отдельные записи упаковки.

    Куски, начинающиеся с дефиса, — это хвосты упаковки от предыдущей записи
    («- пачки картонные (30 шт.)»). Раньше они просто отбрасывались, и вместе с
    ними терялось количество в упаковке: в записи
    `25 мг, 14 шт. - блистеры (2 шт.)  - пачки картонные (28 шт.)`
    итог на пачку стоит именно в хвосте, а до него оставались 14 таблеток
    блистера и два блистера. Поэтому хвост не выбрасываем, а приклеиваем к своей
    записи — форму и дозировку он всё равно не портит, они берутся из головы.
    """
    text = RX_NOISE.sub('', raw or '').strip(' ;/')
    entries: list[str] = []
    for part in (p.strip() for p in re.split(r'\s{2,}|;\s*', text)):
        if not part:
            continue
        if part.startswith('-'):
            if entries:
                entries[-1] += ' ' + part
            continue
        entries.append(part)
    return entries


def is_homeopathic(forms: str, group: str) -> bool:
    """
    Гомеопатия зарегистрирована как лекарство и лежит в том же реестре, но
    лекарством в обычном смысле не является: доказанного действующего вещества
    в ней нет. Человек имеет право это знать, поэтому препарат помечается, а не
    выбрасывается — выбрасывать значит решать за него.

    Признак стоит в двух местах и не всегда в обоих сразу: у одних он в форме
    выпуска («гранулы гомеопатические»), у других — только в фармгруппе
    («гомеопатическое средство»), поэтому проверяются оба.
    """
    return 'гомеопат' in forms.lower() or 'гомеопат' in group.lower()


def is_substance(forms: str, group: str) -> bool:
    """
    Фармацевтическая субстанция — сырьё для производства, а не то, что лежит в
    домашней аптечке. В реестре их пятая часть, и в подсказке они мешают:
    человек набирает «ди», а ему предлагают «1,3-Диэтилбензимидазолия трийодид».
    """
    return forms.lower().lstrip(' -;/').startswith('субстанция') or group.strip() in ('', '~')


def dose_key(dose: str) -> tuple[str, float]:
    """Сортировка по числу внутри единицы, а не по строке: 5 мг раньше 100 мг."""
    value, unit = dose.split(' ', 1)
    # У комбинации сортируем по первому веществу — оно основное.
    try:
        number = float(value.replace(',', '.').replace(' ', ''))
    except ValueError:
        number = 0.0
    return unit, number


def build(blob: bytes) -> dict:
    book, sheet = open_active_sheet(blob)
    # наименование → форма → набор дозировок
    merged: dict[str, dict] = {}
    rows = skipped = 0

    for row in sheet.iter_rows(min_row=FIRST_DATA_ROW, values_only=True):
        trade = str(row[COL_TRADE] or '').strip()
        if not trade:
            continue

        raw_forms = str(row[COL_FORMS] or '')
        raw_group = str(row[COL_GROUP] or '')
        if is_substance(raw_forms, raw_group):
            skipped += 1
            continue
        rows += 1

        mnn = str(row[COL_MNN] or '').strip()
        if mnn in ('~', '-'):
            mnn = ''

        item = merged.setdefault(
            trade.lower(), {'n': trade, 'i': mnn, 'makers': set(), 'forms': {}, 'homeo': False}
        )
        if not item['i'] and mnn:
            item['i'] = mnn
        if is_homeopathic(raw_forms, raw_group):
            item['homeo'] = True

        maker = str(row[COL_MAKER] or '').strip()
        if maker and maker not in ('~', '-'):
            item['makers'].add(maker)

        for entry in split_entries(raw_forms):
            form, dose = parse_entry(entry)
            if not form:
                continue
            bucket = item['forms'].setdefault(form, {'doses': set(), 'packs': set()})
            if dose:
                bucket['doses'].add(dose)
            pack = plausible_pack(parse_pack(entry))
            if pack:
                bucket['packs'].add(pack)

    book.close()

    forms_index: dict[str, int] = {}
    makers_index: dict[str, int] = {}
    items = []
    for item in merged.values():
        variants = []
        for form, bucket in item['forms'].items():
            index = forms_index.setdefault(form, len(forms_index))
            variants.append([index, sorted(bucket['doses'], key=dose_key)[:14], sorted(bucket['packs'])[:6]])
        # Формы по частоте не отсортировать — сортируем по названию, чтобы
        # порядок был устойчив между сборками.
        variants.sort(key=lambda v: v[0])

        record: dict = {'n': item['n']}
        # 1 — БАД (собирается другим генератором), 2 — гомеопатия. Обычное
        # лекарство метки не несёт: их подавляющее большинство, и лишнее поле
        # на каждой записи стоило бы справочнику лишних килобайт.
        if item['homeo']:
            record['k'] = 2
        if item['i']:
            record['i'] = item['i']
        if variants:
            record['v'] = variants
        # Производителей у одного наименования бывает десяток. Держим до трёх:
        # человеку нужно узнать свою пачку, а не перечислить весь рынок.
        makers = sorted(item['makers'])[:3]
        if makers:
            record['m'] = [makers_index.setdefault(name, len(makers_index)) for name in makers]
        items.append(record)

    items.sort(key=lambda x: x['n'].lower())
    forms = [name for name, _ in sorted(forms_index.items(), key=lambda kv: kv[1])]
    makers = [name for name, _ in sorted(makers_index.items(), key=lambda kv: kv[1])]
    return {
        'source': 'ГРЛС',
        'rows': rows,
        'skipped': skipped,
        'forms': forms,
        'makers': makers,
        'items': items,
    }


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
    with_form = sum(1 for i in data['items'] if i.get('v'))
    with_dose = sum(1 for i in data['items'] if any(v[1] for v in i.get('v', [])))
    with_pack = sum(1 for i in data['items'] if any(len(v) > 2 and v[2] for v in i.get('v', [])))
    with_maker = sum(1 for i in data['items'] if i.get('m'))
    multi = sum(1 for i in data['items'] if len(i.get('v', [])) > 1)
    homeo = sum(1 for i in data['items'] if i.get('k') == 2)
    total = len(data['items'])
    print(
        f'строк реестра: {data["rows"]}, пропущено субстанций: {data["skipped"]}\n'
        f'наименований после слияния: {total}\n'
        f'  с международным наименованием: {with_mnn} ({with_mnn / total:.1%})\n'
        f'  с формой выпуска: {with_form} ({with_form / total:.1%})\n'
        f'  с дозировками: {with_dose} ({with_dose / total:.1%})\n'
        f'  с количеством в упаковке: {with_pack} ({with_pack / total:.1%})\n'
        f'  с производителем: {with_maker} ({with_maker / total:.1%})\n'
        f'  с несколькими формами: {multi} ({multi / total:.1%})\n'
        f'  помечено гомеопатией: {homeo}\n'
        f'различных форм выпуска: {len(data["forms"])}, производителей: {len(data["makers"])}\n'
        f'выгрузка от {stamp}, файл {out} — {out.stat().st_size / 1024:.0f} КБ',
        file=sys.stderr,
    )


if __name__ == '__main__':
    main()
