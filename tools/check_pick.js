/* 开发诊断脚本：在 Node 里复现 engine.js 的射线拾取，排查「点击模型没反应」。
 * 用法：node tools/check_pick.js
 */
'use strict';

var path = require('path');
global.window = global;
var ROOT = path.resolve(__dirname, '..');
var THREE = require(path.join(ROOT, 'vendor', 'three.min.js'));
global.THREE = THREE;

require(path.join(ROOT, 'src', 'data', 'muscles.js'));
require(path.join(ROOT, 'src', 'data', 'exercises.js'));
require(path.join(ROOT, 'src', 'js', 'body.js'));

var A = window.MUSCLE_ATLAS;
var built = A.body.build(THREE);
built.root.updateMatrixWorld(true);

console.log('interactive=' + (built.interactive || []).length + ' muscleMeshes=' + Object.keys(built.muscleMeshes).length);
console.log('bounds min=' + built.bounds.min.toArray().map(function (v) { return v.toFixed(3); }).join(',') +
  ' max=' + built.bounds.max.toArray().map(function (v) { return v.toFixed(3); }).join(','));

var aspect = 1258 / 728;
var camera = new THREE.PerspectiveCamera(30, aspect, 0.05, 60);
camera.position.set(0, 1.26, 3.8);
camera.lookAt(new THREE.Vector3(0, 0.92, 0));
camera.updateMatrixWorld(true);
camera.updateProjectionMatrix();

var first = built.interactive[0];
first.updateMatrixWorld(true);
first.geometry.computeBoundingSphere();
console.log('first=' + first.name + ' pos=' + first.position.toArray().join(',') +
  ' scale=' + first.scale.toArray().join(',') +
  ' bs=' + (first.geometry.boundingSphere ? first.geometry.boundingSphere.radius.toFixed(3) : 'none') +
  ' worldPos=' + new THREE.Vector3().setFromMatrixPosition(first.matrixWorld).toArray().map(function (v) { return v.toFixed(3); }).join(','));

var rc = new THREE.Raycaster();
[[0, 0], [0, 0.2], [0, -0.2], [0.2, 0.1]].forEach(function (pair) {
  rc.setFromCamera(new THREE.Vector2(pair[0], pair[1]), camera);
  var hits = rc.intersectObjects(built.interactive, false);
  console.log('ndc(' + pair[0] + ',' + pair[1] + ') hits=' + hits.length +
    (hits.length ? ' first=' + hits[0].object.name + ' d=' + hits[0].distance.toFixed(2) : '') +
    ' rayO=' + rc.ray.origin.toArray().map(function (v) { return v.toFixed(2); }).join(',') +
    ' rayD=' + rc.ray.direction.toArray().map(function (v) { return v.toFixed(2); }).join(','));
});

/* 几何与包围盒检查 */
first.geometry.computeBoundingBox();
var bb = first.geometry.boundingBox;
var bs = first.geometry.boundingSphere;
console.log('first bs center=' + bs.center.toArray().map(function (v) { return v.toFixed(3); }).join(',') + ' r=' + bs.radius.toFixed(3));
console.log('first bbox min=' + bb.min.toArray().map(function (v) { return v.toFixed(3); }).join(',') +
  ' max=' + bb.max.toArray().map(function (v) { return v.toFixed(3); }).join(','));
console.log('first matrixWorld=' + first.matrixWorld.elements.map(function (v) { return +v.toFixed(2); }).join(','));

/* 对照组：简单球体证明 Raycaster 本身可用 */
var sphere = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial());
sphere.position.set(0, 1.0, 0);
sphere.updateMatrixWorld(true);
var rc2 = new THREE.Raycaster(new THREE.Vector3(0, 1.0, 3), new THREE.Vector3(0, 0, -1), 0.01, 50);
console.log('control-sphere hits=' + rc2.intersectObject(sphere, false).length);

/* 瞄准第一块肌肉包围球中心 */
var aim = new THREE.Raycaster(camera.position.clone(),
  bs.center.clone().sub(camera.position).normalize(), 0.01, 50);
console.log('aim-bs hits=' + aim.intersectObject(first, false).length +
  ' all=' + aim.intersectObjects(built.interactive, false).length);


/* 直接测试根节点包围盒中心点是否在视锥前方 */
var center = built.bounds.getCenter(new THREE.Vector3());
var toCenter = center.clone().sub(camera.position);
console.log('toCenter=' + toCenter.toArray().map(function (v) { return v.toFixed(2); }).join(',') +
  ' dot(forward)=' + toCenter.normalize().dot(camera.getWorldDirection(new THREE.Vector3())).toFixed(3));
