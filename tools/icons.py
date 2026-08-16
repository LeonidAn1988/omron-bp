#!/usr/bin/env python3
"""
Исходники значков и заставки для сборки приложения.

    python3 tools/icons.py

Рисуем сами, а не правим картинки руками: геометрия знака одна и та же в
`public/icon.svg` и здесь, и расходиться им нельзя. Готовые файлы кладутся в
`assets/`, откуда `@capacitor/assets` раскладывает их по плотностям экрана
Android — от mdpi до xxxhdpi, плюс адаптивные слои и заставка.

Почему адаптивные значки нужны отдельно. Android с восьмой версии обрезает
значок под форму, выбранную в системе: круг, скруглённый квадрат, капля. Обрезка
идёт по маске, и рисунок, занимающий весь квадрат, теряет углы, поэтому знак
рисуется двумя слоями и с запасом по краям.
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path('assets')

# Цвета берутся из темы приложения: синий знака и светлый фон заставки.
BLUE = (42, 120, 214)
WHITE = (255, 255, 255)
LIGHT = (240, 239, 236)
DARK = (23, 23, 22)

# Ломаная кардиограммы в координатах 512×512 — ровно та же, что в public/icon.svg.
MARK = [(118, 288), (180, 288), (212, 208), (254, 346), (290, 254), (316, 288), (394, 288)]
MARK_WIDTH = 26
MARK_BOX = 512

# Рисуем крупнее и уменьшаем: у PIL нет сглаживания линий, а уменьшение с
# фильтром Ланцоша даёт ровно тот же эффект и без сторонних зависимостей.
SUPERSAMPLE = 4


def draw_mark(size: int, scale: float, colour=WHITE) -> Image.Image:
    """Знак на прозрачном фоне. `scale` — доля стороны, которую он занимает."""
    big = size * SUPERSAMPLE
    image = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    factor = big * scale / MARK_BOX
    shift = (big - MARK_BOX * factor) / 2
    points = [(x * factor + shift, y * factor + shift) for x, y in MARK]
    width = max(1, round(MARK_WIDTH * factor))

    draw.line(points, fill=colour, width=width, joint='curve')
    # Скруглённые концы: PIL их не умеет, дорисовываем кружки на вершинах.
    radius = width / 2
    for x, y in (points[0], points[-1]):
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=colour)

    return image.resize((size, size), Image.LANCZOS)


def on_colour(size: int, background, scale: float, colour=WHITE) -> Image.Image:
    image = Image.new('RGBA', (size, size), (*background, 255))
    image.alpha_composite(draw_mark(size, scale, colour))
    return image.convert('RGB')


def main() -> None:
    OUT.mkdir(exist_ok=True)

    # Обычный значок: знак занимает то же место, что и в вебе.
    on_colour(1024, BLUE, 1.0).save(OUT / 'icon-only.png')

    # Адаптивный значок: два слоя, система обрезает их своей маской — кругом,
    # скруглённым квадратом или каплей.
    #
    # Масштаб подобран с оглядкой на то, что делает `@capacitor/assets`: он
    # вписывает оба слоя в безопасную зону, ужимая каждый на 16,7% с каждой
    # стороны, то есть до двух третей холста. Поэтому рисунок здесь должен быть
    # **крупнее** того, что хочется увидеть на телефоне, а не мельче.
    #
    # Ужатие само по себе пропорций не меняет: слой ужимается вместе с видимой
    # областью, поэтому доля знака в исходнике и есть его доля в готовом
    # значке. Цель — те же 54%, что в квадратном варианте; при 0.87 измерение
    # непрозрачной области даёт ровно 54%.
    draw_mark(1024, 0.87).save(OUT / 'icon-foreground.png')
    Image.new('RGB', (1024, 1024), BLUE).save(OUT / 'icon-background.png')

    # Заставка — квадрат со стороной 2732: его хватает на любую ориентацию и
    # плотность, инструмент вырежет из середины нужный кусок. Знак мелкий: он
    # показывается доли секунды и не должен выглядеть криком.
    on_colour(2732, LIGHT, 0.22, BLUE).save(OUT / 'splash.png')
    on_colour(2732, DARK, 0.22, WHITE).save(OUT / 'splash-dark.png')

    for path in sorted(OUT.glob('*.png')):
        with Image.open(path) as image:
            print(f'  {path.name:24} {image.size[0]}×{image.size[1]}  {path.stat().st_size / 1024:.0f} КБ')


if __name__ == '__main__':
    main()
