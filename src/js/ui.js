/* ==========================================================================
   肌肉训练图谱 · 界面层（ui.js）
   --------------------------------------------------------------------------
   职责：左侧分组索引（折叠 / 搜索）、右侧详情面板（解剖信息 + 训练动作卡）、
        视角控件、悬停 tooltip、toast、帮助弹窗、哈希路由与键盘快捷键。
   依赖：数据（window.MUSCLE_ATLAS / window.MUSCLE_EXERCISES）已就绪，
        引擎由 main.js 通过 MUSCLE_ATLAS.UI.init(engine) 注入。
   约束：经典脚本（无模块语法）、不创建 canvas、不写 three.js 代码、
        所有 DOM 查询都做空值保护，缺节点时静默降级。
   ========================================================================== */
(function () {
  "use strict";

  var MA = window.MUSCLE_ATLAS = window.MUSCLE_ATLAS || {};

  /* ------------------------------ 常量 ------------------------------ */
  var VIEW_IDS = ["front", "back", "left", "right"];
  var VIEW_LABELS = { front: "正面", back: "背面", left: "左侧", right: "右侧" };
  var SIDE_LABELS = { left: "左侧", right: "右侧", center: "中线" };
  var GROUP_LABELS = {
    chest: "胸部",
    back: "背部",
    shoulder: "肩部",
    arms: "手臂",
    core: "核心",
    glutes: "臀部",
    legs: "腿部",
    neck: "颈部"
  };
  var DEFAULT_COLOR = "#c33d2b";

  var EMPTY_ORNAMENT =
    '<svg class="icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
    '<circle cx="24" cy="24" r="15.5" fill="none" stroke="currentColor" stroke-width="1" opacity=".45"/>' +
    '<path d="M24 3.4v8.2M24 36.4v8.2M3.4 24h8.2M36.4 24h8.2" fill="none" stroke="currentColor" ' +
    'stroke-width="1" stroke-linecap="round" opacity=".5"/>' +
    '<path d="M15 31.5c.8-8.4 8-13.2 13-10.4 4.8 2.7 2.4 9.8-4.6 11.6-3.6.9-8.8.3-8.4-1.2z" ' +
    'fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M18.4 27.6c3.4.8 6.4-.4 8.2-3.2" fill="none" stroke="currentColor" stroke-width="1" opacity=".7"/>' +
    "</svg>";

  var WARN_ICON =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M12 3.8 20.6 19.6H3.4z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>' +
    '<path d="M12 9.6v4.4" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>' +
    '<circle cx="12" cy="16.9" r=".95" fill="currentColor"/>' +
    "</svg>";

  var CHEVRON_PATH =
    '<path d="M7.5 10 12 14.4 16.5 10" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round"/>';

  /* ------------------------------ 状态 ------------------------------ */
  var state = {
    inited: false,
    engine: null,
    ready: false,
    selectedId: null,
    pendingId: null,
    pendingView: null,
    view: "front",
    autoRotate: false,
    query: "",
    collapsed: {},
    pointer: { x: 0, y: 0, touch: false },
    lastHash: "",
    prevReady: null,
    watchdog: 0,
    toastTimer: 0,
    helpReturnFocus: null,
    drawerMq: null
  };

  var dom = {};
  var muscles = [];
  var dataGroups = [];
  var muscleById = {};
  var exercisesById = {};
  var groupLabels = {};
  var items = [];
  var groupEls = [];
  var viewBtns = [];
  var total = 0;

  /* ------------------------------ 小工具 ---------------------------- */
  function isFn(value) {
    return typeof value === "function";
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pad2(number) {
    return number < 10 ? "0" + number : String(number);
  }

  function hexToRgba(hex, alpha) {
    var raw = String(hex || "").replace("#", "").trim();
    if (raw.length === 3) {
      raw = raw.charAt(0) + raw.charAt(0) + raw.charAt(1) + raw.charAt(1) + raw.charAt(2) + raw.charAt(2);
    }
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
      return "rgba(224, 89, 60, " + alpha + ")";
    }
    var value = parseInt(raw, 16);
    return (
      "rgba(" +
      ((value >> 16) & 255) + ", " +
      ((value >> 8) & 255) + ", " +
      (value & 255) + ", " +
      alpha + ")"
    );
  }

  function addEvent(node, type, handler, options) {
    if (node && isFn(node.addEventListener)) {
      node.addEventListener(type, handler, options);
    }
  }

  function setClass(node, className, enabled) {
    if (!node || !node.classList) {
      return;
    }
    if (enabled) {
      node.classList.add(className);
    } else {
      node.classList.remove(className);
    }
  }

  function hasClass(node, className) {
    return !!(node && node.classList && node.classList.contains(className));
  }

  function setText(node, text) {
    if (node) {
      node.textContent = String(text == null ? "" : text);
    }
  }

  function createSvg(className, inner) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = isFn(document.createElementNS)
      ? document.createElementNS(ns, "svg")
      : document.createElement("svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.innerHTML = inner;
    return svg;
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text != null) {
      node.textContent = text;
    }
    return node;
  }

  /* 分组折叠箭头：用真实 SVG 节点追加，避免 innerHTML += 破坏已缓存的子节点引用 */
  function chevron() {
    return createSvg("icon group-chevron", CHEVRON_PATH);
  }

  function body() {
    return document.body || document.documentElement;
  }

  /* ------------------------------ DOM 缓存 -------------------------- */
  function cacheDom() {
    var ids = [
      "scene", "topbar", "btn-random", "btn-help", "sidebar", "btn-sidebar-toggle",
      "btn-sidebar-close", "search-input", "search-clear", "muscle-list", "muscle-count",
      "detail-panel", "detail-close", "detail-body", "view-controls", "btn-autorotate",
      "btn-reset", "tooltip", "toast", "loading", "help-modal", "btn-help-close",
      "panel-backdrop", "scene-hint"
    ];
    ids.forEach(function (id) {
      dom[id] = document.getElementById(id);
    });

    // 连字符 id 无法用点号访问，这里显式补几个语义别名
    dom.muscleList = dom["muscle-list"];
    dom.muscleCount = dom["muscle-count"];
    dom.searchInput = dom["search-input"];
    dom.searchClear = dom["search-clear"];
    dom.detailPanel = dom["detail-panel"];
    dom.detailBody = dom["detail-body"];
    dom.detailClose = dom["detail-close"];
    dom.viewControls = dom["view-controls"];
    dom.btnRandom = dom["btn-random"];
    dom.btnHelp = dom["btn-help"];
    dom.btnHelpClose = dom["btn-help-close"];
    dom.btnSidebarToggle = dom["btn-sidebar-toggle"];
    dom.btnSidebarClose = dom["btn-sidebar-close"];
    dom.btnAutorotate = dom["btn-autorotate"];
    dom.btnReset = dom["btn-reset"];
    dom.helpModal = dom["help-modal"];
    dom.panelBackdrop = dom["panel-backdrop"];
    dom.sceneHint = dom["scene-hint"];

    viewBtns = [];
    if (dom.viewControls && isFn(dom.viewControls.querySelectorAll)) {
      var found = dom.viewControls.querySelectorAll("[data-view]");
      for (var i = 0; i < found.length; i += 1) {
        viewBtns.push(found[i]);
      }
    }

    try {
      state.drawerMq = window.matchMedia("(max-width: 1199.98px)");
    } catch (error) {
      state.drawerMq = null;
    }
  }

  /* ------------------------------ 数据 ------------------------------ */
  function loadData() {
    muscles = Array.isArray(MA.muscles) ? MA.muscles.slice() : [];
    muscleById = MA.muscleById || {};
    if (!MA.muscleById) {
      muscles.forEach(function (muscle) {
        if (muscle && muscle.id) {
          muscleById[muscle.id] = muscle;
        }
      });
    }

    dataGroups = Array.isArray(MA.groups) ? MA.groups.slice() : [];
    dataGroups.sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });

    groupLabels = {};
    dataGroups.forEach(function (group) {
      if (group && group.id) {
        groupLabels[group.id] = group.name || GROUP_LABELS[group.id] || group.id;
      }
    });

    // 数据里存在、但 groups 未声明的分组，补到末尾，避免整块肌肉消失
    muscles.forEach(function (muscle) {
      if (!muscle || !muscle.group) {
        return;
      }
      var known = dataGroups.some(function (group) {
        return group.id === muscle.group;
      });
      if (!known) {
        dataGroups.push({
          id: muscle.group,
          name: GROUP_LABELS[muscle.group] || muscle.group,
          order: 999
        });
        groupLabels[muscle.group] = GROUP_LABELS[muscle.group] || muscle.group;
      }
    });

    exercisesById = window.MUSCLE_EXERCISES || {};
    total = muscles.length;
  }

  function groupLabel(groupId) {
    return groupLabels[groupId] || GROUP_LABELS[groupId] || groupId || "其他";
  }

  function viewsLabel(views) {
    if (!Array.isArray(views) || !views.length) {
      return "";
    }
    var labels = [];
    views.forEach(function (view) {
      var label = VIEW_LABELS[view];
      if (label && labels.indexOf(label) === -1) {
        labels.push(label);
      }
    });
    return labels.join(" · ");
  }

  function relatedMuscles(muscle) {
    var result = [];
    var seen = {};
    seen[muscle.id] = true;
    muscles.forEach(function (other) {
      if (result.length >= 5 || !other || seen[other.id]) {
        return;
      }
      if (other.group === muscle.group && other.id !== muscle.id) {
        seen[other.id] = true;
        result.push(other);
      }
    });
    if (result.length < 3 && Array.isArray(muscle.views)) {
      muscles.forEach(function (other) {
        if (result.length >= 5 || !other || seen[other.id] || !Array.isArray(other.views)) {
          return;
        }
        var overlap = other.views.some(function (view) {
          return muscle.views.indexOf(view) !== -1;
        });
        if (overlap) {
          seen[other.id] = true;
          result.push(other);
        }
      });
    }
    return result;
  }

  function searchText(muscle) {
    var parts = [muscle.name, muscle.nameEn, muscle.latin, muscle.pinyin];
    var bundle = exercisesById[muscle.id];
    if (bundle && Array.isArray(bundle.exercises)) {
      bundle.exercises.forEach(function (item) {
        if (!item) {
          return;
        }
        parts.push(item.name, item.nameEn, item.equipment, item.target);
      });
    }
    var text = parts
      .filter(function (part) {
        return typeof part === "string" && part.length > 0;
      })
      .join(" ")
      .toLowerCase();
    return { text: text, compact: text.replace(/\s+/g, "") };
  }

  /* ------------------------------ 左侧列表 -------------------------- */
  function buildList() {
    items = [];
    groupEls = [];
    if (!dom.muscleList) {
      return;
    }
    dom.muscleList.innerHTML = "";

    dataGroups.forEach(function (group) {
      var members = muscles.filter(function (muscle) {
        return muscle && muscle.group === group.id;
      });
      if (!members.length) {
        return;
      }

      var groupEl = element("div", "muscle-group");
      groupEl.setAttribute("data-group", group.id);
      if (state.collapsed[group.id]) {
        groupEl.classList.add("is-collapsed");
      }

      var head = element("button", "group-head");
      head.type = "button";
      head.setAttribute("aria-expanded", state.collapsed[group.id] ? "false" : "true");

      var dot = element("span", "group-dot");
      dot.setAttribute("style", "--c:" + esc(members[0].color || DEFAULT_COLOR));

      var nameNode = element("span", "group-name", groupLabel(group.id));
      var countNode = element("span", "group-count", String(members.length));

      head.appendChild(dot);
      head.appendChild(nameNode);
      head.appendChild(countNode);
      head.appendChild(chevron());

      var bodyNode = element("div", "group-items");
      var groupItems = [];

      members.forEach(function (muscle) {
        var item = element("button", "muscle-item");
        item.type = "button";
        item.setAttribute("data-muscle-id", muscle.id);

        var itemDot = element("span", "mi-dot");
        itemDot.setAttribute("style", "--c:" + esc(muscle.color || DEFAULT_COLOR));

        var textWrap = element("span", "mi-text");
        textWrap.appendChild(element("span", "mi-name", muscle.name || muscle.id));
        textWrap.appendChild(element("span", "mi-en", muscle.nameEn || ""));

        item.appendChild(itemDot);
        item.appendChild(textWrap);

        var haystack = searchText(muscle);
        var record = {
          id: muscle.id,
          el: item,
          groupId: group.id,
          match: true,
          text: haystack.text,
          compact: haystack.compact
        };
        items.push(record);
        groupItems.push(record);

        addEvent(item, "click", function () {
          requestSelect(muscle.id);
        });

        bodyNode.appendChild(item);
      });

      addEvent(head, "click", function () {
        setGroupCollapsed(group.id, !state.collapsed[group.id]);
      });

      groupEl.appendChild(head);
      groupEl.appendChild(bodyNode);
      dom.muscleList.appendChild(groupEl);

      groupEls.push({
        id: group.id,
        el: groupEl,
        head: head,
        countNode: countNode,
        members: groupItems,
        total: members.length
      });
    });

    dom.listEmpty = element("div", "list-empty");
    dom.listEmpty.hidden = true;
    dom.listEmpty.innerHTML =
      "<strong>没有匹配的肌肉</strong><span>试试「胸」「bi」「xiong」或动作名称</span>";
    dom.muscleList.appendChild(dom.listEmpty);

    applyFilter();
  }

  function setGroupCollapsed(groupId, collapsed) {
    state.collapsed[groupId] = !!collapsed;
    groupEls.forEach(function (group) {
      if (group.id !== groupId) {
        return;
      }
      setClass(group.el, "is-collapsed", !!collapsed);
      group.head.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
  }

  function applyFilter() {
    var query = state.query.trim().toLowerCase();
    var compactQuery = query.replace(/\s+/g, "");
    var visible = 0;

    items.forEach(function (item) {
      var match = true;
      if (query) {
        match = item.text.indexOf(query) !== -1;
        if (!match && compactQuery) {
          match = item.compact.indexOf(compactQuery) !== -1;
        }
      }
      item.match = match;
      item.el.hidden = !match;
      if (match) {
        visible += 1;
      }
    });

    groupEls.forEach(function (group) {
      var count = 0;
      group.members.forEach(function (item) {
        if (item.match) {
          count += 1;
        }
      });
      group.el.hidden = query ? count === 0 : false;
      setText(group.countNode, query ? count : group.total);
      if (query && count > 0) {
        // 搜索时自动展开有结果的组，保证用户一眼看到命中项
        setClass(group.el, "is-collapsed", false);
        group.head.setAttribute("aria-expanded", "true");
      } else if (!query) {
        var collapsed = !!state.collapsed[group.id];
        setClass(group.el, "is-collapsed", collapsed);
        group.head.setAttribute("aria-expanded", collapsed ? "false" : "true");
      }
    });

    if (dom.listEmpty) {
      dom.listEmpty.hidden = !(query && visible === 0);
    }
    if (dom.muscleCount) {
      dom.muscleCount.textContent = query
        ? visible + " / " + total + " 块肌肉"
        : total + " 块肌肉";
    }
    state.visibleCount = visible;
  }

  function syncActiveItem(id) {
    items.forEach(function (item) {
      var active = item.id === id;
      setClass(item.el, "is-active", active);
      if (active) {
        item.el.setAttribute("aria-current", "true");
      } else {
        item.el.removeAttribute("aria-current");
      }
    });
  }

  function findItem(id) {
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].id === id) {
        return items[i];
      }
    }
    return null;
  }

  function revealItem(id) {
    var item = findItem(id);
    if (!item) {
      return;
    }
    if (state.collapsed[item.groupId]) {
      setGroupCollapsed(item.groupId, false);
    }
    if (isFn(item.el.scrollIntoView)) {
      try {
        item.el.scrollIntoView({ block: "nearest" });
      } catch (error) {
        item.el.scrollIntoView(false);
      }
    }
  }

  /* ------------------------------ 详情渲染 -------------------------- */
  function emptyStateHtml() {
    return (
      '<div class="detail-empty">' +
      '<div class="empty-ornament" aria-hidden="true">' + EMPTY_ORNAMENT + "</div>" +
      '<p class="empty-eyebrow">ANATOMY ATLAS · 解剖图谱</p>' +
      '<h2 class="empty-title">选择一块肌肉开始</h2>' +
      '<p class="empty-text">在三维模型上点击肌肉，或从左侧索引中选择。每块肌肉都配有解剖起点、止点、主要功能与针对性训练动作。</p>' +
      '<ul class="empty-hints">' +
      '<li><span class="hint-mark">1</span><span>悬停模型可预览肌肉名称</span></li>' +
      '<li><span class="hint-mark">2</span><span>点击模型或索引选中肌肉</span></li>' +
      '<li><span class="hint-mark">3</span><span>在动作卡里查看步骤与教学视频</span></li>' +
      "</ul></div>"
    );
  }

  function exerciseCardHtml(item, index) {
    var name = item && item.name ? item.name : "未命名动作";
    var link = "https://search.bilibili.com/all?keyword=" + encodeURIComponent(name);
    var difficulty = parseInt(item && item.difficulty, 10);
    if (!(difficulty >= 1 && difficulty <= 3)) {
      difficulty = 1;
    }
    var stars = "";
    for (var i = 0; i < 3; i += 1) {
      stars += i < difficulty ? "★" : "☆";
    }

    var html = '<article class="exercise-card">';
    html += '<div class="ex-head">';
    html += '<span class="ex-index">' + pad2(index + 1) + "</span>";
    html += '<div class="ex-title-wrap">';
    html += '<h4 class="ex-name">' + esc(name) + "</h4>";
    if (item.nameEn) {
      html += '<p class="ex-en">' + esc(item.nameEn) + "</p>";
    }
    html += "</div>";
    html +=
      '<a class="ex-link" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" ' +
      'title="在 B 站搜索「' + esc(name) + '」教学视频">B站</a>';
    html += "</div>";

    html += '<div class="ex-meta">';
    html +=
      '<span class="meta-chip meta-diff" title="难度 ' + difficulty + ' / 3" ' +
      'aria-label="难度 ' + difficulty + ' / 3"><span class="stars" aria-hidden="true">' +
      stars + "</span></span>";
    if (item.equipment) {
      html += '<span class="meta-chip"><span class="meta-k">器械</span>' + esc(item.equipment) + "</span>";
    }
    if (item.sets) {
      html += '<span class="meta-chip"><span class="meta-k">组次</span>' + esc(item.sets) + "</span>";
    }
    if (item.rest) {
      html += '<span class="meta-chip"><span class="meta-k">休息</span>' + esc(item.rest) + "</span>";
    }
    if (item.target) {
      html += '<span class="meta-chip meta-target"><span class="meta-k">目标</span>' + esc(item.target) + "</span>";
    }
    html += "</div>";

    if (Array.isArray(item.steps) && item.steps.length) {
      html += '<ol class="ex-steps" aria-label="动作步骤">';
      item.steps.forEach(function (step) {
        html += "<li>" + esc(step) + "</li>";
      });
      html += "</ol>";
    }

    if (Array.isArray(item.tips) && item.tips.length) {
      html += '<ul class="ex-tips" aria-label="动作要点">';
      item.tips.forEach(function (tip) {
        html += "<li>" + esc(tip) + "</li>";
      });
      html += "</ul>";
    }

    if (item.alt) {
      html += '<p class="ex-alt"><span class="ex-alt-label">替代动作</span>' + esc(item.alt) + "</p>";
    }

    html += "</article>";
    return html;
  }

  function detailHtml(muscle) {
    var accent = muscle.color || DEFAULT_COLOR;
    var groupName = groupLabel(muscle.group);
    var views = viewsLabel(muscle.views);
    var bundle = exercisesById[muscle.id];
    var exercises = bundle && Array.isArray(bundle.exercises) ? bundle.exercises : [];
    var duties = Array.isArray(muscle.duties) ? muscle.duties : [];
    var related = relatedMuscles(muscle);

    var html = "";

    /* 头部 */
    html += '<div class="detail-head">';
    html += '<p class="detail-kicker">';
    html +=
      '<span class="group-badge" style="--c:' + esc(accent) +
      ";--c-soft:" + hexToRgba(accent, 0.16) +
      ";--c-line:" + hexToRgba(accent, 0.42) + '">' + esc(groupName) + "</span>";
    if (views) {
      html += '<span class="view-badge">' + esc(views) + "</span>";
    }
    html += "</p>";
    html += '<h2 class="detail-name">' + esc(muscle.name || muscle.id) + "</h2>";
    if (muscle.nameEn) {
      html += '<p class="detail-name-en">' + esc(muscle.nameEn) + "</p>";
    }
    if (muscle.latin) {
      html +=
        '<p class="detail-latin"><span class="latin-sep">LATIN</span><span>' +
        esc(muscle.latin) + "</span></p>";
    }
    html += '<span class="detail-ruler" aria-hidden="true"></span>';
    if (muscle.summary) {
      html += '<p class="detail-summary">' + esc(muscle.summary) + "</p>";
    }
    html += "</div>";

    /* 解剖定位 */
    html += '<section class="detail-section">';
    html +=
      '<div class="section-head"><h3 class="section-title">解剖定位</h3>' +
      '<span class="section-extra">Origin · Insertion</span></div>';
    html += '<dl class="kv-list">';
    html += '<div class="kv"><dt class="kv-key">起点</dt><dd class="kv-val">' +
      esc(muscle.origin || "—") + "</dd></div>";
    html += '<div class="kv"><dt class="kv-key">止点</dt><dd class="kv-val">' +
      esc(muscle.insertion || "—") + "</dd></div>";
    html += "</dl></section>";

    /* 主要功能 */
    html += '<section class="detail-section">';
    html +=
      '<div class="section-head"><h3 class="section-title">主要功能</h3>' +
      '<span class="section-extra">Function</span></div>';
    if (duties.length) {
      html += '<ol class="duty-list">';
      duties.forEach(function (duty, index) {
        html +=
          '<li class="duty-item"><span class="duty-idx">' + pad2(index + 1) +
          "</span><span>" + esc(duty) + "</span></li>";
      });
      html += "</ol>";
    } else {
      html += '<p class="kv-val">暂无功能数据。</p>';
    }
    if (muscle.training) {
      html +=
        '<p class="training-note"><span class="training-label">训练思路</span>' +
        esc(muscle.training) + "</p>";
    }
    html += "</section>";

    /* 训练动作 */
    html += '<section class="detail-section">';
    html +=
      '<div class="section-head"><h3 class="section-title">针对性训练</h3>' +
      '<span class="section-extra">' +
      (exercises.length ? exercises.length + " 个动作" : "EXERCISE") +
      "</span></div>";
    if (exercises.length) {
      html += '<div class="exercise-list">';
      exercises.forEach(function (exercise, index) {
        html += exerciseCardHtml(exercise, index);
      });
      html += "</div>";
    } else {
      html += '<p class="training-note">这块肌肉暂时没有收录训练动作。</p>';
    }
    html += "</section>";

    /* 关联肌肉 + 免责提示 */
    html += '<section class="detail-section">';
    html +=
      '<div class="section-head"><h3 class="section-title">关联部位</h3>' +
      '<span class="section-extra">Related</span></div>';
    if (related.length) {
      html += '<div class="related-chips">';
      related.forEach(function (other) {
        html +=
          '<button class="related-chip" type="button" data-related-id="' +
          esc(other.id) + '">' + esc(other.name || other.id) + "</button>";
      });
      html += "</div>";
    } else {
      html += '<p class="kv-val">暂无关联肌肉。</p>';
    }
    html +=
      '<p class="safety-note">' + WARN_ICON +
      "<span>动作幅度以个人关节活动度为准；存在伤病或疼痛时，请先咨询专业人士再安排训练。</span></p>";
    html += "</section>";

    return html;
  }

  function renderDetail(id) {
    if (!dom.detailBody) {
      return;
    }
    var muscle = id ? muscleById[id] : null;
    dom.detailBody.innerHTML = muscle ? detailHtml(muscle) : emptyStateHtml();
    dom.detailBody.scrollTop = 0;
  }

  /* ------------------------------ 选择流程 -------------------------- */
  function applySelection(id, options) {
    options = options || {};
    if (id && !muscleById[id]) {
      id = null;
    }
    var same = state.selectedId === id;
    state.selectedId = id;

    if (!same || !dom.detailBody || !dom.detailBody.innerHTML) {
      renderDetail(id);
    }
    syncActiveItem(id);

    if (id) {
      revealItem(id);
      openDetailPanel();
    } else {
      closeDetailPanel();
    }

    if (!options.silent) {
      writeHash();
    }
  }

  function requestSelect(id, options) {
    if (!id || !muscleById[id]) {
      return;
    }
    applySelection(id, options);
    if (state.engine && isFn(state.engine.select)) {
      try {
        state.engine.select(id);
      } catch (error) {
        // 引擎尚未就绪时忽略，稍后 onReady 会补一次
      }
    }
  }

  function clearSelection(options) {
    applySelection(null, options);
    if (state.engine && isFn(state.engine.clearSelection)) {
      try {
        state.engine.clearSelection();
      } catch (error) {
        // 忽略引擎未就绪
      }
    }
  }

  function normalizeInfo(info) {
    if (!info) {
      return null;
    }
    if (typeof info === "string") {
      return muscleById[info] ? info : null;
    }
    if (info.muscleId && muscleById[info.muscleId]) {
      return info.muscleId;
    }
    if (info.id && muscleById[info.id]) {
      return info.id;
    }
    return null;
  }

  /* ------------------------------ 哈希路由 -------------------------- */
  function parseHashObject() {
    var raw = String(window.location && window.location.hash ? window.location.hash : "").replace(/^#/, "");
    var result = { id: null, view: null };
    if (!raw) {
      return result;
    }
    raw.split("&").forEach(function (pair) {
      var index = pair.indexOf("=");
      if (index === -1) {
        return;
      }
      var key = pair.slice(0, index);
      var value = pair.slice(index + 1);
      try {
        value = decodeURIComponent(value);
      } catch (error) {
        // 保留原值
      }
      if (key === "m") {
        result.id = muscleById[value] ? value : null;
      } else if (key === "view" && VIEW_LABELS[value]) {
        result.view = value;
      }
    });
    return result;
  }

  function buildHash() {
    var parts = [];
    if (state.selectedId) {
      parts.push("m=" + encodeURIComponent(state.selectedId));
      parts.push("view=" + state.view);
    } else if (state.view !== "front") {
      parts.push("view=" + state.view);
    }
    return parts.length ? "#" + parts.join("&") : "";
  }

  function writeHash() {
    var next = buildHash();
    var current = window.location && window.location.hash ? window.location.hash : "";
    if (current === "#") {
      current = "";
    }
    if (next === current) {
      return;
    }
    state.lastHash = next;
    try {
      window.location.hash = next;
    } catch (error) {
      // file:// 下个别浏览器会拒绝空 hash，忽略即可
    }
  }

  function handleHashChange() {
    var current = window.location && window.location.hash ? window.location.hash : "";
    if (current === state.lastHash) {
      state.lastHash = "";
      return;
    }
    var parsed = parseHashObject();
    if (parsed.view && parsed.view !== state.view) {
      applyView(parsed.view, { writeHash: false });
    }
    if (parsed.id) {
      if (parsed.id !== state.selectedId) {
        requestSelect(parsed.id, { silent: true });
      }
    } else if (state.selectedId) {
      applySelection(null, { silent: true });
    }
  }

  /* ------------------------------ 视图控制 -------------------------- */
  function syncViewButtons() {
    viewBtns.forEach(function (button) {
      var view = button.getAttribute("data-view");
      var active = view === state.view;
      setClass(button, "is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function applyView(view, options) {
    options = options || {};
    if (VIEW_IDS.indexOf(view) === -1) {
      return;
    }
    state.view = view;
    syncViewButtons();
    if (options.writeHash !== false) {
      writeHash();
    }
    if (!state.ready) {
      state.pendingView = view;
      return;
    }
    if (state.engine && isFn(state.engine.setView)) {
      try {
        state.engine.setView(view);
      } catch (error) {
        state.pendingView = view;
      }
    }
  }

  function resetView() {
    state.view = "front";
    syncViewButtons();
    if (state.ready && state.engine && isFn(state.engine.resetView)) {
      try {
        state.engine.resetView();
      } catch (error) {
        // 忽略
      }
    }
    writeHash();
  }

  function setAutoRotate(enabled) {
    state.autoRotate = !!enabled;
    if (dom.btnAutorotate) {
      dom.btnAutorotate.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
  }

  function syncAutoRotateFromEngine() {
    if (!state.engine || !isFn(state.engine.getAutoRotate)) {
      return;
    }
    try {
      setAutoRotate(!!state.engine.getAutoRotate());
    } catch (error) {
      // 忽略
    }
  }

  function toggleAutoRotate() {
    var next = !state.autoRotate;
    if (state.engine && isFn(state.engine.toggleAutoRotate)) {
      try {
        var returned = state.engine.toggleAutoRotate();
        if (typeof returned === "boolean") {
          next = returned;
        } else if (isFn(state.engine.getAutoRotate)) {
          next = !!state.engine.getAutoRotate();
        }
      } catch (error) {
        // 忽略
      }
    }
    setAutoRotate(next);
  }

  /* ------------------------------ 抽屉 / 弹窗 ----------------------- */
  function isDrawerMode() {
    return !!(state.drawerMq && state.drawerMq.matches);
  }

  function syncBackdrop() {
    if (!dom.panelBackdrop) {
      return;
    }
    var open = hasClass(body(), "is-sidebar-open") || hasClass(body(), "is-drawer-open");
    dom.panelBackdrop.hidden = !open;
  }

  function openSidebar() {
    if (!isDrawerMode()) {
      return;
    }
    body().classList.add("is-sidebar-open");
    if (dom.btnSidebarToggle) {
      dom.btnSidebarToggle.setAttribute("aria-expanded", "true");
    }
    syncBackdrop();
  }

  function closeSidebar() {
    body().classList.remove("is-sidebar-open");
    if (dom.btnSidebarToggle) {
      dom.btnSidebarToggle.setAttribute("aria-expanded", "false");
    }
    syncBackdrop();
  }

  function toggleSidebar() {
    if (hasClass(body(), "is-sidebar-open")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  function openDetailPanel() {
    if (isDrawerMode()) {
      body().classList.add("is-drawer-open");
      closeSidebar();
      syncBackdrop();
    }
  }

  function closeDetailPanel() {
    body().classList.remove("is-drawer-open");
    syncBackdrop();
  }

  function isHelpOpen() {
    return !!dom.helpModal && dom.helpModal.hidden === false;
  }

  function openHelp() {
    if (!dom.helpModal) {
      return;
    }
    state.helpReturnFocus = document.activeElement || null;
    dom.helpModal.hidden = false;
    setClass(body(), "is-help-open", true);
    if (dom.btnHelpClose && isFn(dom.btnHelpClose.focus)) {
      try {
        dom.btnHelpClose.focus();
      } catch (error) {
        // 忽略
      }
    }
  }

  function closeHelp() {
    if (!dom.helpModal) {
      return;
    }
    dom.helpModal.hidden = true;
    setClass(body(), "is-help-open", false);
    if (state.helpReturnFocus && isFn(state.helpReturnFocus.focus)) {
      try {
        state.helpReturnFocus.focus();
      } catch (error) {
        // 忽略
      }
    }
    state.helpReturnFocus = null;
  }

  function trapHelpFocus(event) {
    if (!dom.helpModal || !dom.helpModal.querySelectorAll) {
      return;
    }
    var nodes = dom.helpModal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!nodes || !nodes.length) {
      return;
    }
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    var active = document.activeElement;
    if (event.shiftKey && (active === first || active === dom.helpModal)) {
      event.preventDefault();
      try {
        last.focus();
      } catch (error) {
        // 忽略
      }
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      try {
        first.focus();
      } catch (error) {
        // 忽略
      }
    }
  }

  /* ------------------------------ tooltip -------------------------- */
  function setPointer(event) {
    if (!event) {
      return;
    }
    if (typeof event.clientX === "number") {
      state.pointer.x = event.clientX;
    }
    if (typeof event.clientY === "number") {
      state.pointer.y = event.clientY;
    }
    if (event.pointerType) {
      state.pointer.touch = event.pointerType === "touch";
    }
  }

  function positionTooltip() {
    if (!dom.tooltip || !hasClass(dom.tooltip, "is-visible")) {
      return;
    }
    var width = dom.tooltip.offsetWidth || 0;
    var height = dom.tooltip.offsetHeight || 0;
    var viewportWidth = window.innerWidth || 1280;
    var viewportHeight = window.innerHeight || 800;
    var margin = 12;
    var gap = 14;
    var x = state.pointer.x;
    var y = state.pointer.y;

    var half = width / 2;
    var left = Math.min(Math.max(x, margin + half), viewportWidth - margin - half);
    var below = y - height - gap < margin;
    if (below) {
      setClass(dom.tooltip, "is-below", true);
      var top = Math.min(y + gap, viewportHeight - margin - height);
      dom.tooltip.style.left = left + "px";
      dom.tooltip.style.top = Math.max(margin, top) + "px";
    } else {
      setClass(dom.tooltip, "is-below", false);
      dom.tooltip.style.left = left + "px";
      dom.tooltip.style.top = y + "px";
    }
  }

  function showTooltip(muscleId, side) {
    if (!dom.tooltip || !muscleId || state.pointer.touch) {
      return;
    }
    var muscle = muscleById[muscleId];
    if (!muscle) {
      hideTooltip();
      return;
    }
    var html = '<span class="tt-name">' + esc(muscle.name || muscle.id) + "</span>";
    if (muscle.nameEn) {
      html += '<span class="tt-en">' + esc(muscle.nameEn) + "</span>";
    }
    var sideLabel = SIDE_LABELS[side] || "";
    if (sideLabel) {
      html += '<span class="tt-side">' + esc(sideLabel) + "</span>";
    }
    dom.tooltip.innerHTML = html;
    dom.tooltip.setAttribute("aria-hidden", "false");
    dom.tooltip.classList.add("is-visible");
    positionTooltip();
  }

  function hideTooltip() {
    if (!dom.tooltip) {
      return;
    }
    dom.tooltip.classList.remove("is-visible");
    dom.tooltip.setAttribute("aria-hidden", "true");
  }

  /* ------------------------------ toast ---------------------------- */
  function showToast(message, duration) {
    if (!dom.toast) {
      return;
    }
    dom.toast.textContent = String(message || "");
    dom.toast.classList.add("is-visible");
    if (state.toastTimer) {
      window.clearTimeout(state.toastTimer);
    }
    state.toastTimer = window.setTimeout(function () {
      dom.toast.classList.remove("is-visible");
      state.toastTimer = 0;
    }, duration || 2400);
  }

  /* ------------------------------ 搜索 ------------------------------ */
  function syncSearchClear() {
    if (dom.searchClear) {
      dom.searchClear.hidden = !state.query;
    }
  }

  function setQuery(value, options) {
    options = options || {};
    state.query = String(value == null ? "" : value);
    if (dom.searchInput && dom.searchInput.value !== state.query) {
      dom.searchInput.value = state.query;
    }
    syncSearchClear();
    applyFilter();
    if (options.toast && !state.query) {
      showToast("已清除搜索");
    }
  }

  function clearSearch(options) {
    options = options || {};
    setQuery("", options);
    if (options.focus !== false && dom.searchInput && isFn(dom.searchInput.focus)) {
      try {
        dom.searchInput.focus();
      } catch (error) {
        // 忽略
      }
    }
  }

  function selectFirstMatch() {
    var first = null;
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].match && !items[i].el.hidden) {
        first = items[i];
        break;
      }
    }
    if (first) {
      requestSelect(first.id);
    }
  }

  /* ------------------------------ 随机 ------------------------------ */
  function pickRandom() {
    if (!muscles.length) {
      return;
    }
    var pool = muscles.filter(function (muscle) {
      return muscle.id !== state.selectedId;
    });
    if (!pool.length) {
      pool = muscles;
    }
    var picked = pool[Math.floor(Math.random() * pool.length)];
    requestSelect(picked.id);
    showToast("随机推荐：" + (picked.name || picked.id));
  }

  /* ------------------------------ 引擎接线 -------------------------- */
  function onEngineHover(info) {
    var id = normalizeInfo(info);
    if (!id) {
      hideTooltip();
      return;
    }
    showTooltip(id, info && info.side);
  }

  function onEngineSelect(info) {
    var id = normalizeInfo(info);
    if (id === state.selectedId) {
      if (id) {
        openDetailPanel();
      }
      return;
    }
    applySelection(id);
  }

  function markReady(fromFallback) {
    var wasReady = state.ready;
    state.ready = true;
    if (!fromFallback) {
      hideLoading();
    }
    if (!wasReady) {
      applyPending();
    }
    syncAutoRotateFromEngine();
  }

  function hideLoading() {
    if (dom.loading) {
      dom.loading.classList.add("is-hidden");
      dom.loading.setAttribute("aria-hidden", "true");
    }
  }

  function applyPending() {
    if (state.pendingView) {
      var view = state.pendingView;
      state.pendingView = null;
      if (state.engine && isFn(state.engine.setView)) {
        try {
          state.engine.setView(view);
        } catch (error) {
          // 忽略
        }
      }
    }
    if (state.pendingId) {
      var id = state.pendingId;
      state.pendingId = null;
      if (state.engine && isFn(state.engine.select)) {
        try {
          state.engine.select(id);
        } catch (error) {
          // 忽略
        }
      }
      applySelection(id, { silent: true });
    }
  }

  function readyHook() {
    var previous = state.prevReady;
    if (isFn(previous)) {
      try {
        previous();
      } catch (error) {
        // 不阻断界面
      }
    }
    markReady(false);
  }

  function wireEngine(engine) {
    if (!engine) {
      return;
    }
    state.engine = engine;

    var previousHover = engine.onHover;
    engine.onHover = function (info) {
      if (isFn(previousHover)) {
        try {
          previousHover(info);
        } catch (error) {
          // 忽略
        }
      }
      onEngineHover(info);
    };

    var previousSelect = engine.onSelect;
    engine.onSelect = function (info) {
      if (isFn(previousSelect)) {
        try {
          previousSelect(info);
        } catch (error) {
          // 忽略
        }
      }
      onEngineSelect(info);
    };

    state.prevReady = isFn(engine.onReady) ? engine.onReady : null;
    engine.onReady = readyHook;

    syncAutoRotateFromEngine();
  }

  function adoptEngine(engine) {
    wireEngine(engine);
    if (state.pendingView) {
      var view = state.pendingView;
      state.pendingView = null;
      if (isFn(engine.setView)) {
        try {
          engine.setView(view);
        } catch (error) {
          // 忽略
        }
      }
    }
    if (state.selectedId && isFn(engine.select)) {
      try {
        engine.select(state.selectedId);
      } catch (error) {
        // 忽略
      }
    }
    syncAutoRotateFromEngine();
  }

  /**
   * main.js 可能在 UI.init 之后才挂 onReady，也可能更早。
   * 这里在就绪前做短周期看护：一旦发现 onReady 被外部替换，就重新包一层，
   * 保证「加载完成 → 应用 URL 中的选择」一定发生。
   */
  function startReadyWatchdog() {
    if (!state.engine || state.watchdog) {
      return;
    }
    var attempts = 0;
    state.watchdog = window.setInterval(function () {
      if (state.ready) {
        window.clearInterval(state.watchdog);
        state.watchdog = 0;
        return;
      }
      attempts += 1;
      if (attempts > 24) {
        window.clearInterval(state.watchdog);
        state.watchdog = 0;
        markReady(true);
        return;
      }
      var engine = state.engine;
      if (engine && engine.onReady !== readyHook) {
        state.prevReady = isFn(engine.onReady) ? engine.onReady : state.prevReady;
        engine.onReady = readyHook;
      }
    }, 250);
  }

  /* ------------------------------ 事件绑定 -------------------------- */
  function handleGlobalKeydown(event) {
    if (!event) {
      return;
    }
    var key = event.key;
    if (key === "Escape") {
      if (isHelpOpen()) {
        event.preventDefault();
        closeHelp();
        return;
      }
      if (hasClass(body(), "is-sidebar-open")) {
        closeSidebar();
        return;
      }
      if (hasClass(body(), "is-drawer-open")) {
        closeDetailPanel();
        return;
      }
      if (state.query) {
        clearSearch();
        return;
      }
      if (state.selectedId) {
        clearSelection();
        showToast("已取消选择");
      }
      return;
    }

    if (isHelpOpen()) {
      if (key === "Tab") {
        trapHelpFocus(event);
      }
      return;
    }

    var target = event.target;
    var tagName = target && target.tagName ? String(target.tagName).toLowerCase() : "";
    var typing =
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select" ||
      (target && target.isContentEditable);

    if (typing) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (key === "?" || key === "h" || key === "H") {
      event.preventDefault();
      if (isHelpOpen()) {
        closeHelp();
      } else {
        openHelp();
      }
      return;
    }
    if (key === "/") {
      event.preventDefault();
      if (dom.searchInput && isFn(dom.searchInput.focus)) {
        dom.searchInput.focus();
      }
    }
  }

  function bindChrome() {
    if (dom.searchInput) {
      addEvent(dom.searchInput, "input", function () {
        setQuery(dom.searchInput.value);
      });
      addEvent(dom.searchInput, "keydown", function (event) {
        if (!event) {
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          selectFirstMatch();
        } else if (event.key === "Escape") {
          event.preventDefault();
          clearSearch();
        }
      });
    }

    if (dom.searchClear) {
      addEvent(dom.searchClear, "click", function () {
        clearSearch();
      });
    }

    if (dom.btnRandom) {
      addEvent(dom.btnRandom, "click", pickRandom);
    }

    if (dom.btnHelp) {
      addEvent(dom.btnHelp, "click", function () {
        if (isHelpOpen()) {
          closeHelp();
        } else {
          openHelp();
        }
      });
    }

    if (dom.btnHelpClose) {
      addEvent(dom.btnHelpClose, "click", closeHelp);
    }

    if (dom.helpModal) {
      addEvent(dom.helpModal, "click", function (event) {
        var target = event && event.target;
        if (target && isFn(target.getAttribute) && target.getAttribute("data-action") === "close-help") {
          closeHelp();
        }
      });
    }

    if (dom.btnSidebarToggle) {
      addEvent(dom.btnSidebarToggle, "click", toggleSidebar);
    }

    if (dom.btnSidebarClose) {
      addEvent(dom.btnSidebarClose, "click", closeSidebar);
    }

    if (dom.detailClose) {
      addEvent(dom.detailClose, "click", function () {
        closeDetailPanel();
      });
    }

    if (dom.panelBackdrop) {
      addEvent(dom.panelBackdrop, "click", function () {
        closeSidebar();
        closeDetailPanel();
      });
    }

    if (dom.viewControls) {
      addEvent(dom.viewControls, "click", function (event) {
        var target = event && event.target;
        if (!target || !isFn(target.getAttribute)) {
          return;
        }
        var view = target.getAttribute("data-view");
        if (view && VIEW_IDS.indexOf(view) !== -1) {
          applyView(view);
        }
      });
    }

    if (dom.btnAutorotate) {
      addEvent(dom.btnAutorotate, "click", toggleAutoRotate);
    }

    if (dom.btnReset) {
      addEvent(dom.btnReset, "click", resetView);
    }

    if (dom.detailBody) {
      addEvent(dom.detailBody, "click", function (event) {
        var target = event && event.target;
        if (!target || !isFn(target.closest)) {
          return;
        }
        var chip = target.closest("[data-related-id]");
        if (chip && isFn(chip.getAttribute)) {
          requestSelect(chip.getAttribute("data-related-id"));
        }
      });
    }
  }

  function bindGlobal() {
    addEvent(document, "keydown", handleGlobalKeydown);

    addEvent(document, "pointermove", function (event) {
      setPointer(event);
      if (dom.tooltip && hasClass(dom.tooltip, "is-visible")) {
        positionTooltip();
      }
    }, { passive: true });

    addEvent(document, "pointerdown", function (event) {
      setPointer(event);
      if (event && event.pointerType === "touch") {
        hideTooltip();
      }
    }, { passive: true });

    addEvent(document, "mouseleave", hideTooltip);

    addEvent(window, "hashchange", handleHashChange);
    addEvent(window, "resize", function () {
      hideTooltip();
    });
    addEvent(window, "blur", hideTooltip);

    if (state.drawerMq) {
      var onDrawerChange = function () {
        if (!isDrawerMode()) {
          closeSidebar();
          closeDetailPanel();
        }
      };
      if (isFn(state.drawerMq.addEventListener)) {
        state.drawerMq.addEventListener("change", onDrawerChange);
      } else if (isFn(state.drawerMq.addListener)) {
        state.drawerMq.addListener(onDrawerChange);
      }
    }
  }

  /* ------------------------------ 启动 ------------------------------ */
  function applyHashOnStart() {
    var parsed = parseHashObject();
    if (parsed.view) {
      state.view = parsed.view;
      state.pendingView = parsed.view;
    }
    if (parsed.id) {
      state.pendingId = parsed.id;
    }
    syncViewButtons();
  }

  function init(engine) {
    if (state.inited) {
      if (engine && !state.engine) {
        adoptEngine(engine);
      }
      return;
    }
    state.inited = true;

    cacheDom();
    loadData();
    bindChrome();
    bindGlobal();
    buildList();
    renderDetail(null);
    applyHashOnStart();

    if (engine) {
      wireEngine(engine);
    } else {
      // 没有引擎时界面依旧可用（例如仅做静态检查），立即视为就绪
      state.ready = true;
      applyPending();
    }
    startReadyWatchdog();
  }

  function scheduleAutoInit() {
    var run = function () {
      window.setTimeout(function () {
        if (!state.inited) {
          init(null);
        }
      }, 400);
    };
    if (document.readyState === "complete") {
      run();
    } else {
      window.addEventListener("load", run);
    }
  }

  /* ------------------------------ 对外 API -------------------------- */
  MA.UI = {
    init: init,
    showMuscle: function (id) {
      requestSelect(id);
      return state.selectedId;
    },
    hideMuscle: function () {
      clearSelection();
    },
    getSelected: function () {
      return state.selectedId;
    }
  };

  scheduleAutoInit();
})();
