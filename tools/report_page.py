#!/usr/bin/env python3
"""
Сборка отчёта в читаемую страницу.

    python3 tools/report_page.py <исходный.md> <готовый.html>

Отчёт длинный — сто килобайт разметки, тринадцать разделов, — и его будут
перечитывать по частям. Поэтому не «markdown как есть», а страница с закреплённым
оглавлением и типографикой под долгое чтение.

Шрифты только системные: нужна кириллица, а внешние шрифты в артефактах
заблокированы политикой безопасности, и ссылка на них дала бы молчаливую подмену
на что попало. Тело набрано Georgia — документ читают, а не сканируют; заголовки
и таблицы системным гротеском, пути к файлам моноширинным.

Цвета взяты у самого приложения: синий кардиограммы и тёплый светлый фон,
приглушённые до текстовой насыщенности.
"""

import html
import re
import sys
from pathlib import Path

import markdown

# Пометки надёжности, которые документ вводит сам. Показываем их значками:
# это не украшение, а шкала доверия, и она должна читаться глазом.
# Кавычки вокруг пометки съедаются вместе с ней: в исходнике она набрана как
# «толкование», а значок в кавычках выглядит опечаткой.
MARKS = [
    (re.compile(r'[«"]?\s*(?:\*\*)?не проверено(?:\*\*)?\s*[»"]?', re.I), 'не проверено', 'unverified'),
    (re.compile(r'[«"]\s*толкование\s*[»"]', re.I), 'толкование', 'reading'),
]

CSS = """
:root {
  color-scheme: light dark;

  --ink: #101418;
  --ink-soft: #414b57;
  --muted: #6a7481;
  --paper: #f6f5f2;
  --card: #ffffff;
  --rule: #ddd9d2;
  --accent: #1f5896;
  --accent-soft: #e7eef7;
  --warn: #8f5510;
  --warn-soft: #f7ecdd;
  --danger: #9c2b2b;
  --danger-soft: #f7e6e4;

  --measure: 68ch;
  --rail: 17rem;

  --serif: Georgia, "Iowan Old Style", "Times New Roman", serif;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ink: #e9e7e2;
    --ink-soft: #b9c0c9;
    --muted: #8b95a1;
    --paper: #14161a;
    --card: #1b1e23;
    --rule: #2e333a;
    --accent: #7cb0ea;
    --accent-soft: #1b2735;
    --warn: #d9a05c;
    --warn-soft: #2b2318;
    --danger: #e08a84;
    --danger-soft: #2e1d1c;
  }
}

:root[data-theme="dark"] {
  --ink: #e9e7e2;
  --ink-soft: #b9c0c9;
  --muted: #8b95a1;
  --paper: #14161a;
  --card: #1b1e23;
  --rule: #2e333a;
  --accent: #7cb0ea;
  --accent-soft: #1b2735;
  --warn: #d9a05c;
  --warn-soft: #2b2318;
  --danger: #e08a84;
  --danger-soft: #2e1d1c;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font: 400 1.0625rem/1.7 var(--serif);
  -webkit-text-size-adjust: 100%;
}

.shell {
  display: grid;
  grid-template-columns: var(--rail) minmax(0, 1fr);
  gap: clamp(1.5rem, 4vw, 4rem);
  max-width: 78rem;
  margin: 0 auto;
  padding: clamp(1.25rem, 4vw, 3.5rem) clamp(1rem, 4vw, 2.5rem) 6rem;
  align-items: start;
}

@media (max-width: 60rem) {
  .shell { grid-template-columns: minmax(0, 1fr); }
}

/* ── оглавление ─────────────────────────────────────────────────────────── */

.toc {
  position: sticky;
  top: clamp(1.25rem, 4vw, 3.5rem);
  font-family: var(--sans);
  font-size: 0.8125rem;
  line-height: 1.45;
  max-height: calc(100vh - 6rem);
  overflow-y: auto;
}

.toc__title {
  font-size: 0.6875rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 0.75rem;
}

.toc ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.1rem; counter-reset: toc; }

.toc a {
  display: grid;
  grid-template-columns: 1.6rem 1fr;
  gap: 0.35rem;
  padding: 0.3rem 0.4rem;
  border-radius: 4px;
  color: var(--ink-soft);
  text-decoration: none;
}
.toc a::before {
  counter-increment: toc;
  content: counter(toc);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.toc a:hover { background: var(--accent-soft); color: var(--accent); }
.toc a:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

@media (max-width: 60rem) {
  .toc { position: static; max-height: none; border-bottom: 1px solid var(--rule); padding-bottom: 1rem; }
}

/* ── текст ──────────────────────────────────────────────────────────────── */

main { max-width: var(--measure); min-width: 0; }

h1 {
  font-family: var(--sans);
  font-size: clamp(1.75rem, 4.5vw, 2.5rem);
  font-weight: 650;
  line-height: 1.15;
  letter-spacing: -0.02em;
  text-wrap: balance;
  margin: 0 0 1.25rem;
}

h2 {
  font-family: var(--sans);
  font-size: 1.5rem;
  font-weight: 620;
  line-height: 1.25;
  letter-spacing: -0.012em;
  text-wrap: balance;
  margin: 3.5rem 0 1rem;
  padding-top: 1.25rem;
  border-top: 2px solid var(--ink);
  scroll-margin-top: 1.5rem;
}

h3 {
  font-family: var(--sans);
  font-size: 1.125rem;
  font-weight: 620;
  line-height: 1.3;
  text-wrap: balance;
  margin: 2.25rem 0 0.6rem;
  scroll-margin-top: 1.5rem;
}

h4 {
  font-family: var(--sans);
  font-size: 0.9375rem;
  font-weight: 620;
  margin: 1.75rem 0 0.5rem;
}

p { margin: 0 0 1.1rem; }

a { color: var(--accent); text-underline-offset: 2px; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }

strong { font-weight: 700; }

ul, ol { margin: 0 0 1.2rem; padding-left: 1.35rem; display: grid; gap: 0.4rem; }
li { padding-left: 0.15rem; }
li > ul, li > ol { margin-top: 0.4rem; }

hr { border: 0; border-top: 1px solid var(--rule); margin: 2.5rem 0; }

blockquote {
  margin: 0 0 1.2rem;
  padding: 0.9rem 1.1rem;
  background: var(--card);
  border-left: 3px solid var(--accent);
  border-radius: 0 6px 6px 0;
  color: var(--ink-soft);
}
blockquote p:last-child { margin-bottom: 0; }

code {
  font-family: var(--mono);
  font-size: 0.85em;
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 0.08em 0.34em;
  word-break: break-word;
}

pre {
  font-family: var(--mono);
  font-size: 0.8125rem;
  line-height: 1.55;
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: 8px;
  padding: 0.9rem 1rem;
  overflow-x: auto;
  margin: 0 0 1.2rem;
}
pre code { background: none; border: 0; padding: 0; font-size: inherit; }

/* ── таблицы ────────────────────────────────────────────────────────────── */

.table-wrap { overflow-x: auto; margin: 0 0 1.4rem; }

table {
  border-collapse: collapse;
  width: 100%;
  font-family: var(--sans);
  font-size: 0.875rem;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}

th, td {
  text-align: left;
  vertical-align: top;
  padding: 0.6rem 0.85rem 0.6rem 0;
  border-bottom: 1px solid var(--rule);
}
th {
  font-weight: 620;
  font-size: 0.75rem;
  letter-spacing: 0.045em;
  text-transform: uppercase;
  color: var(--muted);
  border-bottom-width: 1.5px;
  white-space: nowrap;
}
tbody tr:last-child td { border-bottom: 0; }

/* ── значки надёжности ──────────────────────────────────────────────────── */

.mark {
  display: inline-block;
  font-family: var(--sans);
  font-size: 0.6875rem;
  font-weight: 620;
  letter-spacing: 0.03em;
  line-height: 1.5;
  padding: 0.1em 0.45em;
  border-radius: 3px;
  white-space: nowrap;
  vertical-align: baseline;
}
.mark--unverified { background: var(--warn-soft); color: var(--warn); }
.mark--reading { background: var(--accent-soft); color: var(--accent); }

.lede {
  font-size: 1.0625rem;
  color: var(--ink-soft);
  border-left: 3px solid var(--rule);
  padding-left: 1rem;
  margin: 0 0 2rem;
}

footer {
  margin-top: 4rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--rule);
  font-family: var(--sans);
  font-size: 0.8125rem;
  color: var(--muted);
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
"""


