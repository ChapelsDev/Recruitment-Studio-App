// Installing the app anywhere: which browser this is, the steps it needs (in
// Portuguese), the app's address for the phone's QR, and the one-time welcome.
// The published copy is served over https (the owner's Tailscale address);
// «Recruitment Studio.exe» opens the files (file://): it has no address of its
// own and is never an installed app.
window.RS = window.RS || {};
RS.install = (() => {
  const URL_KEY = 'rs-app-url';
  const WELCOME_KEY = 'rs-welcomed';
  const local = () => { try { return window.localStorage || null; } catch { return null; } };

  // 'file' (the .exe window, or any page from the disk) comes first: it is never
  // 'installed'; the Instagram/Facebook in-app browsers come before the others.
  function platform(ua = '', env = {}) {
    if (env.protocol === 'file:') return 'file';
    if (env.standalone) return 'installed';
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (env.maxTouchPoints || 0) > 0);
    const android = /Android/i.test(ua);
    if (/Instagram|FBAN|FBAV|FB_IAB|FBIOS/.test(ua)) return ios ? 'ios-inapp' : 'android-inapp';
    if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari';
    if (android) {
      if (/SamsungBrowser/.test(ua)) return 'samsung';
      if (/Firefox/.test(ua)) return 'firefox-android';
      return 'android';
    }
    if (/Firefox/.test(ua)) return 'firefox-desktop';
    if (/Chrome|Chromium|Edg/.test(ua)) return 'desktop-chromium';
    if (/Macintosh/.test(ua) && /Safari/.test(ua)) return 'mac-safari';
    return 'other';
  }
  // The steps each one needs (the button to tap, in the words the browser uses).
  const STEPS = {
    'ios-safari': [
      { icon: 'share', text: 'Toque em Partilhar (o quadrado com a seta)' },
      { icon: 'square-plus', text: 'Escolha «Adicionar ao ecrã principal»' },
      { icon: 'check', text: 'Toque em «Adicionar»' },
    ],
    'ios-other': [
      { icon: 'share', text: 'Toque em Partilhar, na barra do endereço' },
      { icon: 'square-plus', text: 'Escolha «Adicionar ao ecrã principal»' },
      { icon: 'globe', text: 'Se não aparecer, abra este endereço no Safari' },
    ],
    'ios-inapp': [
      { icon: 'ellipsis', text: 'Toque em ⋯, no canto do ecrã' },
      { icon: 'external-link', text: 'Escolha «Abrir no navegador» para o abrir no Safari' },
      { icon: 'share', text: 'No Safari: Partilhar e «Adicionar ao ecrã principal»' },
    ],
    'android-inapp': [
      { icon: 'ellipsis-vertical', text: 'Toque em ⋮, no canto do ecrã' },
      { icon: 'external-link', text: 'Escolha «Abrir no Chrome»' },
      { icon: 'download', text: 'No Chrome: ⋮ e «Instalar app»' },
    ],
    'mac-safari': [
      { icon: 'square-plus', text: 'No menu Ficheiro, escolha «Adicionar à Dock»' },
      { icon: 'check', text: 'Confirme com «Adicionar»' },
    ],
    android: [
      { icon: 'ellipsis-vertical', text: 'Toque no menu ⋮ do navegador' },
      { icon: 'download', text: 'Escolha «Instalar app» (ou «Adicionar ao ecrã principal»)' },
      { icon: 'check', text: 'Confirme com «Instalar»' },
    ],
    'desktop-chromium': [
      { icon: 'download', text: 'Clique no botão de instalar, no fim da barra do endereço' },
      { icon: 'check', text: 'Confirme com «Instalar»' },
    ],
    'firefox-android': [
      { icon: 'ellipsis-vertical', text: 'Toque no menu ⋮ do Firefox' },
      { icon: 'download', text: 'Escolha «Instalar»' },
    ],
    samsung: [
      { icon: 'menu', text: 'Toque no menu ≡, em baixo' },
      { icon: 'square-plus', text: 'Escolha «Adicionar página a» e depois «Ecrã principal»' },
    ],
    'firefox-desktop': [
      { icon: 'globe', text: 'O Firefox no computador não instala aplicações: abra este endereço no Microsoft Edge ou no Google Chrome' },
    ],
    other: [
      { icon: 'globe', text: 'Abra este endereço no Chrome ou no Edge (no iPhone, no Safari) e instale a partir do menu' },
    ],
    file: [
      { icon: 'qr-code', text: 'Aponte a câmara do telemóvel ao código' },
      { icon: 'smartphone', text: 'O telemóvel precisa do Tailscale ligado' },
      { icon: 'square-plus', text: 'No telemóvel, toque em «Instalar» (Android) ou Partilhar e «Adicionar ao ecrã principal» (iPhone)' },
    ],
    installed: [],
  };
  // The guide's small drawing of the browser in use: its bar (top, bottom, or the
  // Mac's menu bar) with its buttons, the menu or sheet a step opens, and what the
  // finger taps in each step — ['tool', i] a button of the bar, ['menu', i] a row
  // of the menu, ['dialog', words] the browser's own confirmation, ['none'] nothing
  // (a step that only says where to go). Guides with nothing to draw have none.
  const SHARE_SHEET = ['Copiar', 'Adicionar ao ecrã principal', 'Adicionar marcador'];
  const DEMOS = {
    'ios-safari': { device: 'phone', bar: 'bottom', tools: ['chevron-left', 'chevron-right', 'share', 'copy'], menu: SHARE_SHEET, taps: [['tool', 2], ['menu', 1], ['dialog', 'Adicionar']] },
    'ios-other': { device: 'phone', bar: 'top', tools: ['share'], menu: SHARE_SHEET, taps: [['tool', 0], ['menu', 1], ['none']] },
    'ios-inapp': { device: 'phone', bar: 'top', tools: ['ellipsis'], menu: ['Copiar ligação', 'Abrir no navegador'], taps: [['tool', 0], ['menu', 1], ['none']] },
    'android-inapp': { device: 'phone', bar: 'top', tools: ['ellipsis-vertical'], menu: ['Copiar ligação', 'Abrir no Chrome'], taps: [['tool', 0], ['menu', 1], ['none']] },
    'mac-safari': { device: 'computer', bar: 'menu', tools: ['Safari', 'Ficheiro', 'Editar', 'Ver'], menuFrom: 1, menu: ['Nova janela', 'Adicionar à Dock…', 'Fechar janela'], taps: [['menu', 1], ['dialog', 'Adicionar']] },
    android: { device: 'phone', bar: 'top', tools: ['ellipsis-vertical'], menu: ['Novo separador', 'Instalar app', 'Definições'], taps: [['tool', 0], ['menu', 1], ['dialog', 'Instalar']] },
    'desktop-chromium': { device: 'computer', bar: 'top', tools: ['monitor-down'], taps: [['tool', 0], ['dialog', 'Instalar']] },
    'firefox-android': { device: 'phone', bar: 'top', tools: ['ellipsis-vertical'], menu: ['Novo separador', 'Instalar', 'Definições'], taps: [['tool', 0], ['menu', 1]] },
    samsung: { device: 'phone', bar: 'bottom', tools: ['chevron-left', 'chevron-right', 'house', 'copy', 'menu'], menu: ['Marcadores', 'Adicionar página a', 'Definições'], taps: [['tool', 4], ['menu', 1]] },
  };
  // A phone or a tablet — not a computer with a touch screen (a Windows laptop has
  // touch points too). An iPad says «Macintosh» but has touch.
  function phone(ua = '', env = {}) {
    return /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && (env.maxTouchPoints || 0) > 0);
  }
  function detect() {
    const nav = window.navigator || {};
    const standalone = !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true;
    return platform(nav.userAgent || '', { standalone, protocol: location.protocol, maxTouchPoints: nav.maxTouchPoints || 0, prompt: false });
  }
  // An address the phone can install from: https, a real host name; normalised
  // to the app's folder (index.html, query and fragment dropped).
  function checkAddress(text) {
    let t = String(text || '').trim();
    if (!t) return { ok: false, error: 'Escreva o endereço da app, a começar por https://' };
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) t = `https://${t}`;
    let u;
    try { u = new URL(t); } catch { return { ok: false, error: 'Este endereço não está bem escrito.' }; }
    if (u.protocol !== 'https:') return { ok: false, error: 'O endereço tem de começar por https:// (o telemóvel só instala a partir de https).' };
    if (!u.hostname.includes('.') || u.username || u.password) return { ok: false, error: 'Escreva o endereço completo, por exemplo https://….ts.net' };
    const dir = u.pathname.replace(/[^/]*$/, '');
    return { ok: true, url: `${u.origin}${dir || '/'}` };
  }
  // The app's address: on https, the folder of this page; on the .exe, the one typed once.
  function appAddress(loc = location, storage = local()) {
    if (loc.protocol === 'https:') return `${loc.origin}${loc.pathname.replace(/[^/]*$/, '')}`;
    if (loc.protocol !== 'file:') return null;
    try { return (storage && storage.getItem(URL_KEY)) || null; } catch { return null; }
  }
  function rememberAddress(url, storage = local()) {
    try { if (storage) storage.setItem(URL_KEY, url); } catch { /* blocked: asked again next time */ }
  }
  // Right after installing (the tab that installed): the new window must not welcome again.
  function markWelcomed(storage = local()) {
    try { if (storage) storage.setItem(WELCOME_KEY, String(Date.now())); } catch { /* blocked */ }
  }
  // The first opening as an installed app (https, standalone), once per device.
  function shouldWelcome({ standalone, protocol, storage = local() } = {}) {
    if (!standalone || protocol !== 'https:') return false;
    try {
      if (!storage || storage.getItem(WELCOME_KEY)) return false;
      storage.setItem(WELCOME_KEY, String(Date.now()));
      return true;
    } catch { return false; }
  }

  // The guides' own icons (Lucide, ISC), next to the app's icon set.
  if (RS.ICON_PATHS) {
    const more = {
      share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
      'square-plus': 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 12h8M12 8v8',
      'ellipsis-vertical': 'M12 4a1 1 0 1 0 0 2a1 1 0 1 0 0-2zM12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2zM12 18a1 1 0 1 0 0 2a1 1 0 1 0 0-2z',
      menu: 'M4 6h16M4 12h16M4 18h16',
      'monitor-down': 'M12 13V7M15 10l-3 3-3-3M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 17v4M8 21h8',
    };
    for (const [k, d] of Object.entries(more)) if (!RS.ICON_PATHS[k]) RS.ICON_PATHS[k] = d;
  }

  return { URL_KEY, WELCOME_KEY, STEPS, DEMOS, platform, phone, detect, checkAddress, appAddress, rememberAddress, markWelcomed, shouldWelcome };
})();

