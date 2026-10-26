/* =====================================================================
 * muscle-atlas / main.js
 * 启动入口：校验环境 → 创建引擎 → 初始化界面 → 就绪后收起 loading。
 * 经典脚本，无 import/export。
 * ===================================================================== */
(function (global) {
  'use strict';

  var A = global.MUSCLE_ATLAS = global.MUSCLE_ATLAS || {};
  var doc = global.document;
  var started = false;

  function showError(title, detail) {
    if (global.console && console.error) console.error('[muscle-atlas] ' + title, detail || '');
    var box = doc.getElementById('loading');
    if (!box) return;
    box.classList.remove('is-hidden');
    box.innerHTML =
      '<div class="loading-error">' +
      '<h2>无法启动 3D 模型</h2>' +
      '<p>' + title + '</p>' +
      '<p class="loading-error-hint">请使用最新版 Edge / Chrome / Firefox 打开本页面，' +
      '并确认浏览器已开启硬件加速（WebGL）。</p>' +
      (detail ? '<pre>' + String(detail.message || detail) + '</pre>' : '') +
      '</div>';
  }

  function hideLoading(engine) {
    var box = doc.getElementById('loading');
    if (box) {
      box.classList.add('is-hidden');
      global.setTimeout(function () {
        box.setAttribute('aria-hidden', 'true');
      }, 800);
    }
    var toast = doc.getElementById('toast');
    if (toast) {
      toast.textContent = '模型已就绪 · 点击任意肌肉查看训练动作';
      toast.classList.add('is-visible');
      global.setTimeout(function () { toast.classList.remove('is-visible'); }, 3200);
    }
    if (engine) engine.__ready = true;
  }

  function boot() {
    if (started) return;
    started = true;

    if (!global.THREE) {
      showError('three.js 未能加载。', '请确认 vendor/three.min.js 文件存在且未被拦截。');
      return;
    }
    if (!A.engine || typeof A.engine.create !== 'function') {
      showError('渲染引擎脚本未能加载。', '请确认 src/js/engine.js 存在。');
      return;
    }
    if (!A.body || typeof A.body.build !== 'function') {
      showError('人体模型脚本未能加载。', '请确认 src/js/body.js 存在。');
      return;
    }

    var engine;
    try {
      engine = A.engine.create(global.THREE);
    } catch (err) {
      showError('WebGL 初始化失败。', err);
      return;
    }

    A.instance = engine;

    /* 初始化界面（ui.js 自管理 DOM 与哈希路由） */
    var UI = A.UI;
    if (UI && typeof UI.init === 'function') {
      try {
        UI.init(engine);
      } catch (err) {
        if (global.console && console.error) console.error('[muscle-atlas] UI 初始化失败', err);
      }
    } else if (global.console && console.warn) {
      console.warn('[muscle-atlas] 未找到 MUSCLE_ATLAS.UI，界面将以纯 3D 模式运行');
    }

    var ready = false;
    function onReady() {
      if (ready) return;
      ready = true;
      hideLoading(engine);
      try {
        if (UI && typeof UI.onReady === 'function') UI.onReady(engine);
      } catch (err2) {
        if (global.console && console.error) console.error('[muscle-atlas] UI.onReady 失败', err2);
      }
      /* 支持 ?view=front|back|left|right 直接进入指定视角（无 hash 时） */
      try {
        if (!global.location.hash) {
          var m = /[?&]view=(front|back|left|right)\b/.exec(global.location.search || '');
          if (m) engine.setView(m[1]);
        }
      } catch (e3) { /* 忽略 */ }
    }

    /* 注意：ui.js 在 UI.init(engine) 时已把 engine.onReady 设为它的 readyHook，
     * 这里必须「包装」而不是「覆盖」，否则界面会一直等不到就绪事件，
     * 只能靠 8 秒兜底才恢复可交互。 */
    var previousReady = engine.onReady;
    engine.onReady = function () {
      if (typeof previousReady === 'function') {
        try { previousReady(); } catch (e0) { /* UI 就绪钩子失败不应阻断渲染 */ }
      }
      onReady();
    };

    /* 兜底：若渲染循环异常未触发 onReady，8 秒后仍收起遮罩 */
    global.setTimeout(function () {
      if (!ready) {
        ready = true;
        hideLoading(engine);
      }
    }, 8000);

    /* 页面隐藏时暂停时停用自动旋转，避免后台耗电 */
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden && engine.getAutoRotate && engine.getAutoRotate()) {
        engine.toggleAutoRotate(false);
        A.__autoRotatePaused = true;
      } else if (!doc.hidden && A.__autoRotatePaused) {
        A.__autoRotatePaused = false;
        engine.toggleAutoRotate(true);
      }
    });

    /* 便于集成/调试 */
    global.muscleAtlas = {
      engine: engine,
      select: function (id) { return engine.select(id); },
      view: function (name) { return engine.setView(name); },
      muscles: A.muscles || [],
      exercises: global.MUSCLE_EXERCISES || {}
    };
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
