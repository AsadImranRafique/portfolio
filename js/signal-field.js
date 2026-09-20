(function () {
  var canvas = document.getElementById("signal-field");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var RADIUS = 180;
  var W = 0;
  var H = 0;
  var dpr = 1;
  var cell = 28;
  var traces = [];
  var pulses = [];
  var raf = 0;
  var last = 0;
  var ambientAcc = 0;
  var resizeTimer = 0;
  var pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, influence: 0, target: 0, seen: false };

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  function ri(a, b) {
    return Math.floor(rnd(a, b + 1));
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function accent() {
    var a = window.Accent;
    return a && a.rgb ? a.rgb : [139, 156, 255];
  }

  function smooth(p) {
    return p * p * (3 - 2 * p);
  }

  function makeTrace(cols, rows, occ, offX, offY) {
    var dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    var stride = cols + 1;
    var cx = ri(1, cols - 1);
    var cy = ri(1, rows - 1);
    if (occ[cy * stride + cx]) return null;
    var d = dirs[ri(0, 3)];
    var pts = [[cx, cy, 0]];
    occ[cy * stride + cx] = 1;
    var segs = ri(3, 7);
    var stopped = false;

    function step(dx, dy) {
      var nx = cx + dx;
      var ny = cy + dy;
      if (nx < 1 || ny < 1 || nx >= cols || ny >= rows || occ[ny * stride + nx]) return false;
      cx = nx;
      cy = ny;
      occ[cy * stride + cx] = 1;
      return true;
    }

    for (var s = 0; s < segs && !stopped; s++) {
      var run = ri(3, 12);
      for (var i = 0; i < run; i++) {
        if (!step(d[0], d[1])) {
          stopped = true;
          break;
        }
      }
      pts.push([cx, cy, s < segs - 1 && !stopped ? 1 : 0]);
      if (stopped || s === segs - 1) break;
      var turn = Math.random() < 0.5 ? 1 : -1;
      var d2 = [-d[1] * turn, d[0] * turn];
      var k = ri(1, 3);
      for (var j = 0; j < k; j++) {
        if (!step(d[0] + d2[0], d[1] + d2[1])) {
          stopped = true;
          break;
        }
      }
      pts.push([cx, cy, 1]);
      d = d2;
    }
    if (pts.length < 3) return null;

    var px = pts.map(function (p) {
      return { x: offX + p[0] * cell, y: offY + p[1] * cell, via: p[2] === 1 };
    });
    var segsOut = [];
    var total = 0;
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    for (var n = 0; n < px.length; n++) {
      minX = Math.min(minX, px[n].x);
      minY = Math.min(minY, px[n].y);
      maxX = Math.max(maxX, px[n].x);
      maxY = Math.max(maxY, px[n].y);
      if (n > 0) {
        var a = px[n - 1];
        var b = px[n];
        var len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len === 0) continue;
        segsOut.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, len: len, start: total });
        total += len;
      }
    }
    if (!segsOut.length) return null;
    return {
      pts: px,
      segs: segsOut,
      length: total,
      alpha: rnd(0.06, 0.1),
      padStyle: Math.random() < 0.5 ? 0 : 1,
      box: { x1: minX - RADIUS, y1: minY - RADIUS, x2: maxX + RADIUS, y2: maxY + RADIUS }
    };
  }

  function build() {
    var mobile = W < 900;
    cell = mobile ? 32 : 28;
    var cols = Math.floor(W / cell);
    var rows = Math.floor(H / cell);
    var offX = (W - cols * cell) / 2;
    var offY = (H - rows * cell) / 2;
    var target = Math.round((W * H) / (mobile ? 56000 : 24000));
    target = clamp(target, mobile ? 8 : 26, mobile ? 30 : 72);
    var occ = new Uint8Array((cols + 1) * (rows + 1));
    traces = [];
    pulses = [];
    var tries = 0;
    while (traces.length < target && tries < target * 10) {
      tries++;
      var t = makeTrace(cols, rows, occ, offX, offY);
      if (t) traces.push(t);
    }
  }

  function pointAt(tr, s) {
    var segs = tr.segs;
    var i = 0;
    while (i < segs.length - 1 && s > segs[i].start + segs[i].len) i++;
    var sg = segs[i];
    var k = clamp((s - sg.start) / sg.len, 0, 1);
    return { x: sg.x1 + (sg.x2 - sg.x1) * k, y: sg.y1 + (sg.y2 - sg.y1) * k };
  }

  function nearest(tr, px, py) {
    var best = Infinity;
    var bestS = 0;
    for (var i = 0; i < tr.segs.length; i++) {
      var sg = tr.segs[i];
      var dx = sg.x2 - sg.x1;
      var dy = sg.y2 - sg.y1;
      var k = clamp(((px - sg.x1) * dx + (py - sg.y1) * dy) / (sg.len * sg.len), 0, 1);
      var qx = sg.x1 + dx * k;
      var qy = sg.y1 + dy * k;
      var dist = Math.hypot(px - qx, py - qy);
      if (dist < best) {
        best = dist;
        bestS = sg.start + sg.len * k;
      }
    }
    return { dist: best, s: bestS };
  }

  function spawn(tr, at) {
    if (pulses.length > 110) return;
    var dir = Math.random() < 0.5 ? 1 : -1;
    var pos = typeof at === "number" ? at : dir === 1 ? 0 : tr.length;
    pulses.push({
      tr: tr,
      pos: pos,
      dir: dir,
      speed: rnd(70, 240),
      tail: rnd(50, 110),
      alpha: rnd(0.6, 0.95),
      boost: 0
    });
  }

  function update(dt) {
    var k = 1 - Math.exp(-dt * 6);
    pointer.influence += (pointer.target - pointer.influence) * k;
    var kp = 1 - Math.exp(-dt * 14);
    pointer.x += (pointer.tx - pointer.x) * kp;
    pointer.y += (pointer.ty - pointer.y) * kp;

    ambientAcc += dt * traces.length * 0.045;
    while (ambientAcc >= 1) {
      ambientAcc -= 1;
      if (traces.length) spawn(traces[ri(0, traces.length - 1)]);
    }

    if (pointer.influence > 0.02) {
      for (var i = 0; i < traces.length; i++) {
        var tr = traces[i];
        var b = tr.box;
        if (pointer.x < b.x1 || pointer.x > b.x2 || pointer.y < b.y1 || pointer.y > b.y2) continue;
        var n = nearest(tr, pointer.x, pointer.y);
        if (n.dist > RADIUS) continue;
        var prox = smooth(1 - n.dist / RADIUS);
        if (Math.random() < 1.8 * pointer.influence * prox * dt) spawn(tr, n.s);
      }
    }

    for (var p = pulses.length - 1; p >= 0; p--) {
      var pl = pulses[p];
      pl.pos += pl.dir * pl.speed * dt;
      if (pl.pos < -pl.tail - 4 || pl.pos > pl.tr.length + pl.tail + 4) pulses.splice(p, 1);
    }
  }

  function drawTrace(tr, col, active) {
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    var near = active && pointer.x > tr.box.x1 && pointer.x < tr.box.x2 && pointer.y > tr.box.y1 && pointer.y < tr.box.y2;
    if (!near) {
      ctx.strokeStyle = "rgba(" + col + "," + tr.alpha + ")";
      ctx.beginPath();
      ctx.moveTo(tr.pts[0].x, tr.pts[0].y);
      for (var i = 1; i < tr.pts.length; i++) ctx.lineTo(tr.pts[i].x, tr.pts[i].y);
      ctx.stroke();
    } else {
      for (var s = 0; s < tr.segs.length; s++) {
        var sg = tr.segs[s];
        var pieces = Math.max(1, Math.ceil(sg.len / 24));
        for (var q = 0; q < pieces; q++) {
          var t1 = q / pieces;
          var t2 = (q + 1) / pieces;
          var x1 = sg.x1 + (sg.x2 - sg.x1) * t1;
          var y1 = sg.y1 + (sg.y2 - sg.y1) * t1;
          var x2 = sg.x1 + (sg.x2 - sg.x1) * t2;
          var y2 = sg.y1 + (sg.y2 - sg.y1) * t2;
          var d = Math.hypot((x1 + x2) / 2 - pointer.x, (y1 + y2) / 2 - pointer.y);
          var boost = d < RADIUS ? smooth(1 - d / RADIUS) * pointer.influence * 0.5 : 0;
          ctx.strokeStyle = "rgba(" + col + "," + (tr.alpha + boost) + ")";
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
    }

    var end = tr.pts[0];
    var end2 = tr.pts[tr.pts.length - 1];
    var padA = tr.alpha + 0.06;
    var ends = [end, end2];
    for (var e = 0; e < 2; e++) {
      var pt = ends[e];
      var bp = 0;
      if (active) {
        var dd = Math.hypot(pt.x - pointer.x, pt.y - pointer.y);
        bp = dd < RADIUS ? smooth(1 - dd / RADIUS) * pointer.influence * 0.5 : 0;
      }
      ctx.strokeStyle = "rgba(" + col + "," + (padA + bp) + ")";
      ctx.fillStyle = "rgba(" + col + "," + (padA + bp) + ")";
      if (tr.padStyle === 0) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4.2, 0, 6.2832);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.6, 0, 6.2832);
        ctx.fill();
      } else {
        ctx.fillRect(pt.x - 2.6, pt.y - 2.6, 5.2, 5.2);
      }
    }
    for (var v = 1; v < tr.pts.length - 1; v++) {
      if (!tr.pts[v].via) continue;
      var vp = tr.pts[v];
      var bv = 0;
      if (active) {
        var dv = Math.hypot(vp.x - pointer.x, vp.y - pointer.y);
        bv = dv < RADIUS ? smooth(1 - dv / RADIUS) * pointer.influence * 0.5 : 0;
      }
      ctx.strokeStyle = "rgba(" + col + "," + (tr.alpha * 1.5 + bv) + ")";
      ctx.beginPath();
      ctx.arc(vp.x, vp.y, 2.4, 0, 6.2832);
      ctx.stroke();
    }
  }

  function drawPulse(pl, col, active) {
    var tr = pl.tr;
    var samples = 10;
    var boost = 1;
    var head = pointAt(tr, clamp(pl.pos, 0, tr.length));
    if (active) {
      var d = Math.hypot(head.x - pointer.x, head.y - pointer.y);
      if (d < RADIUS) boost = 1 + smooth(1 - d / RADIUS) * pointer.influence * 0.5;
    }
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    var prev = null;
    for (var i = 0; i <= samples; i++) {
      var s = pl.pos - pl.dir * (pl.tail * i) / samples;
      if (s < 0 || s > tr.length) {
        prev = null;
        continue;
      }
      var pt = pointAt(tr, s);
      if (prev) {
        var fade = Math.pow(1 - (i - 0.5) / samples, 1.6);
        ctx.strokeStyle = "rgba(" + col + "," + Math.min(1, pl.alpha * fade * boost) + ")";
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }
      prev = pt;
    }
    if (pl.pos >= 0 && pl.pos <= tr.length) {
      ctx.fillStyle = "rgba(" + col + "," + Math.min(1, pl.alpha * boost) + ")";
      ctx.beginPath();
      ctx.arc(head.x, head.y, 2.2, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = "rgba(" + col + "," + 0.14 * boost + ")";
      ctx.beginPath();
      ctx.arc(head.x, head.y, 6.5, 0, 6.2832);
      ctx.fill();
    }
  }

  function draw(withPulses) {
    var rgb = accent();
    var col = Math.round(rgb[0]) + "," + Math.round(rgb[1]) + "," + Math.round(rgb[2]);
    var active = withPulses && pointer.influence > 0.02;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    for (var i = 0; i < traces.length; i++) drawTrace(traces[i], col, active);
    if (withPulses) {
      ctx.globalCompositeOperation = "lighter";
      for (var p = 0; p < pulses.length; p++) drawPulse(pulses[p], col, active);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw(true);
  }

  function start() {
    if (raf || reduceQuery.matches || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function drawStatic() {
    pulses = [];
    draw(false);
  }

  function layout() {
    var nw = window.innerWidth;
    var nh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = nw;
    H = nh;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    if (reduceQuery.matches) drawStatic();
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (Math.abs(window.innerWidth - W) < 1 && Math.abs(window.innerHeight - H) < 80) return;
      layout();
    }, 200);
  }

  function onModeChange() {
    if (reduceQuery.matches) {
      stop();
      pointer.target = 0;
      pointer.influence = 0;
      drawStatic();
    } else {
      start();
    }
  }

  window.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch" || reduceQuery.matches) return;
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;
    if (!pointer.seen) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.seen = true;
    }
    pointer.target = 1;
  }, { passive: true });

  document.addEventListener("mouseout", function (e) {
    if (!e.relatedTarget) pointer.target = 0;
  });

  window.addEventListener("blur", function () {
    pointer.target = 0;
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });

  window.addEventListener("resize", onResize);
  window.addEventListener("accentchange", function () {
    if (reduceQuery.matches) drawStatic();
  });

  if (reduceQuery.addEventListener) reduceQuery.addEventListener("change", onModeChange);
  else if (reduceQuery.addListener) reduceQuery.addListener(onModeChange);

  window.SignalField = { refresh: drawStatic };

  layout();
  if (!reduceQuery.matches) start();
})();
