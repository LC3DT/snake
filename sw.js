/**
 * 贪吃蛇 Snake — Service Worker
 *
 * 策略：Cache-first（缓存优先）
 * 安装时预缓存所有静态资源，之后离线也能正常游玩。
 */

const CACHE_NAME = 'snake-v1';

// 需要预缓存的资源列表
const PRECACHE_URLS = [
    'index.html',
    'style.css',
    'game.js',
    'manifest.json',
];

// ---- 安装：预缓存所有静态资源 ----
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_URLS);
        })
    );
    // 立即激活，不等待旧 SW 关闭
    self.skipWaiting();
});

// ---- 激活：清理旧缓存 ----
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    // 让 SW 立即接管所有页面
    self.clients.claim();
});

// ---- 请求拦截：缓存优先 ----
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // 缓存命中 → 直接返回
            if (cachedResponse) {
                return cachedResponse;
            }
            // 缓存未命中 → 网络请求
            return fetch(event.request);
        })
    );
});
