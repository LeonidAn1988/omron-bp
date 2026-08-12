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
} from '../src/db/store'

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
