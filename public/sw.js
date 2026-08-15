/**
 * Минимальный офлайн-кэш.
 *
 * Ассеты Vite версионируются хэшем в имени, поэтому их достаточно класть в кэш
 * при первом запросе. Навигацию тянем из сети — так новая версия приложения
 * подхватывается сразу, — а кэш служит запасным вариантом без связи.
 */
/**
 * Версия в имени: при смене старый кэш вычищается целиком в `activate`. Поднять
 * её нужно, когда меняется не код (он версионируется хэшем сам), а неизменные
 * по имени файлы рядом — справочники.
 */
const CACHE = 'omron-bp-v2'

/**
 * Файлы, у которых имя не меняется, а содержимое меняется: справочники
 * пересобираются из государственных реестров.
 *
 * Им нужна отдельная стратегия. «Сначала кэш» отдавала бы первую скачанную
 * версию вечно — телефон, однажды открывший форму препарата, не увидел бы ни
 * обновлённого реестра, ни новых пометок никогда. «Сначала сеть» заставила бы
 * ждать полтора мегабайта при каждом открытии формы. Поэтому отдаём из кэша
 * сразу и тут же обновляем его в фоне: свежее приезжает к следующему открытию.
 */
const REVALIDATE = /\/(drugs|supplements)\.json$/

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', './index.html']).catch(() => {})))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match('./index.html'))),
    )
    return
  }

  const save = (response) => {
    if (response.ok) {
      const copy = response.clone()
      caches.open(CACHE).then((cache) => cache.put(request, copy))
    }
    return response
  }

  if (REVALIDATE.test(new URL(request.url).pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fresh = fetch(request).then(save)
        if (!cached) return fresh
        // Обновление живёт дольше ответа: без waitUntil браузер вправе усыпить
        // работника сразу после отдачи из кэша, и справочник не обновится ни разу.
        event.waitUntil(fresh.catch(() => {}))
        return cached
      }),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then(save)),
  )
})
