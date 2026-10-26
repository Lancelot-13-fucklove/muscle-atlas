/* 开发工具（不随页面加载）：把 body.js 构建的人体导出为 JSON，供 Python 软件渲染预览。
 * 用法：node tools/export_geometry.js [输出路径]
 * 依赖：只用本地 vendor/three.min.js（r140 UMD）+ 本地数据，无需 npm 安装。
 */
'use strict';

var fs = require('fs');
var path = require('path');

global.window = global;
var ROOT = path.resolve(__dirname, '..');
var THREE = require(path.join(ROOT, 'vendor', 'three.min.js'));
global.THREE = THREE;

require(path.join(ROOT, 'src', 'data', 'muscles.js'));
require(path.join(ROOT, 'src', 'data', 'exercises.js'));
require(path.join(ROOT, 'src', 'js', 'body.js'));

var A = global.window.MUSCLE_ATLAS;
var built = A.body.build(THREE);
built.root.updateMatrixWorld(true);

var meshes = [];
built.root.traverse(function (node) {
  if (node.isMesh && node.geometry && node.geometry.attributes.position) meshes.push(node);
});

function round(v, n) {
  var p = Math.pow(10, n);
  return Math.round(v * p) / p;
}

var out = {
  generator: 'muscle-atlas/tools/export_geometry.js',
  bounds: {
    min: [round(built.bounds.min.x, 3), round(built.bounds.min.y, 3), round(built.bounds.min.z, 3)],
    max: [round(built.bounds.max.x, 3), round(built.bounds.max.y, 3), round(built.bounds.max.z, 3)]
  },
  stats: built.stats,
  muscles: A.muscles.map(function (m) { return { id: m.id, name: m.name, color: m.color }; }),
  meshes: []
};

var triCount = 0;
meshes.forEach(function (mesh) {
  var geo = mesh.geometry;
  var pos = geo.attributes.position;
  var index = geo.index;
  var colAttr = geo.attributes.color;
  var mat = mesh.material;
  var base = mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [1, 1, 1];
  var mw = mesh.matrixWorld;

  /* 顶点颜色平均（保留肌纤维条纹导致的细微亮度差） */
  var vc = 1;
  if (colAttr && mat.vertexColors) {
    vc = 0;
    for (var c = 0; c < colAttr.array.length; c += 3) vc += (colAttr.array[c] + colAttr.array[c + 1] + colAttr.array[c + 2]) / 3;
    vc = vc / (colAttr.count || (colAttr.array.length / 3));
  }
  var color = [base[0] * vc, base[1] * vc, base[2] * vc];
  var color255 = [Math.round(color[0] * 255), Math.round(color[1] * 255), Math.round(color[2] * 255)];

  var count = index ? index.count : pos.count;
  var tris = new Array(count * 3);
  var v = new THREE.Vector3();
  var k = 0;
  for (var i = 0; i < count; i++) {
    var vi = index ? index.getX(i) : i;
    v.fromBufferAttribute(pos, vi).applyMatrix4(mw);
    tris[k++] = round(v.x, 5);
    tris[k++] = round(v.y, 5);
    tris[k++] = round(v.z, 5);
  }
  triCount += count / 3;
  out.meshes.push({
    name: mesh.name || '',
    muscleId: (mesh.userData && mesh.userData.muscleId) || null,
    side: (mesh.userData && mesh.userData.side) || null,
    color: color255,
    tris: tris
  });
});

out.triangleCount = Math.round(triCount);
var outPath = process.argv[2] || path.join(ROOT, 'shots', 'geometry.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
var json = JSON.stringify(out);
fs.writeFileSync(outPath, json, 'utf8');
console.log('EXPORT_OK meshes=' + out.meshes.length + ' triangles=' + out.triangleCount +
  ' bytes=' + json.length + ' -> ' + outPath);
