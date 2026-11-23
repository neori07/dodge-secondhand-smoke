// Headless smoke test for《躲避二手烟！》: stub browser APIs, boot, click-to-start, simulate play.
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const m = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
const js = m.map(x => x[1]).sort((a, b) => b.length - a.length)[0];

function makeCtx() {
  const store = { imageSmoothingEnabled: false };
  return new Proxy(store, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}
function makeEl(id) {
  return {
    id, width: 480, height: 360, textContent: '', disabled: false,
    style: {}, className: '', handlers: {},
    getContext: makeCtx, focus() {}, blur() {},
    setPointerCapture() {}, releasePointerCapture() {},
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 360 })
  };
}
const els = {};
const getEl = id => els[id] || (els[id] = makeEl(id));
const winHandlers = {};
let now = 0, rafCb = null;
global.window = global;
global.AudioContext = class { constructor() { this.currentTime = 0; this.destination = {}; } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { value: 0, setValueAtTime() {} } }; } createGain() { return { connect() {}, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } resume() { return { then() {} }; } };
global.document = {
  getElementById: getEl, addEventListener() {}, body: makeEl('body'),
  createElement: () => makeEl('off')
};
global.addEventListener = (ev, fn) => { (winHandlers[ev] = winHandlers[ev] || []).push(fn); };
global.requestAnimationFrame = cb => { rafCb = cb; };
global.performance = { now: () => now };

// probe: expose internal state without touching the shipped file
let js2 = js.replace(/(\}\)\(\);)\s*$/, (_, tail) =>
  'window.__DBG=()=>({player,camX,cyclists,enemies,state,S});' + tail);
if (js2 === js) { console.log('probe inject failed'); process.exit(1); }
try { new Function(js2)(); } catch (e) { console.log('BOOT FAIL:', e.message); process.exit(1); }

const assert = (cond, msg) => { if (!cond) { console.log('ASSERT FAIL:', msg, JSON.stringify(d())); process.exit(1); } };
const d = () => global.__DBG();
function frames(n, dt = 16.7) {
  for (let i = 0; i < n; i++) {
    now += dt;
    const cb = rafCb; rafCb = null;
    if (!cb) { console.log('rAF chain broke at frame', i); process.exit(1); }
    cb(now);
  }
}
const key = (type, k) => (winHandlers[type] || []).forEach(fn => fn({ key: k, code: k, preventDefault() {} }));

frames(30);                                   // start screen renders
assert(d().state === d().S.TITLE, 'starts on title screen');

// click anywhere starts the game
const canvas = els['game'];
(canvas.handlers.pointerdown || []).forEach(fn => fn({ clientX: 100, clientY: 100, pointerId: 1, preventDefault() {} }));
assert(d().state === d().S.PLAY, 'click anywhere starts game');
assert(d().enemies.length > 30, 'route/smoke-lane smokers still populate the map');
(canvas.handlers.pointerup || []).forEach(fn => fn({ pointerId: 1 }));

key('keydown', 'Shift'); frames(30); key('keyup', 'Shift'); // removed feature: must be inert
key('keydown', 'ArrowRight');
const x0 = d().player.x;
frames(150);
assert(d().player.x > x0 + 120, 'walks right when path is clear');
// scripted inputs cannot reliably steer around实体障碍，只做长跑稳定性检查
key('keydown', 'ArrowDown'); frames(40); key('keyup', 'ArrowDown');
frames(1200);
const s = d();
assert(s.state === s.S.PLAY || s.state === s.S.OVER, 'game remains in a valid state after 25s');
assert(s.player.lives >= 0 && s.player.lives <= 10, 'lives stay in [0,10]');
assert(Number.isFinite(s.player.x), 'player x stays finite');
key('keyup', 'ArrowRight');
key('keydown', ' '); key('keyup', ' ');       // fan
frames(60);
key('keydown', '1'); key('keyup', '1');       // buy mask
frames(30);
key('keydown', 'p'); key('keyup', 'p'); frames(10);
assert(d().state === d().S.PAUSE, 'pause works');
key('keydown', 'p'); key('keyup', 'p'); frames(300);
key('keydown', 'ArrowLeft');
const x1 = d().player.x;
frames(400);
assert(d().player.x < x1, 'can walk back left');
key('keyup', 'ArrowLeft');
frames(60);
console.log('SMOKE OK — money:', els['moneyLabel'] ? els['moneyLabel'].textContent : 'n/a', '| masks:', els['maskLabel'] ? els['maskLabel'].textContent : 'n/a');
