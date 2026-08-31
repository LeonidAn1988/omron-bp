/**
 * Шифрование резервной копии.
 *
 * Проверяется то, из-за чего копия становится нечитаемой навсегда: подмена
 * пароля, повторяемость соли и вектора, распознавание открытого текста.
 */
import { encryptBackup, decryptBackup, isEncrypted } from './build/api.mjs'

export async function run() {
  let failures = 0
  const check = (name, condition, detail = '') => {
    if (condition) console.log(`  ok   ${name}`)
    else {
      console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }

  const дневник = JSON.stringify({ readings: [{ sys: 131, dia: 84 }], medicines: [{ name: 'Периндоприл' }] })

  const конверт = await encryptBackup(дневник, 'коробка-спичек')
  check('зашифрованное не содержит исходного текста', !конверт.includes('Периндоприл'), конверт.slice(0, 80))
  check('конверт распознаётся как зашифрованный', isEncrypted(конверт))
  check('обычная копия зашифрованной не считается', isEncrypted(дневник) === false)
  check('мусор не считается зашифрованным', isEncrypted('не json вовсе') === false)

  const обратно = await decryptBackup(конверт, 'коробка-спичек')
  check('расшифровывается ровно то, что зашифровали', обратно === дневник)

  let отказ = null
  try {
    await decryptBackup(конверт, 'другой пароль')
  } catch (e) {
    отказ = e.message
  }
  check('неверный пароль не открывает копию', отказ !== null, 'иначе шифрование бессмысленно')
  check('и говорит об этом по-человечески', отказ === 'Не подошёл пароль', String(отказ))

  // Соль и вектор обязаны быть своими у каждой записи: иначе одинаковый пароль
  // даёт одинаковый шифротекст, и по нему видно, что копия не изменилась.
  const второй = await encryptBackup(дневник, 'коробка-спичек')
  check('две копии одного дневника не совпадают побайтно', второй !== конверт)
  const a = JSON.parse(конверт)
  const b = JSON.parse(второй)
  check('соль своя у каждой копии', a.kdf.salt !== b.kdf.salt)
  check('вектор свой у каждой копии', a.iv !== b.iv)
  check('обе всё равно открываются тем же паролем', (await decryptBackup(второй, 'коробка-спичек')) === дневник)

  // Повреждённый файл и неверный пароль — разные беды, и путать их нельзя.
  let порча = null
  try {
    await decryptBackup('{ это не конверт', 'пароль')
  } catch (e) {
    порча = e.message
  }
  check('повреждённый файл назван повреждённым, а не «неверный пароль»', /повреждён/.test(String(порча)), String(порча))

  let чужая = null
  try {
    await decryptBackup(JSON.stringify({ omron: 'encrypted', v: 99 }), 'пароль')
  } catch (e) {
    чужая = e.message
  }
  check('копия из будущей версии просит обновиться', /обновите/.test(String(чужая)), String(чужая))

  let пусто = null
  try {
    await encryptBackup(дневник, '')
  } catch (e) {
    пусто = e.message
  }
  check('пустой пароль не принимается', пусто !== null)

  const длинный = 'ц'.repeat(200_000)
  const большой = await encryptBackup(длинный, 'пароль')
  check('кириллица длиной в двести тысяч знаков переживает круг', (await decryptBackup(большой, 'пароль')) === длинный)

  return failures
}
