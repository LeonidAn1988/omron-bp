/**
 * Русские окончания для счётного существительного: «1 запись», «2 записи»,
 * «5 записей». Библиотеку локализации ради одного правила не тянем, а без него
 * интерфейс выдаёт «5 препарата» — мелочь, но именно по таким мелочам видно,
 * что текст писали не для людей.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100
  if (mod100 >= 11 && mod100 <= 14) return many
  const mod10 = mod100 % 10
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}