// Readiness comes from the active service worker's actual cache, never a saved
// "installed" flag. No network calls when merely inspecting its state.
RS.offline = (() => {
  const listeners = new Set();
  let listening = false, last = null;
  const publish = (state) => { last = { ...state, controlled: !!navigator.serviceWorker?.controller }; for (const fn of listeners) fn(last); return last; };
  const unavailable = () => location.protocol === 'file:'
    ? { mode: 'file', error: '', running: false }
    : !navigator.serviceWorker ? { mode: 'unavailable', error: 'Este navegador não permite preparar uma cópia offline.', running: false } : null;
  async function request(type) {
    const missing = unavailable(); if (missing) return publish(missing);
    const registration = await navigator.serviceWorker.getRegistration(), worker = navigator.serviceWorker.controller || registration?.active;
    if (!worker) return publish({ mode: 'unavailable', error: 'A cópia offline ainda não está instalada. Ligue à rede e reabra a aplicação.', running: false });
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel(); let timer;
      const close = () => { clearTimeout(timer); channel.port1.close(); };
      const deadline = () => { clearTimeout(timer); timer = setTimeout(() => { close(); reject(new Error('Não foi possível confirmar a cache. Tente verificar novamente.')); }, 60000); };
      channel.port1.onmessage = ({ data }) => {
        deadline();
        if (data.error) { close(); reject(new Error(data.error)); return; }
        const state = publish({ ...data.state, mode: 'web' });
        if (data.done) { close(); resolve(state); }
      };
      deadline(); try { worker.postMessage({ type }, [channel.port2]); } catch (e) { close(); reject(e); }
    });
  }
  const check = () => request('rs-offline-query').catch((e) => publish({ ...(last || {}), error: e.message, running: false }));
  const prepare = () => request('rs-offline-prepare').catch((e) => publish({ ...(last || {}), error: e.message, running: false }));
  function subscribe(fn) {
    listeners.add(fn); if (last) fn(last);
    if (!listening && navigator.serviceWorker) {
      listening = true;
      navigator.serviceWorker.addEventListener('message', ({ data }) => { if (data?.type === 'rs-offline-status') publish({ ...data.state, mode: 'web' }); });
      navigator.serviceWorker.addEventListener('controllerchange', check);
    }
    check(); return () => listeners.delete(fn);
  }
  return { check, prepare, subscribe };
})();
