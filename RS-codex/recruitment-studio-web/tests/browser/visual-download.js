// Manual browser validation only. Keep the real project exporter and importer;
// replace the OS save dialog with an inspectable download link for browsers
// whose automation cannot operate that native dialog. Not shipped by build-web.
(() => {
  let previousURL;
  RS.util.saveBlob = async (blob, name) => {
    if (previousURL) URL.revokeObjectURL(previousURL);
    previousURL = URL.createObjectURL(blob);
    document.getElementById('visual-download')?.remove();
    const box = document.createElement('aside');
    box.id = 'visual-download';
    box.style.cssText = 'position:fixed;z-index:1000;inset:auto 12px 12px;padding:16px;background:var(--paper);color:var(--ink);border:2px solid var(--signal);border-radius:12px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;';
    const link = document.createElement('a');
    link.href = previousURL; link.download = name;
    link.textContent = `Descarregar ficheiro preparado: ${name}`;
    const close = document.createElement('button');
    close.className = 'btn ghost'; close.textContent = 'Fechar resultado do teste';
    close.onclick = () => box.remove();
    box.append(link, close); document.body.appendChild(box);
    return true;
  };
})();
