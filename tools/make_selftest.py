# -*- coding: utf-8 -*-
"""Generate _selftest.html: a copy of index.html with an automated interaction
self-test injected. The harness runs the real app in headless Edge, clicks the
real buttons / sidebar items / canvas, and prints SELFTEST lines to the console
so they can be grepped from Chromium's stderr log.

Usage:
    python tools/make_selftest.py
"""
import io
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')
OUT = os.path.join(ROOT, '_selftest.html')

ERROR_HOOK = """<script>
window.__errors = [];
window.addEventListener('error', function (e) {
  window.__errors.push(String(e.message || (e.error && e.error.message) || 'error'));
});
window.addEventListener('unhandledrejection', function (e) {
  window.__errors.push('rejection: ' + String(e.reason));
});
</script>
"""

HARNESS = r"""<script>
(function () {
  'use strict';
  var results = [];
  window.__selftestDone = false;
  window.__selftestSummary = '';
  window.__selftestResults = [];

  function log(name, pass, extra) {
    var line = 'SELFTEST|' + name + '|' + (pass ? 'PASS' : 'FAIL') + '|' + (extra == null ? '' : String(extra));
    results.push({ name: name, pass: !!pass, extra: extra });
    if (window.console && console.log) console.log(line);
  }

  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function text(sel) {
    var el = q(sel);
    return el ? (el.textContent || '') : '';
  }
  function visible(el) { return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function fire(el, type) {
    if (!el) return;
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  }

  function pointer(el, type, x, y) {
    var ev = new PointerEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1
    });
    el.dispatchEvent(ev);
  }

  async function waitReady() {
    var t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      var loading = q('#loading');
      if (window.muscleAtlas && window.muscleAtlas.engine &&
          loading && loading.classList.contains('is-hidden')) return true;
      await sleep(120);
    }
    return false;
  }

  async function run() {
    log('ready', await waitReady(), '');
    var A = window.MUSCLE_ATLAS || {};
    var eng = window.muscleAtlas ? window.muscleAtlas.engine : null;
    if (!eng) { log('engine-missing', false); return finish(); }

    /* ---------- 1. data integrity ---------- */
    var muscles = A.muscles || [];
    log('data-muscles', muscles.length === 25, muscles.length);
    log('data-exercises', Object.keys(window.MUSCLE_EXERCISES || {}).length === 25, Object.keys(window.MUSCLE_EXERCISES || {}).length);
    var meshIds = Object.keys(eng.body.muscleMeshes || {});
    log('data-meshes', meshIds.length === 25, meshIds.length);
    var minEx = 99;
    muscles.forEach(function (m) {
      var ex = (window.MUSCLE_EXERCISES || {})[m.id];
      minEx = Math.min(minEx, ex && ex.exercises ? ex.exercises.length : 0);
    });
    log('data-each-muscle-exercises', minEx >= 3, 'min=' + minEx);

    var listCount = qa('.muscle-item').length;
    log('ui-list-items', listCount === 25, listCount);
    log('ui-count-text', /25/.test(text('#muscle-count')), text('#muscle-count').trim().slice(0, 20));

    /* ---------- 2. sidebar select ---------- */
    var quadItem = q('.muscle-item[data-muscle-id="quadriceps"]');
    log('ui-sidebar-quad-exists', !!quadItem, '');
    if (quadItem) quadItem.click();
    await sleep(400);
    log('ui-sidebar-active-class', !!q('.muscle-item.is-active[data-muscle-id="quadriceps"]'), '');
    log('engine-selected', eng.getSelected() === 'quadriceps', eng.getSelected());
    var panel = text('#detail-body');
    log('panel-muscle-name', panel.indexOf('股四头肌') >= 0, '');
    log('panel-exercises', /深蹲|腿举|腿屈伸/.test(panel), panel.replace(/\s+/g, ' ').slice(0, 40));
    var panelHtml = (q('#detail-body') || {}).innerHTML || '';
    log('panel-bilibili-link', /search\.bilibili\.com/.test(panelHtml), '');
    log('panel-rel-noopener', /noopener/.test(panelHtml), '');
    log('hash-after-select', (location.hash || '').indexOf('m=quadriceps') >= 0, location.hash);

    /* ---------- 3. view buttons ---------- */
    var backBtn = q('#view-controls [data-view="back"]');
    log('ui-view-button-exists', !!backBtn, '');
    if (backBtn) backBtn.click();
    await sleep(900);
    log('ui-view-back-active', /is-active/.test(backBtn.className || ''), backBtn.className);
    var frontBtn = q('#view-controls [data-view="front"]');
    if (frontBtn) frontBtn.click();
    await sleep(900);

    /* ---------- 4. search / filter ---------- */
    var input = q('#search-input');
    var before = qa('.muscle-item').filter(visible).length;
    if (input) {
      input.value = '硬拉';
      fire(input, 'input');
      await sleep(300);
      var hits = qa('.muscle-item').filter(visible);
      log('search-hard-pull', hits.length > 0 && hits.length < before, 'visible=' + hits.length + '/' + before);
      log('search-hit-name', hits.some(function (el) { return /竖脊肌|腘绳肌/.test(el.textContent || ''); }), '');
      input.value = 'xiong';
      fire(input, 'input');
      await sleep(300);
      var pinyinHits = qa('.muscle-item').filter(visible);
      log('search-pinyin', pinyinHits.some(function (el) { return /胸大肌/.test(el.textContent || ''); }), 'visible=' + pinyinHits.length);
      var clearBtn = q('#search-clear');
      if (clearBtn) clearBtn.click();
      await sleep(300);
      log('search-clear-restore', qa('.muscle-item').filter(visible).length === before, 'visible=' + qa('.muscle-item').filter(visible).length);
      log('search-input-cleared', !input.value, 'value=' + input.value);
    }

    /* ---------- 5. canvas raycast select（把胸大肌中心投影到屏幕再点击） ---------- */
    var canvas = q('#scene');
    var rect = canvas.getBoundingClientRect();
    var anchor = new THREE.Vector3(0.09, 1.40, 0.14);
    var proj = anchor.clone().project(eng.camera);
    var px = rect.left + (proj.x * 0.5 + 0.5) * rect.width;
    var py = rect.top + (-proj.y * 0.5 + 0.5) * rect.height;
    log('debug-canvas-rect', rect.width > 100 && rect.height > 100, Math.round(rect.width) + 'x' + Math.round(rect.height));
    var directHit = eng.raycast({ clientX: px, clientY: py });
    log('debug-direct-pick', !!directHit, directHit ? directHit.muscleId + '/' + directHit.side : 'null');
    pointer(canvas, 'pointermove', px, py);
    await sleep(300);
    log('canvas-hover-highlight', !!eng.getHovered(), eng.getHovered());
    pointer(canvas, 'pointerdown', px, py);
    pointer(window, 'pointerup', px, py);
    await sleep(500);
    log('canvas-raycast-select', !!eng.getSelected(), eng.getSelected());
    var picked = eng.getSelected();
    /* 点击画面左上角空白处应取消选中 */
    pointer(canvas, 'pointerdown', rect.left + 20, rect.top + 20);
    pointer(window, 'pointerup', rect.left + 20, rect.top + 20);
    await sleep(400);
    log('canvas-empty-click-clears', eng.getSelected() === null, eng.getSelected());

    /* ---------- 6. random muscle ---------- */
    var randomBtn = q('#btn-random');
    if (randomBtn) randomBtn.click();
    await sleep(500);
    var randomId = eng.getSelected();
    log('ui-random-select', !!randomId, randomId);
    log('ui-random-differs', randomId !== picked || randomId !== null, 'picked=' + picked + ' random=' + randomId);

    /* ---------- 7. autorotate ---------- */
    var autoBtn = q('#btn-autorotate');
    if (autoBtn) {
      autoBtn.click();
      await sleep(200);
      log('ui-autorotate-on', autoBtn.getAttribute('aria-pressed') === 'true' || eng.getAutoRotate() === true, 'pressed=' + autoBtn.getAttribute('aria-pressed'));
      autoBtn.click();
      await sleep(200);
      log('ui-autorotate-off', autoBtn.getAttribute('aria-pressed') !== 'true', 'pressed=' + autoBtn.getAttribute('aria-pressed'));
    }

    /* ---------- 8. help modal + esc ---------- */
    var helpBtn = q('#btn-help');
    if (helpBtn) {
      helpBtn.click();
      await sleep(300);
      var modal = q('#help-modal');
      log('ui-help-open', !!modal && !modal.hidden, modal ? ('hidden=' + modal.hidden) : 'missing');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(300);
      log('ui-help-esc-close', !!modal && modal.hidden, modal ? ('hidden=' + modal.hidden) : 'missing');
    }

    /* ---------- 9. esc clears selection ---------- */
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(300);
    log('ui-esc-clear-selection', eng.getSelected() === null, eng.getSelected());

    /* ---------- 10. runtime errors ---------- */
    var errs = (window.__errors || []).slice(0, 3);
    log('runtime-errors', errs.length === 0, errs.join(' | ').slice(0, 220));

    finish();
  }

  function finish() {
    var failed = results.filter(function (r) { return !r.pass; });
    var summary = failed.length ? ('FAILED ' + failed.length + '/' + results.length) : ('ALL PASS ' + results.length);
    document.title = 'SELFTEST ' + summary;
    window.__selftestSummary = summary;
    window.__selftestResults = results.map(function (r) {
      return { name: r.name, pass: !!r.pass, extra: r.extra == null ? '' : String(r.extra) };
    });
    window.__selftestDone = true;
    if (window.console && console.log) console.log('SELFTEST|SUMMARY|' + summary);
    var box = document.createElement('div');
    box.id = '__selftest_box';
    box.setAttribute('style',
      'position:fixed;left:12px;top:12px;z-index:99999;max-width:520px;padding:10px 12px;' +
      'background:rgba(8,10,14,.92);border:1px solid #3a3f4a;border-radius:8px;color:#e9e4db;' +
      'font:11px/1.55 monospace;white-space:pre-wrap;pointer-events:none');
    box.textContent = 'SELFTEST ' + summary + '\n' + results.map(function (r) {
      return (r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : '  << ' + r.extra);
    }).join('\n');
    document.body.appendChild(box);
  }

  if (document.readyState === 'complete') {
    run();
  } else {
    window.addEventListener('load', function () { run(); });
  }
})();
</script>
"""


def main():
    with io.open(INDEX, 'r', encoding='utf-8') as fh:
        html = fh.read()

    # 1) error hook right after <head> (or after <html> if no head, shouldn't happen)
    if '<head>' in html:
        html = html.replace('<head>', '<head>\n' + ERROR_HOOK, 1)
    else:
        raise SystemExit('index.html 缺少 <head>')

    # 2) harness right before </body>
    if '</body>' not in html:
        raise SystemExit('index.html 缺少 </body>')
    html = html.replace('</body>', HARNESS + '\n</body>', 1)

    # 3) drop any ?query hacks: nothing to do, viewer opens this file directly
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(html)
    print('WROTE %s (%d bytes)' % (OUT, len(html.encode('utf-8'))))


if __name__ == '__main__':
    main()
