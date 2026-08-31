export async function seedAll(page, now) {
  await page.evaluate(async (now) => {
    const DAY = 86_400_000
    const midnight = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime() }
    const day0 = midnight(now)
    const at = (o, h) => day0 + o * DAY + h * 3_600_000
    const marksMorning = []
    for (let i = -25; i <= 0; i++) if (i !== -5 && i !== -9) marksMorning.push(at(i, 8))
    const marksMetf = []
    for (let i = -25; i <= 0; i++) { marksMetf.push(at(i, 8)); if (i < 0) marksMetf.push(at(i, 19)) }
    const marksAml = []
    for (let i = -25; i < 0; i++) if (i % 4 !== 0) marksAml.push(at(i, 20))
    const medicines = [
      { id: 'm1', name: 'Периндоприл', dose: '5 мг', inn: 'Периндоприл',
        form: 'Таблетки, покрытые пленочной оболочкой', maker: 'Сервье',
        packSize: 30, left: 18, perDay: null, expires: Date.UTC(2027, 4, 31),
        times: ['08:00'], perTime: 1, meal: 'before', taken: marksMorning, leftAt: now - 3*DAY },
      { id: 'm2', name: 'Амлодипин', dose: '5 мг', inn: 'Амлодипин', form: 'Таблетки',
        maker: 'Озон', packSize: 30, left: 3, perDay: null, expires: Date.UTC(2027, 7, 31),
        times: ['20:00'], perTime: 1, taken: marksAml, leftAt: now - DAY },
      { id: 'm3', name: 'Метформин', dose: '850 мг', inn: 'Метформин', form: 'Таблетки',
        maker: 'Гедеон Рихтер', packSize: 60, left: 30, perDay: null, expires: Date.UTC(2027, 10, 30),
        times: ['08:00', '19:00'], perTime: 2, meal: 'after', taken: marksMetf, leftAt: now - 5*DAY },
      { id: 'm4', name: 'Аторвастатин', dose: '20 мг', inn: 'Аторвастатин', form: 'Таблетки',
        maker: 'Канонфарма', packSize: 30, left: 25, perDay: null, expires: Date.UTC(2027, 7, 31),
        times: ['21:00'], perTime: 1, taken: [] },
      { id: 'm5', name: 'Витамин D3', dose: '2000 МЕ', kind: 1, inn: 'Колекальциферол',
        form: 'капсулы', maker: 'ООО «Эвалар»', packSize: 60, left: 40, perDay: 1,
        expires: Date.UTC(2027, 0, 31), times: ['09:00'], perTime: 1,
        autoDeduct: true, taken: [at(-3,9), at(-2,9), at(0,9)], leftAt: now - DAY },
    ]
    const readings = []
    for (let i = -40; i <= 0; i++) {
      readings.push({ id: `bp-${i}`, kind: 'bp', ts: at(i, 8) + 600_000, user: 1, source: 'device',
        sys: 128 + ((i % 7) + 7) % 7, dia: 82 + ((i % 4) + 4) % 4,
        bpm: 68 + ((i % 5) + 5) % 5, ihb: i % 11 === 0, mov: i % 13 === 0 })
    }
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    await new Promise((res, rej) => {
      const tx = db.transaction(['medicines','readings','meta'], 'readwrite')
      medicines.forEach((m) => tx.objectStore('medicines').put(m))
      readings.forEach((r) => tx.objectStore('readings').put(r))
      tx.objectStore('meta').put({ trackGlucose: true, seenIntro: true, onboarded: true }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, now)
}

