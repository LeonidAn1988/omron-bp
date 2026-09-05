/** Когда дневник считается незащищённым и когда пора делать копию. */
import {
  shouldAutoBackup,
  shouldWriteBackup,
  backupWarning,
  describeBackupAge,
  backupFilename,
  recordsBehind,
  STALE_DAYS,
  BEHIND_COUNT,
  NO_BACKUP,
} from './build/api.mjs'

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
    'свежая копия и одна новая запись — молчим',
    backupWarning({ lastAt: now - 2 * DAY, lastCount: 5 }, 6, now) === null,
  )
  check(
    'выгрузка с прибора не ждёт неделю',
    backupWarning({ lastAt: now - 1000, lastCount: 5 }, 5 + BEHIND_COUNT, now) === 'behind',
    'десятки записей разом — предупреждаем сразу',
  )
  check(
    'на одну меньше порога ещё молчим',
    backupWarning({ lastAt: now - 1000, lastCount: 5 }, 5 + BEHIND_COUNT - 1, now) === null,
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

  check('счётчик записей вне копии', recordsBehind({ lastAt: now, lastCount: 5 }, 12) === 7)
  check(
    'удаление не считается отставанием',
    recordsBehind({ lastAt: now, lastCount: 5 }, 3) === 0,
    'иначе кнопка обещала бы спасти несуществующие записи',
  )

  const name = backupFilename(new Date(2026, 0, 5, 9, 0, 0).getTime())
  check('имя файла с датой', name === 'дневник-2026-01-05.json', name)
  // В общей папке семьи лежит несколько копий — имя должно говорить, чья.
  const сИменем = backupFilename(new Date(2026, 0, 5, 9, 0, 0).getTime(), 'Отец')
  check('имя человека попадает в название файла', сИменем === 'дневник-Отец-2026-01-05.json', сИменем)
  check('«Я» в название не идёт', backupFilename(new Date(2026, 0, 5).getTime(), 'Я') === 'дневник-2026-01-05.json')
  check('косые и двоеточия из имени вычищены', !backupFilename(Date.now(), 'а/б:в').includes('/'))

  // ── замок файла ──────────────────────────────────────────────────────────
  // Файл стареет не только от новых записей. Оба случая ниже были дефектами:
  // экран обещал зашифрованную копию, пока в файле лежал открытый дневник.
  const сошлись = { lastAt: Date.now(), lastCount: 7 }

  check(
    'счётчики сошлись, замок прежний — не пишем',
    shouldWriteBackup(сошлись, 7, { written: 'off', current: 'off' }, false) === false,
  )
  check(
    'включили шифрование при сошедшихся счётчиках — переписываем',
    shouldWriteBackup(сошлись, 7, { written: 'off', current: 'on:секрет' }, false) === true,
  )
  check(
    'сменили пароль — переписываем',
    shouldWriteBackup(сошлись, 7, { written: 'on:старый', current: 'on:новый' }, false) === true,
  )
  check(
    'выключили шифрование — переписываем открытым',
    shouldWriteBackup(сошлись, 7, { written: 'on:секрет', current: 'off' }, false) === true,
  )
  check(
    'первый заход после запуска лишней записи не делает',
    shouldWriteBackup(сошлись, 7, { written: null, current: 'on:секрет' }, false) === false,
  )
  check(
    'только что выбранный файл пишем, даже когда счётчики сошлись',
    shouldWriteBackup(сошлись, 7, { written: null, current: 'off' }, true) === true,
  )
  check(
    'новые записи при прежнем замке — пишем как раньше',
    shouldWriteBackup({ lastAt: Date.now(), lastCount: 5 }, 7, { written: 'off', current: 'off' }, false) === true,
  )
  // Записать поверх копии пустоту — потерять её. Ни смена пароля, ни свежий
  // файл того не стоят.
  check(
    'пустой дневник не пишем даже при смене замка',
    shouldWriteBackup({ lastAt: null, lastCount: 0 }, 0, { written: 'off', current: 'on:x' }, false) === false,
  )
  check(
    'пустой дневник не пишем и в только что выбранный файл',
    shouldWriteBackup({ lastAt: null, lastCount: 0 }, 0, { written: null, current: 'off' }, true) === false,
  )

  return failures
}
