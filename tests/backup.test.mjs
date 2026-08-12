/** Когда дневник считается незащищённым и когда пора делать копию. */
import { shouldAutoBackup, backupWarning, describeBackupAge, backupFilename, STALE_DAYS, NO_BACKUP } from './build/api.mjs'

export function run() {
  let failures = 0
  const check = (name, condition, detail = '') => {
    if (condition) console.log(`  ok   ${name}`)
    else {
      console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }

  const DAY = 24 * 60 * 60 * 1000
  const now = new Date(2026, 7, 13, 12, 0, 0).getTime()

  // ── когда писать автокопию ───────────────────────────────────────────────
  check('пустой дневник копировать незачем', shouldAutoBackup(NO_BACKUP, 0) === false)
  check('первые записи требуют копии', shouldAutoBackup(NO_BACKUP, 1) === true)
  check('дневник разошёлся с копией — пишем', shouldAutoBackup({ lastAt: now, lastCount: 10 }, 11) === true)
  check('дневник совпадает с копией — не пишем', shouldAutoBackup({ lastAt: now, lastCount: 10 }, 10) === false)
  check(
    'удаление записи тоже расхождение',
    shouldAutoBackup({ lastAt: now, lastCount: 10 }, 9) === true,
    'иначе копия останется с лишней записью и восстановление вернёт удалённое',
  )

  // ── когда предупреждать ──────────────────────────────────────────────────
  check('без записей не пугаем', backupWarning(NO_BACKUP, 0, now) === null)
  check('есть записи, копий нет — предупреждаем', backupWarning(NO_BACKUP, 5, now) === 'never')
  check(
    'свежая копия — молчим',
    backupWarning({ lastAt: now - 2 * DAY, lastCount: 5 }, 6, now) === null,
  )
  check(
    'копия совпадает с дневником — молчим даже через год',
    backupWarning({ lastAt: now - 365 * DAY, lastCount: 5 }, 5, now) === null,
    'новых данных не появилось, терять нечего',
  )
  check(
    'старая копия и новые записи — предупреждаем',
    backupWarning({ lastAt: now - (STALE_DAYS + 1) * DAY, lastCount: 5 }, 6, now) === 'stale',
  )
  check(
    'ровно на границе уже предупреждаем',
    backupWarning({ lastAt: now - STALE_DAYS * DAY, lastCount: 5 }, 6, now) === 'stale',
  )

  // ── подписи ──────────────────────────────────────────────────────────────
  check('нет копии', describeBackupAge(null, now) === 'копий ещё не было')
  check('сегодня', describeBackupAge(now - 3 * 60 * 60 * 1000, now) === 'сегодня')
  check('вчера', describeBackupAge(now - DAY, now) === 'вчера')
  check('3 дня назад', describeBackupAge(now - 3 * DAY, now) === '3 дня назад')
  check('10 дней назад', describeBackupAge(now - 10 * DAY, now) === '10 дней назад')
  check('месяц назад', describeBackupAge(now - 35 * DAY, now) === 'месяц назад')
  check('несколько месяцев', describeBackupAge(now - 95 * DAY, now) === '3 мес. назад')

  const name = backupFilename(new Date(2026, 0, 5, 9, 0, 0).getTime())
  check('имя файла с датой в начале', name === 'дневник-здоровья-2026-01-05.json', name)

  return failures
}
