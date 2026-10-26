/* ============================================================================
 * muscle-atlas / src/js/body.js
 * 程序化人体 + 肌肉网格（原创几何，不依赖任何第三方模型资产）
 * 经典浏览器脚本（非 ES module）：window.MUSCLE_ATLAS.body.build(THREE)
 *
 * 坐标约定：y 向上，+z 为身体正面，+x 为受试者右侧（站在 +z 看向 -z 时 +x 在观察者左侧）。
 * 单位：约 1 = 1 米，全身高 1.8。脚底在 y≈0，头顶在 y≈1.80。
 *
 * 技术要点：
 *  - 每块肌肉由 1-4 条 “肌腹”（沿中心线的变半径椭圆柱）或椭球组成；
 *  - 先构建右侧（sign=+1），再以 sign=-1 镜像构建左侧，避免负缩放导致法线反向；
 *  - 顶点色做细微肌纤维条纹（0.88-1.0 灰度），由材质 color 相乘着色；
 *  - 所有肌肉网格 userData = { muscleId, side }，引擎据此 raycast 拾取。
 * ========================================================================== */
(function (root) {
  'use strict';

  var A = root.MUSCLE_ATLAS || (root.MUSCLE_ATLAS = {});

  /* ------------------------------------------------------------------ *
   * 一、关键体表坐标（右侧，+x）
   * ------------------------------------------------------------------ */
  var P = {
    shoulder:  [0.205, 1.445, 0.000],
    elbow:     [0.245, 1.155, 0.008],
    wrist:     [0.277, 0.900, 0.020],
    hip:       [0.098, 0.920, 0.000],
    knee:      [0.115, 0.500, 0.012],
    ankle:     [0.120, 0.095, 0.000],
    toe:       [0.120, 0.032, 0.155]
  };

  /* ------------------------------------------------------------------ *
   * 二、肌肉造型定义
   *   s: 肌腹（strand），沿 CatmullRom 中心线生成变半径椭圆柱
   *      pts  中心线控制点（右侧坐标）
   *      r    中段最大半径
   *      flat 截面沿身体表面法线方向的压扁系数（0.4-1）
   *      n    压扁轴提示：即“垂直于皮肤向外”的近似方向
   *   e: 椭球（ellipsoid），用于腹直肌这类块状肌
   *      pos / sc（三轴半径）
   * ------------------------------------------------------------------ */
  var DEFS = {
    'pectoralis-major': [
      { pts: [[0.010, 1.418, 0.086], [0.082, 1.434, 0.102], [0.158, 1.400, 0.070]], r: 0.044, flat: 0.52, n: [0, 0, 1] },
      { pts: [[0.008, 1.346, 0.106], [0.080, 1.358, 0.118], [0.160, 1.344, 0.072]], r: 0.050, flat: 0.52, n: [0, 0, 1] },
      { pts: [[0.010, 1.272, 0.094], [0.076, 1.296, 0.106], [0.156, 1.314, 0.068]], r: 0.044, flat: 0.48, n: [0, 0, 1] }
    ],
    'deltoid-anterior': [
      { pts: [[0.140, 1.478, 0.072], [0.188, 1.442, 0.055], [0.220, 1.382, 0.034]], r: 0.040, flat: 0.72, n: [0, 0, 1] },
      { pts: [[0.160, 1.462, 0.052], [0.200, 1.428, 0.040], [0.224, 1.372, 0.024]], r: 0.030, flat: 0.72, n: [0, 0, 1] }
    ],
    'deltoid-lateral': [
      { pts: [[0.166, 1.492, 0.004], [0.212, 1.452, 0.000], [0.248, 1.372, -0.004]], r: 0.044, flat: 0.80, n: [1, 0, 0] },
      { pts: [[0.182, 1.478, -0.014], [0.220, 1.436, -0.014], [0.246, 1.362, -0.014]], r: 0.032, flat: 0.80, n: [1, 0, 0] }
    ],
    'deltoid-posterior': [
      { pts: [[0.158, 1.474, -0.055], [0.203, 1.440, -0.052], [0.238, 1.374, -0.030]], r: 0.039, flat: 0.72, n: [0, 0, -1] },
      { pts: [[0.176, 1.456, -0.034], [0.212, 1.424, -0.032], [0.236, 1.362, -0.020]], r: 0.028, flat: 0.72, n: [0, 0, -1] }
    ],
    'trapezius': [
      { pts: [[0.020, 1.532, -0.036], [0.090, 1.520, -0.058], [0.176, 1.480, -0.056]], r: 0.034, flat: 0.48, n: [0, 0, -1] },
      { pts: [[0.030, 1.438, -0.104], [0.110, 1.458, -0.100], [0.184, 1.464, -0.050]], r: 0.038, flat: 0.46, n: [0, 0, -1] },
      { pts: [[0.032, 1.300, -0.100], [0.092, 1.372, -0.106], [0.170, 1.438, -0.076]], r: 0.036, flat: 0.44, n: [0, 0, -1] }
    ],
    'latissimus-dorsi': [
      { pts: [[0.030, 1.362, -0.094], [0.100, 1.372, -0.094], [0.190, 1.396, -0.020]], r: 0.041, flat: 0.50, n: [0, 0, -1] },
      { pts: [[0.030, 1.252, -0.092], [0.100, 1.286, -0.096], [0.190, 1.360, -0.018]], r: 0.047, flat: 0.50, n: [0, 0, -1] },
      { pts: [[0.030, 1.130, -0.082], [0.100, 1.186, -0.094], [0.184, 1.318, -0.016]], r: 0.042, flat: 0.46, n: [0, 0, -1] }
    ],
    'erector-spinae': [
      { pts: [[0.044, 1.418, -0.112], [0.050, 1.300, -0.120], [0.044, 1.180, -0.108]], r: 0.026, flat: 0.72, n: [0, 0, -1] },
      { pts: [[0.044, 1.168, -0.104], [0.050, 1.056, -0.108], [0.040, 0.952, -0.094]], r: 0.025, flat: 0.72, n: [0, 0, -1] },
      { pts: [[0.030, 1.470, -0.108], [0.036, 1.432, -0.116], [0.038, 1.398, -0.116]], r: 0.018, flat: 0.72, n: [0, 0, -1] }
    ],
    'infraspinatus': [
      { pts: [[0.088, 1.452, -0.098], [0.140, 1.442, -0.090], [0.192, 1.414, -0.056]], r: 0.034, flat: 0.50, n: [0, 0, -1] },
      { pts: [[0.100, 1.418, -0.092], [0.146, 1.408, -0.082], [0.194, 1.386, -0.050]], r: 0.026, flat: 0.50, n: [0, 0, -1] }
    ],
    'biceps-brachii': [
      { pts: [[0.194, 1.424, 0.042], [0.222, 1.286, 0.050], [0.242, 1.164, 0.034]], r: 0.034, flat: 0.85, n: [0, 0, 1] },
      { pts: [[0.182, 1.408, 0.018], [0.212, 1.284, 0.026], [0.240, 1.162, 0.016]], r: 0.029, flat: 0.85, n: [0, 0, 1] }
    ],
    'triceps-brachii': [
      { pts: [[0.188, 1.420, -0.048], [0.218, 1.286, -0.054], [0.242, 1.196, -0.030]], r: 0.033, flat: 0.85, n: [0, 0, -1] },
      { pts: [[0.208, 1.398, -0.020], [0.232, 1.282, -0.030], [0.248, 1.170, -0.014]], r: 0.029, flat: 0.85, n: [0, 0, -1] },
      { pts: [[0.214, 1.280, -0.032], [0.238, 1.190, -0.024], [0.250, 1.152, -0.012]], r: 0.021, flat: 0.85, n: [0, 0, -1] }
    ],
    'forearm-flexors': [
      { pts: [[0.238, 1.140, 0.042], [0.258, 1.020, 0.044], [0.274, 0.918, 0.030]], r: 0.029, flat: 0.80, n: [0, 0, 1] },
      { pts: [[0.234, 1.132, 0.024], [0.254, 1.018, 0.026], [0.270, 0.918, 0.018]], r: 0.026, flat: 0.80, n: [0, 0, 1] },
      { pts: [[0.246, 1.126, 0.006], [0.264, 1.012, 0.008], [0.278, 0.918, 0.004]], r: 0.021, flat: 0.80, n: [0, 0, 1] }
    ],
    'forearm-extensors': [
      { pts: [[0.242, 1.140, -0.034], [0.260, 1.020, -0.036], [0.274, 0.918, -0.026]], r: 0.027, flat: 0.80, n: [0, 0, -1] },
      { pts: [[0.238, 1.130, -0.014], [0.256, 1.016, -0.016], [0.270, 0.918, -0.012]], r: 0.023, flat: 0.80, n: [0, 0, -1] },
      { pts: [[0.250, 1.120, -0.002], [0.266, 1.010, -0.004], [0.280, 0.918, 0.000]], r: 0.019, flat: 0.80, n: [0, 0, -1] }
    ],
    'rectus-abdominis': [
      { e: [0.045, 1.256, 0.097], sc: [0.047, 0.035, 0.013] },
      { e: [0.045, 1.194, 0.094], sc: [0.047, 0.035, 0.014] },
      { e: [0.046, 1.132, 0.091], sc: [0.046, 0.034, 0.014] },
      { e: [0.045, 1.070, 0.087], sc: [0.044, 0.033, 0.013] },
      { e: [0.042, 1.002, 0.081], sc: [0.046, 0.040, 0.013] }
    ],
    'obliques': [
      { pts: [[0.118, 1.270, 0.056], [0.136, 1.158, 0.070], [0.142, 1.052, 0.056]], r: 0.034, flat: 0.55, n: [0.7, 0, 0.7] },
      { pts: [[0.124, 1.264, 0.028], [0.146, 1.148, 0.036], [0.152, 1.030, 0.020]], r: 0.029, flat: 0.55, n: [1, 0, 0.3] },
      { pts: [[0.128, 1.256, 0.000], [0.150, 1.136, 0.000], [0.156, 1.014, -0.016]], r: 0.027, flat: 0.55, n: [1, 0, 0.1] }
    ],
    'serratus-anterior': [
      { pts: [[0.142, 1.352, 0.068], [0.158, 1.306, 0.080], [0.166, 1.262, 0.068]], r: 0.019, flat: 0.50, n: [0.6, 0, 0.8] },
      { pts: [[0.138, 1.302, 0.062], [0.154, 1.256, 0.074], [0.162, 1.214, 0.062]], r: 0.018, flat: 0.50, n: [0.6, 0, 0.8] },
      { pts: [[0.136, 1.252, 0.052], [0.150, 1.208, 0.062], [0.156, 1.168, 0.052]], r: 0.017, flat: 0.50, n: [0.6, 0, 0.8] }
    ],
    'gluteus-maximus': [
      { pts: [[0.060, 0.976, -0.092], [0.120, 0.930, -0.114], [0.170, 0.872, -0.090]], r: 0.058, flat: 0.62, n: [0, 0, -1] },
      { pts: [[0.052, 0.936, -0.086], [0.110, 0.892, -0.110], [0.152, 0.842, -0.086]], r: 0.052, flat: 0.60, n: [0, 0, -1] },
      { pts: [[0.090, 0.900, -0.100], [0.140, 0.858, -0.110], [0.176, 0.818, -0.078]], r: 0.043, flat: 0.60, n: [0, 0, -1] }
    ],
    'gluteus-medius': [
      { pts: [[0.112, 1.002, -0.026], [0.158, 0.960, -0.050], [0.194, 0.916, -0.038]], r: 0.038, flat: 0.60, n: [1, 0, 0] },
      { pts: [[0.126, 0.986, 0.004], [0.166, 0.948, -0.012], [0.196, 0.910, -0.008]], r: 0.028, flat: 0.60, n: [1, 0, 0] }
    ],
    'hip-flexors': [
      { pts: [[0.038, 1.048, 0.000], [0.070, 0.980, 0.036], [0.100, 0.918, 0.046]], r: 0.024, flat: 0.70, n: [0, 0, 1] },
      { pts: [[0.050, 1.020, 0.018], [0.078, 0.962, 0.050], [0.104, 0.912, 0.050]], r: 0.021, flat: 0.70, n: [0, 0, 1] }
    ],
    'quadriceps': [
      { pts: [[0.108, 0.906, 0.058], [0.114, 0.706, 0.076], [0.120, 0.536, 0.058]], r: 0.036, flat: 0.70, n: [0, 0, 1] },
      { pts: [[0.142, 0.930, 0.030], [0.162, 0.722, 0.048], [0.146, 0.534, 0.044]], r: 0.037, flat: 0.70, n: [0, 0, 1] },
      { pts: [[0.058, 0.812, 0.058], [0.074, 0.678, 0.078], [0.092, 0.548, 0.064]], r: 0.031, flat: 0.70, n: [0, 0, 1] },
      { pts: [[0.090, 0.900, 0.050], [0.100, 0.760, 0.072], [0.112, 0.606, 0.064]], r: 0.030, flat: 0.70, n: [0, 0, 1] }
    ],
    'hamstrings': [
      { pts: [[0.100, 0.900, -0.068], [0.115, 0.722, -0.082], [0.130, 0.542, -0.055]], r: 0.040, flat: 0.70, n: [0, 0, -1] },
      { pts: [[0.136, 0.904, -0.052], [0.150, 0.724, -0.066], [0.150, 0.540, -0.050]], r: 0.034, flat: 0.70, n: [0, 0, -1] },
      { pts: [[0.074, 0.892, -0.060], [0.088, 0.722, -0.072], [0.104, 0.548, -0.050]], r: 0.031, flat: 0.70, n: [0, 0, -1] }
    ],
    'adductors': [
      { pts: [[0.058, 0.902, 0.018], [0.074, 0.742, 0.032], [0.090, 0.568, 0.030]], r: 0.039, flat: 0.60, n: [-1, 0, 0.3] },
      { pts: [[0.048, 0.878, -0.002], [0.064, 0.726, 0.008], [0.084, 0.560, 0.012]], r: 0.032, flat: 0.60, n: [-1, 0, 0.2] }
    ],
    'sartorius': [
      { pts: [[0.134, 0.966, 0.044], [0.110, 0.768, 0.066], [0.078, 0.552, 0.064]], r: 0.019, flat: 0.70, n: [0, 0, 1] }
    ],
    'gastrocnemius': [
      { pts: [[0.104, 0.480, -0.046], [0.100, 0.330, -0.058], [0.114, 0.152, -0.030]], r: 0.038, flat: 0.70, n: [0, 0, -1] },
      { pts: [[0.140, 0.480, -0.040], [0.148, 0.330, -0.052], [0.130, 0.152, -0.030]], r: 0.034, flat: 0.70, n: [0, 0, -1] },
      { pts: [[0.118, 0.400, -0.034], [0.120, 0.296, -0.044], [0.122, 0.166, -0.026]], r: 0.032, flat: 0.70, n: [0, 0, -1] }
    ],
    'tibialis-anterior': [
      { pts: [[0.154, 0.458, 0.032], [0.150, 0.282, 0.046], [0.132, 0.122, 0.030]], r: 0.023, flat: 0.60, n: [1, 0, 0.4] }
    ],
    'sternocleidomastoid': [
      { pts: [[0.026, 1.508, 0.062], [0.044, 1.560, 0.052], [0.062, 1.614, 0.034]], r: 0.017, flat: 0.80, n: [0, 0, 1] }
    ]
  };

  /* ------------------------------------------------------------------ *
   * 三、几何构建工具
   * ------------------------------------------------------------------ */

  /* 沿中心线的变半径椭圆柱（肌腹） */
  function strandGeometry(THREE, spec, sign) {
    var pts = [];
    for (var k = 0; k < spec.pts.length; k++) {
      var q = spec.pts[k];
      pts.push(new THREE.Vector3(q[0] * sign, q[1], q[2]));
    }
    var curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    var tubular = spec.segs || 22;
    var radial = spec.radial || 16;
    var r = spec.r;
    var flat = (spec.flat == null) ? 0.8 : spec.flat;
    var nHint = new THREE.Vector3(
      (spec.n ? spec.n[0] * sign : 0),
      (spec.n ? spec.n[1] : 0),
      (spec.n ? spec.n[2] : 1)
    ).normalize();
    if (nHint.lengthSq() < 1e-8) nHint.set(0, 0, 1);

    var positions = [], uvs = [], colors = [], indices = [];
    var p = new THREE.Vector3();
    var U = new THREE.Vector3(), V = new THREE.Vector3(), T = new THREE.Vector3();
    var i, j, t, a, ca, sa, rr, stripe, tint;

    for (i = 0; i <= tubular; i++) {
      t = i / tubular;
      curve.getPointAt(t, p);
      curve.getTangentAt(t, T).normalize();
      U.crossVectors(nHint, T);
      if (U.lengthSq() < 1e-8) U.set(T.y, -T.x, 0);
      U.normalize();
      V.crossVectors(T, U).normalize();
      rr = r * (0.12 + 0.88 * Math.pow(Math.sin(Math.PI * t), 0.55));
      for (j = 0; j <= radial; j++) {
        a = (j / radial) * Math.PI * 2;
        ca = Math.cos(a);
        sa = Math.sin(a);
        positions.push(
          p.x + U.x * ca * rr + V.x * sa * rr * flat,
          p.y + U.y * ca * rr + V.y * sa * rr * flat,
          p.z + U.z * ca * rr + V.z * sa * rr * flat
        );
        uvs.push(j / radial, t);
        stripe = 0.84 + 0.16 * Math.sin(a * 7.0 + t * 24.0 + (spec.phase || 0));
        tint = spec.tint == null ? 1 : spec.tint;
        colors.push(stripe * tint, stripe * tint, stripe * tint);
      }
    }

    var cols = radial + 1;
    for (i = 0; i < tubular; i++) {
      for (j = 0; j < radial; j++) {
        var a0 = i * cols + j, b0 = (i + 1) * cols + j, c0 = (i + 1) * cols + j + 1, d0 = i * cols + j + 1;
        indices.push(a0, d0, c0, a0, c0, b0);
      }
    }
    /* 两端封口（小圆面） */
    var p0 = curve.getPointAt(0), p1 = curve.getPointAt(1);
    var cap0 = positions.length / 3;
    positions.push(p0.x, p0.y, p0.z);
    uvs.push(0.5, 0);
    colors.push(0.9, 0.9, 0.9);
    var cap1 = positions.length / 3;
    positions.push(p1.x, p1.y, p1.z);
    uvs.push(0.5, 1);
    colors.push(0.9, 0.9, 0.9);
    for (j = 0; j < radial; j++) {
      indices.push(cap0, (j + 1) % cols, j);
      indices.push(cap1, tubular * cols + j, tubular * cols + (j + 1) % cols);
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  /* 椭球（可拉伸），带轻微条纹顶点色 */
  function ellipsoidGeometry(THREE, sc, pos, sign) {
    var geo = new THREE.SphereGeometry(1, 24, 16);
    var arr = geo.attributes.position.array;
    var col = [];
    for (var i = 0; i < arr.length; i += 3) {
      var y = arr[i + 1];
      var stripe = 0.92 + 0.08 * Math.sin(arr[i] * 9.0 + arr[i + 2] * 7.0 + y * 5.0);
      col.push(stripe, stripe, stripe);
      arr[i] = arr[i] * sc[0];
      arr[i + 1] = arr[i + 1] * sc[1];
      arr[i + 2] = arr[i + 2] * sc[2];
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.translate(pos[0] * sign, pos[1], pos[2]);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  /* 竖直旋转体（用于躯干剪影 / 圆柱件） */
  function latheGeometry(THREE, profile, seg) {
    var geo = new THREE.LatheGeometry(profile, seg || 32);
    geo.computeVertexNormals();
    return geo;
  }

  /* 躯干：按高度分段的超椭圆截面，从髋部到肩部 */
  function torsoGeometry(THREE) {
    var rings = [
      { y: 0.820, rx: 0.140, rz: 0.090, cz: -0.004, e: 0.86, fb: 1.00, bb: 0.96 },
      { y: 0.880, rx: 0.152, rz: 0.092, cz: -0.006, e: 0.84, fb: 1.00, bb: 0.96 },
      { y: 0.940, rx: 0.158, rz: 0.096, cz: -0.008, e: 0.84, fb: 1.00, bb: 0.95 },
      { y: 1.000, rx: 0.148, rz: 0.090, cz: -0.008, e: 0.82, fb: 1.00, bb: 0.94 },
      { y: 1.060, rx: 0.133, rz: 0.085, cz: -0.006, e: 0.82, fb: 1.00, bb: 0.94 },
      { y: 1.120, rx: 0.138, rz: 0.088, cz: -0.004, e: 0.82, fb: 1.00, bb: 0.94 },
      { y: 1.180, rx: 0.150, rz: 0.093, cz: -0.002, e: 0.82, fb: 1.00, bb: 0.93 },
      { y: 1.240, rx: 0.170, rz: 0.100, cz: 0.000, e: 0.82, fb: 1.00, bb: 0.93 },
      { y: 1.300, rx: 0.190, rz: 0.106, cz: 0.002, e: 0.82, fb: 1.00, bb: 0.92 },
      { y: 1.360, rx: 0.200, rz: 0.104, cz: 0.002, e: 0.82, fb: 1.00, bb: 0.92 },
      { y: 1.420, rx: 0.204, rz: 0.096, cz: 0.000, e: 0.82, fb: 1.00, bb: 0.92 },
      { y: 1.465, rx: 0.186, rz: 0.086, cz: -0.002, e: 0.84, fb: 1.00, bb: 0.92 },
      { y: 1.498, rx: 0.136, rz: 0.072, cz: -0.002, e: 0.86, fb: 1.00, bb: 0.94 },
      { y: 1.512, rx: 0.100, rz: 0.062, cz: -0.002, e: 0.86, fb: 1.00, bb: 0.94 }
    ];
    var seg = 44;
    var positions = [], uvs = [], colors = [], indices = [];
    var i, j, ring, a, x, z, ca, sa, front;
    for (i = 0; i < rings.length; i++) {
      ring = rings[i];
      for (j = 0; j <= seg; j++) {
        a = (j / seg) * Math.PI * 2;
        ca = Math.cos(a);
        sa = Math.sin(a);
        var sx = ca >= 0 ? 1 : -1;
        var sz = sa >= 0 ? 1 : -1;
        front = sa >= 0 ? ring.fb : ring.bb;
        x = ring.rx * Math.pow(Math.abs(ca), ring.e) * sx;
        z = ring.rz * Math.pow(Math.abs(sa), ring.e) * sz * front + ring.cz;
        positions.push(x, ring.y, z);
        uvs.push(j / seg, i / (rings.length - 1));
        var stripe = 0.90 + 0.10 * Math.sin(a * 6.0 + ring.y * 18.0);
        colors.push(stripe, stripe, stripe);
      }
    }
    var cols = seg + 1;
    for (i = 0; i < rings.length - 1; i++) {
      for (j = 0; j < seg; j++) {
        var a0 = i * cols + j, b0 = (i + 1) * cols + j, c0 = (i + 1) * cols + j + 1, d0 = i * cols + j + 1;
        indices.push(a0, c0, d0, a0, b0, c0);
      }
    }
    /* 上下封口 */
    var bottom = positions.length / 3;
    positions.push(0, rings[0].y, rings[0].cz);
    uvs.push(0.5, 0);
    colors.push(0.9, 0.9, 0.9);
    var top = positions.length / 3;
    positions.push(0, rings[rings.length - 1].y, rings[rings.length - 1].cz);
    uvs.push(0.5, 1);
    colors.push(0.9, 0.9, 0.9);
    for (j = 0; j < seg; j++) {
      indices.push(bottom, j, j + 1);
      var base = (rings.length - 1) * cols;
      indices.push(top, base + j + 1, base + j);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  /* 简单的两端渐细管（四肢基础体块） */
  function limbGeometry(THREE, a, b, ra, rb, opts) {
    opts = opts || {};
    var p0 = new THREE.Vector3(a[0], a[1], a[2]);
    var p1 = new THREE.Vector3(b[0], b[1], b[2]);
    var curve = new THREE.CatmullRomCurve3([p0, p1], false, 'catmullrom', 0.5);
    var tubular = opts.segs || 16;
    var radial = opts.radial || 18;
    var flat = opts.flat == null ? 1 : opts.flat;
    var nHint = new THREE.Vector3(opts.n ? opts.n[0] : 0, opts.n ? opts.n[1] : 0, opts.n ? opts.n[2] : 1).normalize();
    var positions = [], uvs = [], colors = [], indices = [];
    var p = new THREE.Vector3(), T = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3();
    var i, j, t, aA, ca, sa, rr;
    for (i = 0; i <= tubular; i++) {
      t = i / tubular;
      curve.getPointAt(t, p);
      curve.getTangentAt(t, T).normalize();
      U.crossVectors(nHint, T);
      if (U.lengthSq() < 1e-8) U.set(1, 0, 0);
      U.normalize();
      V.crossVectors(T, U).normalize();
      rr = ra + (rb - ra) * t;
      for (j = 0; j <= radial; j++) {
        aA = (j / radial) * Math.PI * 2;
        ca = Math.cos(aA);
        sa = Math.sin(aA);
        positions.push(p.x + U.x * ca * rr + V.x * sa * rr * flat, p.y + U.y * ca * rr + V.y * sa * rr * flat, p.z + U.z * ca * rr + V.z * sa * rr * flat);
        uvs.push(j / radial, t);
        var stripe = 0.93 + 0.07 * Math.sin(aA * 5.0 + t * 16.0);
        colors.push(stripe, stripe, stripe);
      }
    }
    var cols = radial + 1;
    for (i = 0; i < tubular; i++) {
      for (j = 0; j < radial; j++) {
        var a0 = i * cols + j, b0 = (i + 1) * cols + j, c0 = (i + 1) * cols + j + 1, d0 = i * cols + j + 1;
        indices.push(a0, d0, c0, a0, c0, b0);
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  /* ------------------------------------------------------------------ *
   * 四、主构建函数
   * ------------------------------------------------------------------ */
  function build(THREE, opts) {
    opts = opts || {};
    var NS = A || {};
    var muscleById = NS.muscleById || {};
    var root = new THREE.Group();
    root.name = 'MuscleAtlasBody';

    var stats = { meshes: 0, triangles: 0 };
    var muscleMeshes = {};   /* id -> [Mesh] */
    var muscleMaterials = {};/* id -> Material */
    var allInteractive = [];

    /* --- 材质 --- */
    var matTissue = new THREE.MeshStandardMaterial({
      color: 0x6e3427, roughness: 0.9, metalness: 0.02, vertexColors: true
    });
    var matBone = new THREE.MeshStandardMaterial({
      color: 0xb7a27c, roughness: 0.76, metalness: 0.04, vertexColors: false
    });
    var matSkin = new THREE.MeshStandardMaterial({
      color: 0xa47b5f, roughness: 0.72, metalness: 0.02, vertexColors: true
    });
    var matCavity = new THREE.MeshStandardMaterial({ color: 0x160f0d, roughness: 0.9, metalness: 0.0 });
    var matPedestal = new THREE.MeshStandardMaterial({ color: 0x161b23, roughness: 0.72, metalness: 0.32 });
    var matPedestalTop = new THREE.MeshStandardMaterial({ color: 0x1e2630, roughness: 0.55, metalness: 0.42 });
    var matRing = new THREE.MeshStandardMaterial({ color: 0x8a6b3e, roughness: 0.35, metalness: 0.75 });

    /* 原生 SphereGeometry / CylinderGeometry 没有顶点色；材质若开启 vertexColors，
       缺色在 WebGL 里会乘成纯黑（手、足、肩球、髋球曾因此发黑）。这里补一层
       轻微起伏的白色顶点色，只作为材质颜色的乘数。 */
    function ensureVertexColors(geo) {
      if (!geo || !geo.attributes || geo.attributes.color) return geo;
      var position = geo.attributes.position;
      var count = position ? position.count : 0;
      var colors = new Float32Array(count * 3);
      for (var i = 0; i < count; i++) {
        var tone = 0.88 + 0.12 * Math.sin(i * 1.7 + 1.1);
        colors[i * 3] = tone;
        colors[i * 3 + 1] = tone;
        colors[i * 3 + 2] = tone;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geo;
    }

    function addMesh(geo, mat, parent, castShadow) {
      if (mat && mat.vertexColors) ensureVertexColors(geo);
      var mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = castShadow !== false;
      mesh.receiveShadow = true;
      parent.add(mesh);
      if (geo.index) stats.triangles += geo.index.count / 3;
      else if (geo.attributes && geo.attributes.position) stats.triangles += geo.attributes.position.count / 3;
      stats.meshes++;
      return mesh;
    }

    function muscleMaterial(id) {
      if (muscleMaterials[id]) return muscleMaterials[id];
      var data = muscleById[id];
      var base = new THREE.Color(data && data.color ? data.color : '#b94232');
      var mat = new THREE.MeshStandardMaterial({
        color: base.clone(),
        roughness: 0.62,
        metalness: 0.02,
        vertexColors: true,
        emissive: base.clone().multiplyScalar(0.055),
        emissiveIntensity: 1.0
      });
      muscleMaterials[id] = mat;
      return mat;
    }

    /* --- 1. 底座 --- */
    var pedestal = new THREE.Group();
    pedestal.name = 'pedestal';
    var cyl = new THREE.CylinderGeometry(0.62, 0.66, 0.055, 64);
    var pmesh = addMesh(cyl, matPedestal, pedestal, false);
    pmesh.position.y = -0.0275;
    pmesh.receiveShadow = true;
    var top = new THREE.CylinderGeometry(0.60, 0.60, 0.012, 64);
    var tmesh = addMesh(top, matPedestalTop, pedestal, false);
    tmesh.position.y = 0.002;
    tmesh.receiveShadow = true;
    var ring = new THREE.TorusGeometry(0.615, 0.006, 10, 96);
    var rmesh = addMesh(ring, matRing, pedestal, false);
    rmesh.rotation.x = Math.PI / 2;
    rmesh.position.y = 0.006;
    root.add(pedestal);

    /* --- 2. 深层组织（躯干 + 四肢基础体块） --- */
    var flesh = new THREE.Group();
    flesh.name = 'flesh';
    var torso = addMesh(torsoGeometry(THREE), matTissue, flesh);
    torso.position.y = 0;

    /* 胸廓前壁（浅层组织垫，避免肌肉之间透出黑洞） */
    var costal = new THREE.SphereGeometry(1, 28, 18);
    costal.scale(0.142, 0.108, 0.046);
    costal.translate(0, 1.322, 0.070);
    costal.computeVertexNormals();
    addMesh(costal, matTissue, flesh);

    /* 颈部 */
    addMesh(limbGeometry(THREE, [0, 1.468, -0.004], [0, 1.596, 0.012], 0.055, 0.048, { flat: 0.9, n: [0, 1, 0] }), matTissue, flesh);

    /* 肩部基础 */
    [1, -1].forEach(function (sgn) {
      var sh = new THREE.SphereGeometry(1, 22, 16);
      sh.scale(0.056, 0.052, 0.052);
      sh.translate(P.shoulder[0] * sgn, P.shoulder[1], P.shoulder[2]);
      sh.computeVertexNormals();
      addMesh(sh, matTissue, flesh);

      /* 上臂 */
      addMesh(limbGeometry(THREE,
        [P.shoulder[0] * sgn, P.shoulder[1], P.shoulder[2]],
        [P.elbow[0] * sgn, P.elbow[1], P.elbow[2]], 0.052, 0.043, { flat: 0.95, n: [0, 0, 1] }), matTissue, flesh);
      /* 前臂 */
      addMesh(limbGeometry(THREE,
        [P.elbow[0] * sgn, P.elbow[1], P.elbow[2]],
        [P.wrist[0] * sgn, P.wrist[1], P.wrist[2]], 0.044, 0.026, { flat: 0.9, n: [0, 0, 1] }), matTissue, flesh);

      /* 肘 / 膝 关节过渡球（消除管段接缝） */
      var elbowJ = new THREE.SphereGeometry(1, 18, 14);
      elbowJ.scale(0.042, 0.044, 0.040);
      elbowJ.translate(P.elbow[0] * sgn, P.elbow[1], P.elbow[2]);
      elbowJ.computeVertexNormals();
      addMesh(elbowJ, matTissue, flesh);

      /* 髋部/臀深层 */
      var hipG = new THREE.SphereGeometry(1, 20, 14);
      hipG.scale(0.085, 0.095, 0.088);
      hipG.translate(P.hip[0] * sgn, P.hip[1] - 0.01, -0.012);
      hipG.computeVertexNormals();
      addMesh(hipG, matTissue, flesh);

      /* 大腿 */
      addMesh(limbGeometry(THREE,
        [P.hip[0] * sgn, P.hip[1] - 0.005, P.hip[2]],
        [P.knee[0] * sgn, P.knee[1], P.knee[2]], 0.079, 0.056, { flat: 0.92, n: [0, 0, 1] }), matTissue, flesh);
      /* 小腿 */
      addMesh(limbGeometry(THREE,
        [P.knee[0] * sgn, P.knee[1], P.knee[2]],
        [P.ankle[0] * sgn, P.ankle[1], P.ankle[2]], 0.058, 0.030, { flat: 0.9, n: [0, 0, 1] }), matTissue, flesh);
    });
    root.add(flesh);

    /* --- 3. 骨骼/软骨点缀 --- */
    var bones = new THREE.Group();
    bones.name = 'bones';
    /* 胸骨 */
    var sternum = new THREE.SphereGeometry(1, 18, 14);
    sternum.scale(0.020, 0.092, 0.011);
    sternum.translate(0, 1.336, 0.121);
    sternum.computeVertexNormals();
    addMesh(sternum, matBone, bones);
    /* 锁骨 */
    [1, -1].forEach(function (sgn) {
      addMesh(limbGeometry(THREE,
        [0.016 * sgn, 1.494, 0.076],
        [0.100 * sgn, 1.488, 0.086],
        0.0080, 0.0064, { segs: 8, radial: 10, n: [0, 1, 0.2] }), matBone, bones);
      addMesh(limbGeometry(THREE,
        [0.100 * sgn, 1.488, 0.086],
        [0.196 * sgn, 1.460, 0.038],
        0.0068, 0.0090, { segs: 8, radial: 10, n: [0, 1, 0.2] }), matBone, bones);
      /* 髌骨 */
      var pt = new THREE.SphereGeometry(1, 18, 14);
      pt.scale(0.024, 0.028, 0.013);
      pt.translate(P.knee[0] * sgn, P.knee[1] + 0.006, 0.076);
      pt.computeVertexNormals();
      addMesh(pt, matBone, bones);
    });
    /* 脊柱椎体（在竖脊肌之间隐约可见） */
    for (var vy = 0.958; vy < 1.47; vy += 0.047) {
      var vb = new THREE.SphereGeometry(1, 12, 10);
      vb.scale(0.014, 0.010, 0.014);
      vb.translate(0, vy, -0.106);
      vb.computeVertexNormals();
      addMesh(vb, matBone, bones);
    }
    root.add(bones);

    /* --- 4. 头 / 手 / 足（骨色） --- */
    var extremities = new THREE.Group();
    extremities.name = 'extremities';
    /* 颅骨 */
    var skull = new THREE.SphereGeometry(1, 28, 20);
    skull.scale(0.078, 0.100, 0.090);
    skull.translate(0, 1.674, 0.006);
    skull.computeVertexNormals();
    addMesh(skull, matBone, extremities);
    /* 面颅 / 下颌 */
    var jaw = new THREE.SphereGeometry(1, 22, 16);
    jaw.scale(0.056, 0.050, 0.064);
    jaw.translate(0, 1.606, 0.028);
    jaw.computeVertexNormals();
    addMesh(jaw, matBone, extremities);
    /* 眉弓 */
    var brow = new THREE.SphereGeometry(1, 16, 12);
    brow.scale(0.050, 0.012, 0.022);
    brow.translate(0, 1.702, 0.078);
    brow.computeVertexNormals();
    addMesh(brow, matBone, extremities);
    /* 颧骨 / 耳廓 */
    [1, -1].forEach(function (sgn) {
      var cheek = new THREE.SphereGeometry(1, 14, 12);
      cheek.scale(0.020, 0.014, 0.022);
      cheek.translate(0.048 * sgn, 1.660, 0.050);
      cheek.computeVertexNormals();
      addMesh(cheek, matBone, extremities);
      var ear = new THREE.SphereGeometry(1, 12, 10);
      ear.scale(0.009, 0.024, 0.015);
      ear.translate(0.077 * sgn, 1.662, 0.002);
      ear.computeVertexNormals();
      addMesh(ear, matBone, extremities);
    });
    /* 眼窝、鼻腔、口缝（深色腔隙） */
    [1, -1].forEach(function (sgn) {
      var eye = new THREE.SphereGeometry(1, 14, 12);
      eye.scale(0.016, 0.013, 0.010);
      eye.translate(0.030 * sgn, 1.681, 0.088);
      eye.computeVertexNormals();
      addMesh(eye, matCavity, extremities);
    });
    var nose = new THREE.SphereGeometry(1, 12, 10);
    nose.scale(0.007, 0.016, 0.009);
    nose.translate(0, 1.662, 0.086);
    nose.computeVertexNormals();
    addMesh(nose, matCavity, extremities);
    var mouth = new THREE.SphereGeometry(1, 14, 8);
    mouth.scale(0.026, 0.005, 0.008);
    mouth.translate(0, 1.624, 0.080);
    mouth.computeVertexNormals();
    addMesh(mouth, matCavity, extremities);

    [1, -1].forEach(function (sgn) {
      /* ---- 手：腕-掌-四指-拇指（皮肤色，与 forearm 相接） ---- */
      var hand = new THREE.Group();
      hand.name = 'hand-' + (sgn > 0 ? 'right' : 'left');
      hand.position.set(P.wrist[0] * sgn, P.wrist[1], P.wrist[2]);
      extremities.add(hand);

      var wristJ = new THREE.SphereGeometry(1, 16, 12);
      wristJ.scale(0.026, 0.034, 0.023);
      wristJ.translate(0, -0.012, 0.000);
      wristJ.computeVertexNormals();
      addMesh(wristJ, matSkin, hand);

      var palm = new THREE.SphereGeometry(1, 20, 16);
      palm.scale(0.019, 0.050, 0.048);
      palm.translate(-0.002 * sgn, -0.050, 0.002);
      palm.computeVertexNormals();
      addMesh(palm, matSkin, hand);

      /* 指根隆起：让手指与手掌连成整体 */
      var knuckle = new THREE.SphereGeometry(1, 16, 12);
      knuckle.scale(0.017, 0.024, 0.044);
      knuckle.translate(-0.004 * sgn, -0.086, 0.002);
      knuckle.computeVertexNormals();
      addMesh(knuckle, matSkin, hand);

      /* 四指：连续一根，向掌侧微屈（食指在前） */
      var fingerZ = [-0.028, -0.0095, 0.0095, 0.028];
      var fingerL = [0.082, 0.090, 0.086, 0.070];
      for (var f = 0; f < 4; f++) {
        var finger = new THREE.SphereGeometry(1, 12, 10);
        finger.scale(0.0082, fingerL[f] * 0.5, 0.0100);
        finger.rotateZ(-0.16 * sgn);
        finger.translate(-0.006 * sgn, -0.085 - fingerL[f] * 0.5, fingerZ[f]);
        finger.computeVertexNormals();
        addMesh(finger, matSkin, hand);
      }
      /* 拇指：两节，斜向前下方 */
      var thumbA = new THREE.SphereGeometry(1, 12, 10);
      thumbA.scale(0.012, 0.020, 0.014);
      thumbA.rotateX(-0.72);
      thumbA.translate(-0.004 * sgn, -0.056, 0.045);
      thumbA.computeVertexNormals();
      addMesh(thumbA, matSkin, hand);

      var thumbB = new THREE.SphereGeometry(1, 10, 8);
      thumbB.scale(0.0095, 0.016, 0.011);
      thumbB.rotateX(-0.72);
      thumbB.translate(-0.010 * sgn, -0.082, 0.060);
      thumbB.computeVertexNormals();
      addMesh(thumbB, matSkin, hand);

      /* ---- 足：踝-跟-足弓-前掌-五趾（皮肤色） ---- */
      var foot = new THREE.Group();
      foot.name = 'foot-' + (sgn > 0 ? 'right' : 'left');
      foot.position.set(P.ankle[0] * sgn, P.ankle[1], P.ankle[2]);
      foot.rotation.y = 0.10 * sgn;
      extremities.add(foot);

      var ankleJ = new THREE.SphereGeometry(1, 16, 12);
      ankleJ.scale(0.034, 0.040, 0.034);
      ankleJ.translate(0, 0.002, -0.004);
      ankleJ.computeVertexNormals();
      addMesh(ankleJ, matSkin, foot);

      var heel = new THREE.SphereGeometry(1, 18, 14);
      heel.scale(0.038, 0.042, 0.044);
      heel.translate(0, -0.045, -0.030);
      heel.computeVertexNormals();
      addMesh(heel, matSkin, foot);

      var midfoot = new THREE.SphereGeometry(1, 18, 14);
      midfoot.scale(0.042, 0.030, 0.058);
      midfoot.translate(0, -0.060, 0.020);
      midfoot.computeVertexNormals();
      addMesh(midfoot, matSkin, foot);

      var forefoot = new THREE.SphereGeometry(1, 18, 14);
      forefoot.scale(0.048, 0.022, 0.050);
      forefoot.translate(0, -0.072, 0.090);
      forefoot.computeVertexNormals();
      addMesh(forefoot, matSkin, foot);

      /* 趾根垫 + 五趾（嵌在一起，避免碎片感） */
      var toeRamp = new THREE.SphereGeometry(1, 16, 12);
      toeRamp.scale(0.045, 0.017, 0.038);
      toeRamp.translate(0, -0.074, 0.106);
      toeRamp.computeVertexNormals();
      addMesh(toeRamp, matSkin, foot);

      for (var toe = 0; toe < 5; toe++) {
        var tgeo = new THREE.SphereGeometry(1, 10, 8);
        var toff = [-0.030, -0.015, 0.001, 0.016, 0.029][toe];
        var tr = [0.013, 0.011, 0.010, 0.009, 0.0078][toe];
        tgeo.scale(tr, 0.014, [0.030, 0.026, 0.023, 0.020, 0.017][toe]);
        tgeo.translate(toff * sgn, -0.076, 0.130 + toe * 0.006);
        tgeo.computeVertexNormals();
        addMesh(tgeo, matSkin, foot);
      }
    });
    root.add(extremities);

    /* --- 5. 肌肉层 --- */
    var muscleGroup = new THREE.Group();
    muscleGroup.name = 'muscles';
    root.add(muscleGroup);

    var totalStrands = 0;
    Object.keys(DEFS).forEach(function (id) {
      var data = muscleById[id];
      var mat = muscleMaterial(id);
      var idGroup = new THREE.Group();
      idGroup.name = 'muscle-' + id;
      muscleGroup.add(idGroup);
      muscleMeshes[id] = [];

      [1, -1].forEach(function (sign) {
        var side = sign > 0 ? 'right' : 'left';
        DEFS[id].forEach(function (spec, idx) {
          var geo;
          if (spec.e) {
            geo = ellipsoidGeometry(THREE, spec.sc, spec.e, sign);
          } else {
            geo = strandGeometry(THREE, spec, sign);
          }
          var mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.muscleId = id;
          mesh.userData.side = side;
          mesh.userData.muscleName = data ? data.name : id;
          mesh.userData.muscleNameEn = data ? data.nameEn : '';
          mesh.name = 'muscle-' + id + '-' + side + '-' + idx;
          idGroup.add(mesh);
          muscleMeshes[id].push(mesh);
          allInteractive.push(mesh);
          stats.meshes++;
          if (geo.index) stats.triangles += geo.index.count / 3;
          totalStrands++;
        });
      });
    });

    var bounds = new THREE.Box3().setFromObject(root);
    var size = new THREE.Vector3();
    bounds.getSize(size);

    return {
      root: root,
      muscleMeshes: muscleMeshes,
      muscleMaterials: muscleMaterials,
      interactive: allInteractive,
      bounds: bounds,
      size: size,
      stats: { meshes: stats.meshes, triangles: Math.round(stats.triangles), strands: totalStrands },
      defs: DEFS
    };
  }

  A.body = {
    build: build,
    DEFS: DEFS,
    POINTS: P
  };
})(typeof window !== 'undefined' ? window : this);
