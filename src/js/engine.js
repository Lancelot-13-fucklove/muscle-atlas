/* =====================================================================
 * muscle-atlas / engine.js
 * three.js 渲染引擎：场景、灯光、程序化环境贴图、OrbitControls、
 * 鼠标拾取（hover / click）、选中高亮、相机补间、视角切换、自动旋转。
 * 经典脚本，无 import/export；依赖全局 THREE 与 window.MUSCLE_ATLAS.body。
 * ===================================================================== */
(function (global) {
  'use strict';

  var A = global.MUSCLE_ATLAS = global.MUSCLE_ATLAS || {};

  var VIEWS = {
    front: { az: 0, el: 4, dist: 3.8, target: [0, 0.92, 0] },
    back: { az: 180, el: 4, dist: 3.8, target: [0, 0.92, 0] },
    left: { az: -90, el: 4, dist: 3.8, target: [0, 0.92, 0] },
    right: { az: 90, el: 4, dist: 3.8, target: [0, 0.92, 0] }
  };

  function noop() {}

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* 程序化影棚背景（等距圆柱投影），同时用作 environment 的源 */
  function makeBackdropCanvas() {
    var c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    var ctx = c.getContext('2d');

    var g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0.00, '#03050a');
    g.addColorStop(0.34, '#060b13');
    g.addColorStop(0.52, '#0b1220');
    g.addColorStop(0.66, '#1a1822');
    g.addColorStop(0.74, '#231a1d');
    g.addColorStop(0.86, '#0a0a10');
    g.addColorStop(1.00, '#020305');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);

    /* 地平线上的暖色舞台光 */
    var rg = ctx.createRadialGradient(c.width * 0.5, c.height * 0.66, 8,
      c.width * 0.5, c.height * 0.66, c.width * 0.46);
    rg.addColorStop(0.00, 'rgba(196,120,74,0.55)');
    rg.addColorStop(0.35, 'rgba(120,64,40,0.26)');
    rg.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, c.width, c.height);

    /* 顶部冷光 */
    var cg = ctx.createRadialGradient(c.width * 0.30, c.height * 0.10, 4,
      c.width * 0.30, c.height * 0.10, c.width * 0.35);
    cg.addColorStop(0.00, 'rgba(96,132,182,0.30)');
    cg.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, c.width, c.height);

    return c;
  }

  function buildEnvironment(THREE, renderer, scene) {
    var canvas = makeBackdropCanvas();
    var tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;

    scene.background = tex;

    try {
      var pmrem = new THREE.PMREMGenerator(renderer);
      if (pmrem.compileEquirectangularShader) pmrem.compileEquirectangularShader();
      var envRT = pmrem.fromEquirectangular(tex);
      scene.environment = envRT.texture;
      pmrem.dispose();
    } catch (err) {
      if (global.console && console.warn) console.warn('[engine] environment 生成失败，改用纯色背景', err);
    }
    return tex;
  }

  function makeDust(THREE) {
    var count = 170;
    var positions = new Float32Array(count * 3);
    var sizes = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2;
      var rad = 0.55 + Math.random() * 1.15;
      positions[i * 3 + 0] = Math.cos(ang) * rad;
      positions[i * 3 + 1] = 0.05 + Math.random() * 1.95;
      positions[i * 3 + 2] = Math.sin(ang) * rad;
      sizes[i] = 0.5 + Math.random();
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    var mat = new THREE.PointsMaterial({
      color: 0xe9dcc6,
      size: 0.0085,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var points = new THREE.Points(geo, mat);
    points.name = 'dust';
    points.frustumCulled = false;
    return points;
  }

  function create(THREE, userOpts) {
    if (!THREE) throw new Error('engine.create 需要 three.js');
    var opts = userOpts || {};
    var bodyApi = (A.body && A.body.build) ? A.body : null;
    if (!bodyApi) throw new Error('engine.create 需要 MUSCLE_ATLAS.body');

    /* three r140 默认 legacy 色彩模式：程序里的十六进制颜色会被当成线性值直接用，
       结果整个场景发灰发白（肌肉色 #c33d2b 会变成浅肉粉）。切到 sRGB 解析后，
       材质色与灯光色才和 CSS 里的颜色观感一致。必须先于任何材质/灯光创建。 */
    if (THREE.ColorManagement && 'legacyMode' in THREE.ColorManagement) {
      THREE.ColorManagement.legacyMode = false;
    }

    /* ---------------- DOM / renderer ---------------- */
    var canvas = opts.canvas || document.getElementById('scene');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'scene';
      document.body.appendChild(canvas);
    }

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.setSize(global.innerWidth, global.innerHeight, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070a10);

    var camera = new THREE.PerspectiveCamera(30, global.innerWidth / Math.max(global.innerHeight, 1), 0.05, 60);
    var defaultTarget = new THREE.Vector3(0, 0.92, 0);
    camera.position.set(0, 1.26, 3.8);
    camera.lookAt(defaultTarget);

    /* ---------------- 环境 / 灯光 ---------------- */
    buildEnvironment(THREE, renderer, scene);

    var hemi = new THREE.HemisphereLight(0x9fb6d8, 0x241512, 0.36);
    hemi.position.set(0, 3, 0);
    scene.add(hemi);

    var key = new THREE.DirectionalLight(0xfff0dd, 1.15);
    key.position.set(2.35, 3.15, 2.55);
    key.target.position.set(0, 0.95, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -1.35;
    key.shadow.camera.right = 1.35;
    key.shadow.camera.top = 1.75;
    key.shadow.camera.bottom = -0.55;
    key.shadow.camera.near = 0.6;
    key.shadow.camera.far = 9;
    key.shadow.bias = -0.0007;
    if ('normalBias' in key.shadow) key.shadow.normalBias = 0.018;
    scene.add(key);
    scene.add(key.target);

    var fill = new THREE.DirectionalLight(0x7f9fc9, 0.36);
    fill.position.set(-3.1, 1.7, 1.5);
    fill.target.position.set(0, 0.95, 0);
    scene.add(fill);
    scene.add(fill.target);

    var rim = new THREE.DirectionalLight(0xff8a5a, 0.58);
    rim.position.set(-1.4, 2.4, -3.2);
    rim.target.position.set(0, 1.0, 0);
    scene.add(rim);
    scene.add(rim.target);

    // 背侧补光：让「背面」视角的背阔肌 / 竖脊肌 / 臀大肌保持可读
    var backFill = new THREE.DirectionalLight(0xbfd0e8, 0.42);
    backFill.position.set(1.7, 2.3, -2.9);
    backFill.target.position.set(0, 1.0, 0);
    scene.add(backFill);
    scene.add(backFill.target);

    var spot = new THREE.SpotLight(0xffe8cd, 0.85, 9.5, 0.62, 0.85, 1.4);
    spot.position.set(0, 4.1, 2.5);
    spot.target.position.set(0, 1.0, 0);
    scene.add(spot);
    scene.add(spot.target);

    /* ---------------- 地面（承接阴影的展厅地板） ---------------- */
    var floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e16,
      roughness: 0.94,
      metalness: 0.05
    });
    var floor = new THREE.Mesh(new THREE.CircleGeometry(3.4, 72), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.058;
    floor.receiveShadow = true;
    floor.name = 'gallery-floor';
    scene.add(floor);

    /* ---------------- 人体 ---------------- */
    var body = bodyApi.build(THREE);
    scene.add(body.root);

    scene.traverse(function (node) {
      if (!node.isMesh) return;
      var mat = node.material;
      if (mat && mat.isMeshStandardMaterial) mat.envMapIntensity = 0.22;
    });

    var dust = makeDust(THREE);
    scene.add(dust);

    /* ---------------- 相机控制 ---------------- */
    var controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.82;
    controls.zoomSpeed = 0.8;
    controls.enablePan = false;
    controls.minDistance = 1.05;
    controls.maxDistance = 6.4;
    controls.minPolarAngle = 0.22;
    controls.maxPolarAngle = Math.PI * 0.86;
    controls.target.copy(defaultTarget);
    controls.autoRotateSpeed = 0.95;
    controls.update();

    /* ---------------- 材质状态 ---------------- */
    var muscleMaterials = body.muscleMaterials || {};
    var materialBase = {};
    Object.keys(muscleMaterials).forEach(function (id) {
      var mat = muscleMaterials[id];
      materialBase[id] = {
        color: mat.color.clone(),
        emissive: mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000)
      };
    });

    var hoverId = null;
    var selectedId = null;

    function applyState(id, state, pulse) {
      var mat = muscleMaterials[id];
      var base = materialBase[id];
      if (!mat || !base) return;
      if (state === 'dim') {
        mat.color.copy(base.color).multiplyScalar(0.26);
        if (mat.emissive) mat.emissive.copy(base.color).multiplyScalar(0.016);
        mat.emissiveIntensity = 1;
        mat.roughness = 0.78;
      } else if (state === 'hover') {
        mat.color.copy(base.color).multiplyScalar(1.10);
        if (mat.emissive) mat.emissive.copy(base.color).multiplyScalar(0.19);
        mat.emissiveIntensity = 1.05;
        mat.roughness = 0.48;
      } else if (state === 'selected') {
        mat.color.copy(base.color);
        if (mat.emissive) mat.emissive.copy(base.color).multiplyScalar(0.30);
        mat.emissiveIntensity = pulse == null ? 1.05 : pulse;
        mat.roughness = 0.42;
      } else {
        mat.color.copy(base.color);
        if (mat.emissive) mat.emissive.copy(base.emissive || new THREE.Color(0x000000));
        mat.emissiveIntensity = 1;
        mat.roughness = 0.6;
      }
    }

    function refreshMaterials() {
      Object.keys(muscleMaterials).forEach(function (id) {
        var state = 'idle';
        if (selectedId) state = (id === selectedId) ? 'selected' : 'dim';
        else if (hoverId === id) state = 'hover';
        applyState(id, state);
      });
    }

    /* ---------------- 相机补间 ---------------- */
    var camTween = null;

    function sphericalOf(vec) {
      var r = vec.length();
      if (r < 1e-5) return { az: 0, el: 0, r: 3.8 };
      return {
        az: Math.atan2(vec.x, vec.z),
        el: Math.asin(clamp(vec.y / r, -1, 1)),
        r: r
      };
    }

    function shortestAngle(from, to) {
      var d = to - from;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    }

    function tweenTo(position, target, duration) {
      var fromLook = controls.target.clone();
      var toLook = target.clone();
      camTween = {
        fromLook: fromLook,
        toLook: toLook,
        from: sphericalOf(camera.position.clone().sub(fromLook)),
        to: sphericalOf(position.clone().sub(toLook)),
        dAz: 0,
        start: global.performance ? performance.now() : Date.now(),
        duration: duration || 760
      };
      camTween.dAz = shortestAngle(camTween.from.az, camTween.to.az);
      controls.enabled = false;
    }

    function updateTween(now) {
      if (!camTween) return;
      var t = clamp((now - camTween.start) / camTween.duration, 0, 1);
      var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      var az = camTween.from.az + camTween.dAz * e;
      var el = camTween.from.el + (camTween.to.el - camTween.from.el) * e;
      var r = camTween.from.r + (camTween.to.r - camTween.from.r) * e;
      controls.target.lerpVectors(camTween.fromLook, camTween.toLook, e);
      /* 绕目标做球面插值：切换视角时相机沿弧线绕身体转，而不是直线穿模 */
      camera.position.set(
        controls.target.x + Math.sin(az) * Math.cos(el) * r,
        controls.target.y + Math.sin(el) * r,
        controls.target.z + Math.cos(az) * Math.cos(el) * r
      );
      controls.update();
      if (t >= 1) {
        camTween = null;
        controls.enabled = true;
      }
    }

    function viewSpherical(az, el, dist, target) {
      var a = az * Math.PI / 180;
      var b = el * Math.PI / 180;
      return new THREE.Vector3(
        target.x + Math.sin(a) * Math.cos(b) * dist,
        target.y + Math.sin(b) * dist,
        target.z + Math.cos(a) * Math.cos(b) * dist
      );
    }

    function setView(name) {
      var v = VIEWS[name];
      if (!v) return false;
      var target = new THREE.Vector3(v.target[0], v.target[1], v.target[2]);
      tweenTo(viewSpherical(v.az, v.el, v.dist, target), target, 780);
      return true;
    }

    function resetView() {
      if (selectedId) {
        selectedId = null;
        refreshMaterials();
        if (typeof engine.onSelect === 'function') engine.onSelect(null);
      }
      var v = VIEWS.front;
      var target = new THREE.Vector3(v.target[0], v.target[1], v.target[2]);
      tweenTo(viewSpherical(v.az, v.el, v.dist, target), target, 780);
      return true;
    }

    /* ---------------- 选中 / 悬停 ---------------- */
    var engines = null;

    function sideOf(mesh) {
      return (mesh && mesh.userData && mesh.userData.side) || 'center';
    }

    function focusOnMuscle(id) {
      var meshes = body.muscleMeshes && body.muscleMeshes[id];
      if (!meshes || !meshes.length) return;
      var box = new THREE.Box3();
      for (var i = 0; i < meshes.length; i++) {
        meshes[i].updateMatrixWorld(true);
        box.expandByObject(meshes[i]);
      }
      if (box.isEmpty()) return;
      var center = box.getCenter(new THREE.Vector3());
      /* 取景目标略向躯干中部收：选中上身肌肉时保留更多下身轮廓，避免只拍到半截腿 */
      center.y = clamp(center.y * 0.86 + 0.14, 0.86, 1.24);
      var size = box.getSize(new THREE.Vector3());
      var maxDim = Math.max(size.x, size.y, size.z);
      var dist = clamp(maxDim * 2.2 + 2.55, 3.2, 4.0);
      /* 若此刻正在做视角补间（例如深链接 #m=x&view=back 先 setView 再 select），
       * 用补间的目标方向，而不是相机当前（还在路上）的方向，否则会转回原来的视角。 */
      var dir;
      if (camTween) {
        dir = new THREE.Vector3(
          Math.sin(camTween.to.az) * Math.cos(camTween.to.el),
          Math.sin(camTween.to.el),
          Math.cos(camTween.to.az) * Math.cos(camTween.to.el)
        );
      } else {
        dir = camera.position.clone().sub(controls.target);
      }
      if (dir.lengthSq() < 1e-8) dir.set(0, 0.2, 1);
      dir.normalize();
      var pos = center.clone().add(dir.multiplyScalar(dist));
      tweenTo(pos, center, 720);
    }

    function select(id) {
      if (id == null) { clearSelection(); return false; }
      var meshes = body.muscleMeshes && body.muscleMeshes[id];
      if (!meshes || !meshes.length) return false;
      selectedId = id;
      hoverId = null;
      refreshMaterials();
      focusOnMuscle(id);
      if (typeof engine.onSelect === 'function') {
        engine.onSelect({ muscleId: id, side: sideOf(meshes[0]) });
      }
      return true;
    }

    function clearSelection() {
      if (!selectedId) return false;
      selectedId = null;
      refreshMaterials();
      if (typeof engine.onSelect === 'function') engine.onSelect(null);
      return true;
    }

    function setHover(info) {
      var id = info ? info.muscleId : null;
      if (id === hoverId) {
        if (info && typeof engine.onHover === 'function') engine.onHover(info);
        return;
      }
      hoverId = id;
      refreshMaterials();
      if (typeof engine.onHover === 'function') engine.onHover(info || null);
      canvas.style.cursor = info ? 'pointer' : 'grab';
    }

    function toggleAutoRotate(force) {
      if (force === true || force === false) controls.autoRotate = force;
      else controls.autoRotate = !controls.autoRotate;
      return controls.autoRotate;
    }

    function getAutoRotate() { return !!controls.autoRotate; }

    /* ---------------- 拾取 ---------------- */
    var raycaster = new THREE.Raycaster();
    var pointer = new THREE.Vector2();
    var pointerPending = false;
    var pointerDown = null;
    var interactive = body.interactive || [];

    function eventNdc(ev) {
      var rect = canvas.getBoundingClientRect();
      var x = ((ev.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      var y = -((ev.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1;
      return { x: x, y: y };
    }

    function pick(ev) {
      var ndc = eventNdc(ev);
      pointer.set(ndc.x, ndc.y);
      raycaster.setFromCamera(pointer, camera);
      var hits = raycaster.intersectObjects(interactive, false);
      if (!hits.length) return null;
      var mesh = hits[0].object;
      var id = mesh.userData && mesh.userData.muscleId;
      if (!id) return null;
      return { muscleId: id, side: sideOf(mesh) };
    }

    function onPointerMove(ev) {
      if (ev.pointerType && ev.pointerType !== 'mouse') return;
      if (pointerDown) return;
      /* 悬停拾取同步执行（带 24ms 节流）：不必等下一帧，交互更跟手 */
      var now = global.performance ? performance.now() : Date.now();
      if (now - lastHoverCheck < 24) {
        pointerPending = ev;
        return;
      }
      lastHoverCheck = now;
      pointerPending = null;
      setHover(pick(ev));
    }

    function onPointerLeave() {
      if (pointerDown) return;
      pointerPending = null;
      setHover(null);
    }

    function onPointerDown(ev) {
      pointerDown = { x: ev.clientX, y: ev.clientY, time: Date.now() };
      canvas.style.cursor = 'grabbing';
    }

    function onPointerUp(ev) {
      var down = pointerDown;
      pointerDown = null;
      canvas.style.cursor = hoverId ? 'pointer' : 'grab';
      if (!down) return;
      var dx = ev.clientX - down.x;
      var dy = ev.clientY - down.y;
      var moved = Math.sqrt(dx * dx + dy * dy);
      if (moved > 7) return;
      if (Date.now() - down.time > 900) return;
      var hit = pick(ev);
      if (hit) select(hit.muscleId);
      else clearSelection();
    }

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointerdown', onPointerDown);
    global.addEventListener('pointerup', onPointerUp);
    canvas.style.cursor = 'grab';

    /* ---------------- 尺寸 ---------------- */
    function onResize() {
      var w = global.innerWidth;
      var h = Math.max(global.innerHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }
    global.addEventListener('resize', onResize);

    /* ---------------- 主循环 ---------------- */
    var clock = new THREE.Clock();
    var frames = 0;
    var lastHoverCheck = 0;

    function tick() {
      var raf = global.requestAnimationFrame(tick);
      var now = global.performance ? performance.now() : Date.now();
      var t = clock.getElapsedTime();

      updateTween(now);

      if (pointerPending && now - lastHoverCheck > 34) {
        lastHoverCheck = now;
        var hit = pick(pointerPending);
        pointerPending = null;
        setHover(hit);
      }

      if (selectedId) {
        var pulse = 1.05 + 0.32 * Math.sin(t * 3.6);
        applyState(selectedId, 'selected', pulse);
      }

      /* 尘埃缓慢漂浮 */
      if (dust) {
        dust.rotation.y = t * 0.035;
        dust.position.y = Math.sin(t * 0.35) * 0.012;
      }

      controls.update();
      renderer.render(scene, camera);

      frames++;
      if (frames === 2 && typeof engine.onReady === 'function') {
        global.setTimeout(function () {
          if (typeof engine.onReady === 'function') engine.onReady();
        }, 0);
      }
      return raf;
    }

    /* ---------------- 对外接口 ---------------- */
    var engine = {
      onHover: noop,
      onSelect: noop,
      onReady: noop,
      select: select,
      clearSelection: clearSelection,
      setView: setView,
      resetView: resetView,
      toggleAutoRotate: toggleAutoRotate,
      getAutoRotate: getAutoRotate,
      getSelected: function () { return selectedId; },
      getHovered: function () { return hoverId; },
      getAutoRotateState: getAutoRotate,
      /* 调试/扩展用 */
      scene: scene,
      camera: camera,
      renderer: renderer,
      controls: controls,
      body: body,
      raycast: pick
    };

    refreshMaterials();
    onResize();
    tick();

    return engine;
  }

  A.engine = { create: create, VIEWS: VIEWS };
})(typeof window !== 'undefined' ? window : this);
