// Web Push subscription management
(function () {
  'use strict';

  const API = window.FF_API_BASE || '';

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function getVapidPublicKey() {
    const res = await fetch(API + '/api/push/vapid-public-key');
    if (!res.ok) throw new Error('VAPID key indisponível');
    const json = await res.json();
    return json.publicKey;
  }

  async function sendSubscriptionToServer(subscription, userId, userName, sector) {
    await fetch(API + '/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, userId, userName, sector }),
    });
  }

  async function removeSubscriptionFromServer(endpoint) {
    await fetch(API + '/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
  }

  // Called after login once we know user + sector
  window.ffInitPush = async function (userId, userName, sector) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const publicKey = await getVapidPublicKey();

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      await sendSubscriptionToServer(sub.toJSON(), userId, userName, sector);

      // Listen for messages from SW (e.g., open lot detail)
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'OPEN_LOT' && e.data.lotId) {
          if (typeof openLotDetail === 'function') openLotDetail(e.data.lotId);
          else if (typeof window.openLotDetail === 'function') window.openLotDetail(e.data.lotId);
        }
      });
    } catch (err) {
      console.warn('[push] init erro:', err.message);
    }
  };

  window.ffDisablePush = async function () {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removeSubscriptionFromServer(sub.endpoint);
        await sub.unsubscribe();
      }
    } catch (err) {
      console.warn('[push] disable erro:', err.message);
    }
  };
})();
