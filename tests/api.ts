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

export { installWebPlatform, useIndexedDbFactory } from '../src/platform/web'
