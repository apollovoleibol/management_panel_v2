/* Barra superior: busca no centro, ajuda e menu da conta (visualizar como, tema e sair) */
'use strict';
(() => {
  const btn = $('#acctBtn'), menu = $('#acctMenu');
  if (!btn || !menu) return;
  const items = () => $$('#acctMenu .acct-item:not([hidden]), #acctMenu .acct-item:not([hidden]) select').filter(el => el.matches('button, select'));
  const close = (focus = false) => { if (menu.hidden) return; menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (focus) btn.focus(); };
  const open = () => { syncAccount(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); items()[0]?.focus(); };
  btn.addEventListener('click', () => (menu.hidden ? open() : close()));
  document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('.acct')) close(); });
  menu.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); return close(true); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (e.target.tagName === 'SELECT') return;
      e.preventDefault(); const list = items(), i = list.indexOf(document.activeElement);
      list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
    }
  });
  // Trocar o perfil da prévia redesenha a página: o menu fecha junto
  $('#viewAs')?.addEventListener('change', () => close());
  $('#acctMenu [data-act="logout"]')?.addEventListener('click', () => close());
  // Estado do tema no item do menu (o clique continua tratado em main.js)
  const syncTheme = () => { const dark = document.documentElement.dataset.theme === 'dark'; $('#themeBtn').setAttribute('aria-checked', String(dark)); };
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  syncTheme();
  // Nome e papel reais da conta (a prévia de perfil não muda quem está conectado)
  function syncAccount() {
    const u = typeof USERS !== 'undefined' ? USERS.find(x => x.id === S.userId) : null;
    const name = u?.name || APOLLO_AUTH.user?.email || '';
    $('#acctAvatar').textContent = initials(name);
    $('#acctName').textContent = name;
    $('#acctRole').textContent = [u?.role, u?.email].filter(Boolean).join(' · ');
    btn.setAttribute('aria-label', `Sua conta${name ? ': ' + name : ''}`);
  }
  const ready = () => document.body.classList.contains('app-ready') && syncAccount();
  new MutationObserver(ready).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  ready();
})();
