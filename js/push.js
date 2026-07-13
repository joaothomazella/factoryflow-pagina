// Web Push subscription management
(function () {
  'use strict';

  const API = window.FF_API_BASE || '';
  const IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const IS_STANDALONE = window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;

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

  async function doSubscribe(userId, userName, sector) {
    const reg = await navigator.serviceWorker.ready;
    const publicKey = await getVapidPublicKey();

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await sendSubscriptionToServer(sub.toJSON(), userId, userName, sector);

    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'OPEN_LOT' && e.data.lotId) {
        if (typeof openLotDetail === 'function') openLotDetail(e.data.lotId);
      }
    });

    return true;
  }

  function removeBanner() {
    const b = document.getElementById('ffPushBanner');
    if (b) b.remove();
  }

  function showIosBanner() {
    if (document.getElementById('ffPushBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'ffPushBanner';
    banner.className = 'ff-push-banner ff-push-ios';
    banner.innerHTML = `
      <div class="fpb-icon"><i class="fas fa-bell"></i></div>
      <div class="fpb-text">
        <strong>Ativar notificações no iPhone</strong>
        <span>Toque em <i class="fas fa-share-square"></i> → "Adicionar à Tela de Início" e abra o app pelo ícone criado.</span>
      </div>
      <button class="fpb-close" onclick="document.getElementById('ffPushBanner').remove(); localStorage.setItem('ff_push_ios_dismissed','1')">
        <i class="fas fa-times"></i>
      </button>`;
    document.body.appendChild(banner);
  }

  function showRequestBanner(userId, userName, sector) {
    if (document.getElementById('ffPushBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'ffPushBanner';
    banner.className = 'ff-push-banner';
    banner.innerHTML = `
      <div class="fpb-icon"><i class="fas fa-bell"></i></div>
      <div class="fpb-text">
        <strong>Ativar notificações</strong>
        <span>Receba alertas quando um lote chegar no seu setor.</span>
      </div>
      <button class="fpb-btn" id="ffPushAllowBtn">Ativar</button>
      <button class="fpb-close" onclick="document.getElementById('ffPushBanner').remove(); localStorage.setItem('ff_push_dismissed','1')">
        <i class="fas fa-times"></i>
      </button>`;
    document.body.appendChild(banner);

    document.getElementById('ffPushAllowBtn').addEventListener('click', async () => {
      const btn = document.getElementById('ffPushAllowBtn');
      if (btn) { btn.disabled = true; btn.textContent = '...'; }
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          await doSubscribe(userId, userName, sector);
          removeBanner();
          localStorage.setItem('ff_push_granted', '1');
          if (typeof showToast === 'function') showToast('🔔 Notificações ativadas!', 'success');
        } else {
          removeBanner();
          localStorage.setItem('ff_push_dismissed', '1');
        }
      } catch (err) {
        console.warn('[push] allow error:', err.message);
        removeBanner();
      }
    });
  }

  // Called after login
  window.ffInitPush = async function (userId, userName, sector) {
    if (!('serviceWorker' in navigator)) return;

    // iOS sem PWA: mostrar instruções de como instalar
    if (IS_IOS && !IS_STANDALONE) {
      if (!localStorage.getItem('ff_push_ios_dismissed')) {
        setTimeout(() => showIosBanner(), 2000);
      }
      return;
    }

    if (!('PushManager' in window)) return;

    const current = Notification.permission;

    // Já foi autorizado: subscreve silenciosamente (sem popup)
    if (current === 'granted') {
      try { await doSubscribe(userId, userName, sector); } catch (_) {}
      return;
    }

    // Já negou ou dispensou: não incomoda
    if (current === 'denied') return;
    if (localStorage.getItem('ff_push_dismissed')) return;

    // Permissão pendente: mostrar banner após 3s
    setTimeout(() => showRequestBanner(userId, userName, sector), 3000);
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
      localStorage.removeItem('ff_push_granted');
    } catch (err) {
      console.warn('[push] disable erro:', err.message);
    }
  };
})();