def slug(text: str, seen: dict) -> str:
    base = re.sub(r'[^\wа-яё]+', '-', text.lower(), flags=re.I).strip('-') or 'razdel'
    seen[base] = seen.get(base, 0) + 1
    return base if seen[base] == 1 else f'{base}-{seen[base]}'


def build(source: Path, target: Path, title: str | None = None) -> None:
    text = source.read_text(encoding='utf-8')

    # Имя страницы задаётся снаружи: в галерее артефактов она стоит рядом с
    # десятком других, и заголовок из документа — «… : решения на ближайший
    # год» — там читается как подпись, а не как имя.
    if not title:
        first = re.match(r'#\s+(.+)', text)
        title = first.group(1).strip() if first else 'Отчёт'

    body = markdown.markdown(
        text,
        extensions=['tables', 'fenced_code', 'sane_lists', 'attr_list'],
        output_format='html5',
    )

    # Якоря на заголовки второго уровня плюс оглавление из них.
    seen: dict = {}
    пункты = []

    def anchor(match: re.Match) -> str:
        уровень, содержимое = match.group(1), match.group(2)
        чистый = re.sub(r'<[^>]+>', '', содержимое)
        якорь = slug(чистый, seen)
        if уровень == '2':
            пункты.append((якорь, чистый))
        return f'<h{уровень} id="{якорь}">{содержимое}</h{уровень}>'

    body = re.sub(r'<h([23])>(.*?)</h\1>', anchor, body, flags=re.S)

    # Таблицы в свой прокручиваемый контейнер: иначе широкая таблица тащит
    # вбок всю страницу.
    body = body.replace('<table>', '<div class="table-wrap"><table>').replace('</table>', '</table></div>')

    # Пометки надёжности — значками.
    for шаблон, подпись, вид in MARKS:
        body = шаблон.sub(f'<span class="mark mark--{вид}">{подпись}</span>', body)

    оглавление = '\n'.join(
        f'<li><a href="#{я}">{html.escape(т)}</a></li>' for я, т in пункты
    )

    страница = f"""<title>{html.escape(title)}</title>
<style>{CSS}</style>
<div class="shell">
  <nav class="toc" aria-label="Разделы отчёта">
    <p class="toc__title">Разделы</p>
    <ol>{оглавление}</ol>
  </nav>
  <main>
{body}
    <footer>
      Собрано по шести направлениям разведки с проверкой утверждений на опровержение.
      Первую версию разобрала панель критиков; замечания лежат отдельным файлом.
      Автор не юрист — правовые разделы это разбор норм, а не заключение.
    </footer>
  </main>
</div>
"""
    target.write_text(страница, encoding='utf-8')
    print(f'{target} — {len(страница) / 1024:.0f} КБ, разделов в оглавлении: {len(пункты)}')


if __name__ == '__main__':
    build(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3] if len(sys.argv) > 3 else None)
