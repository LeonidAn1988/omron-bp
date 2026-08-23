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
} from '../src/db/store'

export { plural } from '../src/logic/plural'

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
  mergeBooks,
  FORM_GROUPS,
  KIND_LABEL,
} from '../src/logic/drugs'

export { buildCalendar, countCalendarEvents, foldLine, doseTitle } from '../src/logic/calendar'

export {
  HORIZON_DAYS,
  REPEATS,
  REPEAT_INTERVAL_MIN,
  buildReminders,
  doseLine,
  reminderId,
  reminderTimes,
} from '../src/logic/reminders'

export {
  medicineAlert,
  supplyDays,
  daysToExpiry,
  sortMedicines,
  countAlerts,
  EXPIRY_SOON_DAYS,
  SUPPLY_SOON_DAYS,
  monthToExpiry,
  expiryToMonth,
  perDayOf,
  perTimeOf,
  projectedLeft,
  parseTime,
  formatTime,
  normalizeTimes,
  dosesToday,
  pendingToday,
  markTaken,
  undoTaken,
  setLeft,
  effectiveLeft,
  isEstimated,
  runsOutAt,
  shortForm,
  restockList,
  restockText,
  displayAlert,
  dosesOn,
  dayStatus,
  partOfDay,
  markTakenAt,
  addPack,
  packsNeeded,
  adherence,
  DAY_PARTS,
  DAY_PART_TITLE,
  RESTOCK_DAYS,
  KEEP_INTAKES_DAYS,
} from '../src/logic/medicines'

export {
  shouldAutoBackup,
  backupWarning,
  describeBackupAge,
  backupFilename,
  STALE_DAYS,
  BEHIND_COUNT,
  NO_BACKUP,
  recordsBehind,
} from '../src/logic/backup'

export { installWebPlatform, useIndexedDbFactory } from '../src/platform/web'
