// Tiny browser test harness (not shipped). Cases call test(name, fn); they run in
// order after the page has loaded (fonts ready), and the results are left in
// window.__results for tools/test-browser.mjs to read.
(() => {
  const tests = [];
  window.test = (name, fn) => tests.push({ name, fn });
  window.assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
  window.assertEqual = (a, b, msg) => {
    const A = JSON.stringify(a), B = JSON.stringify(b);
    if (A !== B) throw new Error(`${msg || 'not equal'}: ${A} !== ${B}`);
  };
  window.__results = [];
  window.__testsDone = false;
  window.addEventListener('load', async () => {
    try { if (window.RS && RS.engine && RS.engine.loadFonts) await RS.engine.loadFonts(); } catch (err) { console.warn(err); }
    // ?grep=text: only the cases whose name contains it (tools/test-browser.mjs TEST_GREP)
    const grep = new URLSearchParams(location.search).get('grep');
    for (const t of tests) {
      if (grep && !t.name.includes(grep)) continue;
      try {
        await t.fn();
        window.__results.push({ name: t.name, ok: true });
      } catch (err) {
        window.__results.push({ name: t.name, ok: false, error: String((err && err.message) || err) });
      }
    }
    window.__testsDone = true;
  });
})();
