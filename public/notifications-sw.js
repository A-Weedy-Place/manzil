// No background polling, caching or push subscription. Displays alerts from the open local app.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const tab of tabs) {
      if (new URL(tab.url).origin === self.location.origin) {
        await tab.focus(); tab.postMessage({ type: 'OPEN_ALERTS' }); return;
      }
    }
    await self.clients.openWindow('/#alerts');
  })());
});
