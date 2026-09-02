/**
 * Единая точка входа для тестов.
 *
 * Собирается одним бандлом намеренно: реестр платформы в `platform/ports.ts`
 * хранит состояние в модуле, и при раздельных бандлах установленная платформа
 * была бы не видна остальным — тесты падали бы с «платформа не установлена».
 */

export { parseRecord } from '../src/ble/hem6232t'

export {
  parseSFloat,
  parseGlucoseMeasurement,
  parseGlucoseContext,
  parseRacpResponse,
} from '../src/ble/glucose'

export { toCsv, toJson, parseCsv, parseJson, parseImportFile } from '../src/logic/io'

export { encryptBackup, decryptBackup, isEncrypted } from '../src/logic/crypto'

export {
  getAllMeasurements,
  putMeasurements,
  addNewMeasurements,
  deleteMeasurement,
  clearMeasurements,
  loadSettings,
  saveSettings,
  deviceMeasurementId,
  getAllMedicines,
  putMedicine,
  deleteMedicine,
  getAllTombstones,
  saveTombstones,
} from '../src/db/store'

export { plural, monthYear } from '../src/logic/plural'
export {
  firstPerson,
  activePersonOf,
  ownerOf,
  medicinesOf,
  deviceUserOf,
  freeDeviceUsers,
  newPersonId,
  intakeTimesOf,
  ПЕРВЫЙ, MAX_PEOPLE } from '../src/logic/people'

export {
  normalize,
  searchDrugs,
  searchHits,
  describeDrug,
  variantsOf,
  makersOf,
  formGroup,
  filterByForm,
  instructionUrl,
  pharmacyUrl,
  mergeBooks,
  FORM_GROUPS,
  KIND_LABEL,
} from '../src/logic/drugs'

export { buildCalendar, countCalendarEvents, foldLine, doseTitle } from '../src/logic/calendar'

export {
  HORIZON_DAYS,
  MAX_REMINDERS,
  REPEATS,
  REPEAT_INTERVAL_MIN,
  buildReminders,
  doseLine,
  reminderId,
  reminderTimes,
  shortBody,
} from '../src/logic/reminders'

export {
  DAY_PARTS,
  DAY_PART_TITLE,
  EXPIRY_SOON_DAYS,
  KEEP_INTAKES_DAYS,
  RESTOCK_DAYS,
  SUPPLY_SOON_DAYS,
  addPack,
  adherence,
  foldHistory,
  partWindowOpen,
  historyTotal,
  monthKey,
  countAlerts,
  dayStatus,
  daysToExpiry,
  displayAlert,
  dosesOn,
  dosesToday,
  effectiveLeft,
  expiryToMonth,
  formatTime,
  isEstimated,
  markTaken,
  markTakenAt,
  medicineAlert,
  monthToExpiry,
  normalizeTimes,
  packsNeeded,
  parseTime,
  partOfDay,
  pendingToday,
  perDayOf,
  perTimeOf,
  projectedLeft,
  restockList,
  restockText,
  runsOutAt,
  setLeft,
  shortForm,
  sortMedicines,
  supplyDays,
  trackedSince,
  undoTaken,
} from '../src/logic/medicines'

export {
  shouldAutoBackup,
  shouldWriteBackup,
  backupWarning,
  describeBackupAge,
  backupFilename,
  STALE_DAYS,
  BEHIND_COUNT,
  NO_BACKUP,
  recordsBehind,
} from '../src/logic/backup'
export { parseChangelog, currentVersion } from '../src/logic/changelog'
export { fillMissingFromCopy, mergeRestoredSettings, takesPersonalFrom } from '../src/logic/io'

/** Стек экранов: чистая модель навигации, без window и document. */
export {
  rootStack,
  tabOf,
  topOf,
  push,
  pop,
  replaceTop,
  depthOf,
  tapTab,
  toTab,
  pathOf,
  prune,
} from '../src/logic/nav'

/** Правила и подписи настроек: без React, чтобы проверялись обычными тестами. */
export {
  SECTIONS,
  THEMES,
  TEXT_SCALES,
  DENSITIES,
  INTAKE_SLOTS,
  SUBSCREENS,
  SUBSCREEN_TITLE,
  visibleSections,
  lockedSection,
  toggleSection,
  setTrackGlucose,
  setIntakeTime,
  describeDisplay,
  describePeople,
  describeTargets,
  describeReminders,
  describeBackupRow,
  describePerson,
  describeSections,
} from '../src/logic/settings'

export { installWebPlatform, useIndexedDbFactory } from '../src/platform/web'

import type { Medicine } from '../src/types'
export { medicinesForReminder } from '../src/logic/reminders'

/**
 * Препарат со всеми полями типа. `Required<Medicine>` — чтобы новое поле в типе
 * ломало typecheck, пока его не добавят сюда и в разбор копии: круг «снимок →
 * файл → разбор» в tests/io.test.mjs сверяет каждое поле этой фикстуры.
 */
export const FULL_MEDICINE: Required<Medicine> = {
  id: 'm-full', name: 'Периндоприл', dose: '5 мг', inn: 'Периндоприл', form: 'Таблетки', maker: 'Сервье',
  regNumber: 'ЛП-000001', kind: 1, packSize: 30, left: 12, perDay: 1, expires: Date.UTC(2027, 3, 30),
  note: 'после завтрака', leftAt: 1_700_000_000_000, times: ['08:00', '20:00'], perTime: 1, meal: 'after',
  autoDeduct: true, taken: [1_700_000_000_000, 1_700_086_400_000],
  owner: 'p-dad', since: 1_690_000_000_000, startedAt: 1_680_000_000_000, foldedUntil: 1_699_000_000_000,
  history: { '2025-07': { planned: 62, taken: 58 }, '2025-08': { planned: 62, taken: 60 } },
}
