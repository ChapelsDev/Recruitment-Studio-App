// Original canvas illustrations: construction tools, materials and gestures.
// The art stays resolution independent and inherits the advertisement's palette.
window.RS = window.RS || {};
RS.carouselArt = (() => {
  const LABELS = {
    obras: 'Construção', pedreiro: 'Alvenaria', cofragem: 'Cofragem', ferro: 'Armaduras de ferro', eletricista: 'Eletricidade',
    canalizador: 'Canalização', pintor: 'Pintura', carpinteiro: 'Carpintaria',
    serralheiro: 'Metalomecânica', ladrilhador: 'Revestimentos', telhados: 'Coberturas',
    maquinas: 'Operação de máquinas', pladur: 'Sistemas de interiores', tecnico: 'Projeto e obra',
  };
  function key(value) {
    const t = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/cofrag|coffr|formwork|schal|casseform|encofra/.test(t)) return 'cofragem';
    if (/ferro|ferrai|ferral|armador|armadur|rebar|steel\s*fix|eisenleger/.test(t)) return 'ferro';
    if (/eletri|electri|electric/.test(t)) return 'eletricista';
    if (/canal|plumb|tub|piping|sanit/.test(t)) return 'canalizador';
    if (/pint|paint|peint/.test(t)) return 'pintor';
    if (/carp|join|madeir|wood|menuis/.test(t)) return 'carpinteiro';
    if (/serra|solda|weld|metal|iron|acier/.test(t)) return 'serralheiro';
    if (/ladr|azulej|mosaic|tile|carrel|revest/.test(t)) return 'ladrilhador';
    if (/telhad|cobert|roof|toit/.test(t)) return 'telhados';
    if (/maquin|maquinist|machine|grua|crane|escava|operador|operat/.test(t)) return 'maquinas';
    if (/pladur|gesso|drywall|plaster|plaquist/.test(t)) return 'pladur';
    if (/tecnic|engenh|engineer|arquit|architect|projet|project|encarreg|supervis/.test(t)) return 'tecnico';
    if (/pedreir|mason|brick|macon|alven/.test(t)) return 'pedreiro';
    return 'obras';
  }
  function hash(value) {
    let h = 2166136261;
    for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  }
  function draw(ctx, options = {}) {
    const { x = 0, y = 0, w = 400, h = 400, ink = '#222323', accent = '#f17732', paper = '#f5f0e7', seed = 0, mode = 'line' } = options;
    if (!ctx || ![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
    const solid = mode === 'solid', n = hash(seed), variant = n % 3;
    const inheritedAlpha = Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1;
    ctx.save();
    try {
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      const scale = Math.min(w, h) / 400;
      ctx.translate(x + (w - scale * 400) / 2, y + (h - scale * 400) / 2);
      ctx.scale(scale, scale);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const fill = (color, alpha = 1) => { ctx.globalAlpha = inheritedAlpha * alpha; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = inheritedAlpha; };
      const stroke = (color = ink, width = 2, alpha = 1) => { ctx.globalAlpha = inheritedAlpha * alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.globalAlpha = inheritedAlpha; };
      const path = (points, close = false) => {
        ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        if (close) ctx.closePath();
      };
      const line = (points, color = ink, width = 2, alpha = 1) => { path(points); stroke(color, width, alpha); };
      const polygon = (points, color = paper, width = 2, outline = ink, alpha = 1) => {
        path(points, true); if (color) fill(color, alpha); if (outline && width) stroke(outline, width);
      };
      const circle = (cx, cy, r, color = null, width = 2, outline = ink, alpha = 1) => {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); if (color) fill(color, alpha); if (outline && width) stroke(outline, width);
      };
      const ellipse = (cx, cy, rx, ry, rotation = 0, color = null, width = 2, outline = ink) => {
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2); if (color) fill(color); if (outline && width) stroke(outline, width);
      };
      const curve = (start, curves, color = ink, width = 2, alpha = 1) => {
        ctx.beginPath(); ctx.moveTo(...start); curves.forEach((c) => ctx.bezierCurveTo(...c)); stroke(color, width, alpha);
      };
      const rect = (rx, ry, rw, rh, color = null, width = 2, outline = ink) => polygon([[rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh]], color, width, outline);
      const dash = (a, b, spacing = 9, color = ink, alpha = .27) => {
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / length, uy = (b[1] - a[1]) / length;
        for (let d = 0; d < length; d += spacing) line([[a[0] + ux * d, a[1] + uy * d], [a[0] + ux * Math.min(d + 3, length), a[1] + uy * Math.min(d + 3, length)]], color, 1, alpha);
      };
      const dimension = (a, b) => {
        line([a, b], ink, 1, .35);
        [a, b].forEach(([px, py]) => line([[px - 4, py + 5], [px + 4, py - 5]], ink, 1, .5));
      };
      const cross = (cx, cy, size = 5) => {
        line([[cx - size, cy], [cx + size, cy]], ink, 1, .25);
        line([[cx, cy - size], [cx, cy + size]], ink, 1, .25);
      };
      const bolt = (cx, cy, r = 4) => { circle(cx, cy, r, paper, 1.3); line([[cx - r / 2, cy + r / 2], [cx + r / 2, cy - r / 2]], ink, 1); };
      const prism = (px, py, a, b, depth, top = paper, face = paper, side = accent) => {
        const A = [a * .9, a * .28], B = [b * .72, -b * .45];
        const p = [px, py], q = [px + A[0], py + A[1]], r = [q[0] + B[0], q[1] + B[1]], s = [px + B[0], py + B[1]];
        polygon([p, q, [q[0], q[1] + depth], [px, py + depth]], face, 2.2);
        polygon([q, r, [r[0], r[1] + depth], [q[0], q[1] + depth]], side, 2.2);
        polygon([p, q, r, s], top, 2.2);
        return { p, q, r, s };
      };
      // Registration marks and one offset field make the drawing feel printed,
      // while keeping the silhouette clean enough for small slide previews.
      const drift = (variant - 1) * 5;
      if (solid) {
        circle(204 + drift, 204, 151, accent, 0, null, .10);
        line([[50, 318], [350, 318]], ink, 1, .22);
      }
      cross(42, 47); cross(358, 353);
      const trade = key(options.trade);

      if (trade === 'obras' || trade === 'pedreiro') {
        // Bonded courses of cut brick, with an unmistakable mason's trowel.
        dash([53, 286], [335, 332]);
        prism(73, 239, 114, 66, 46, paper, solid ? accent : paper, ink);
        prism(184, 273, 114, 66, 46, paper, solid ? accent : paper, ink);
        prism(134, 207, 114, 66, 46, accent, paper, ink);
        line([[87, 262], [163, 285]], ink, 1, .35);
        line([[199, 296], [276, 320]], paper, 1.2, .8);
        for (let i = 0; i < 3; i++) ellipse(170 + i * 22, 201 + i * 6.8, 9, 4, .29, ink, 1, ink);
        ctx.save(); ctx.translate(214 + drift, 126); ctx.rotate(-.62);
        polygon([[-55, 2], [51, -19], [42, 64]], solid ? paper : accent, 2.6);
        line([[-39, 7], [31, -7], [25, 46]], ink, 1, .35);
        line([[8, 11], [-3, -17], [1, -33]], ink, 8);
        line([[8, 11], [-3, -17], [1, -33]], paper, 3);
        polygon([[-10, -31], [12, -34], [18, -98], [1, -105], [-10, -98]], accent, 2.6);
        line([[0, -48], [4, -87]], paper, 2.2, .9);
        circle(4, -94, 3, paper, 1.2);
        ctx.restore();
        dimension([55, 337], [171, 370]);
      } else if (trade === 'cofragem') {
        // Formwork skin, steel walers and an adjustable diagonal push-pull prop.
        const p = (u, v) => [99 + 142 * u, 96 - 37 * u + 201 * v];
        polygon([p(0, 0), p(1, 0), p(1, 1), p(0, 1)], solid ? accent : paper, 2.4);
        polygon([p(1, 0), [260, 70], [260, 271], p(1, 1)], ink, 2.2);
        for (let i = 1; i < 5; i++) line([p(i / 5, .035), p(i / 5, .97)], ink, 1, .24);
        [.14, .5, .86].forEach((u) => {
          line([p(u, .02), p(u, .98)], ink, 10);
          line([p(u - .015, .04), p(u - .015, .96)], paper, 1.4, .65);
        });
        [.24, .75].forEach((v) => {
          polygon([p(-.08, v), p(1.08, v), p(1.08, v + .065), p(-.08, v + .065)], accent, 2.2);
          [.14, .5, .86].forEach((u) => { const point = p(u, v + .033); bolt(point[0], point[1], 3); });
        });
        // The threaded lower sleeve and collar identify the prop as site kit.
        line([[173, 186], [299, 329]], ink, 14);
        line([[173, 186], [299, 329]], paper, 9);
        line([[174, 187], [247, 270]], accent, 10);
        line([[240, 265], [253, 277]], ink, 17);
        for (let i = 0; i < 7; i++) {
          const px = 256 + i * 4.9, py = 281 + i * 5.5;
          line([[px - 4, py + 3], [px + 5, py - 4]], ink, 1.3);
        }
        line([[235, 280], [258, 259]], ink, 3); circle(173, 186, 9, paper, 2.4); bolt(173, 186, 3.2);
        prism(274, 331, 44, 31, 7, accent, paper, ink);
        circle(298, 327, 6, paper, 2.2);
        polygon([[80, 300], [119, 290], [134, 299], [95, 309]], ink, 2);
        line([[110, 277], [110, 296]], ink, 9); bolt(110, 292, 3);
        dash([65, 318], [246, 271]); dimension([72, 336], [215, 299]);
        dimension([74, 101], [74, 298]);
      } else if (trade === 'ferro') {
        // Four ribbed reinforcing bars held by closed stirrups and wire ties.
        const corners = [[86, 239], [155, 292], [176, 225], [107, 173]], depth = [144, -73];
        const point = (c, t) => [c[0] + depth[0] * t, c[1] + depth[1] * t];
        // The far stirrup is opaque; nearer rings remain open so the cage reads.
        polygon(corners.map((c) => point(c, 1)), solid ? accent : paper, 2, ink, solid ? .22 : 1);
        corners.forEach((c, index) => {
          line([point(c, -.08), point(c, 1.1)], ink, 8);
          line([point(c, -.08), point(c, 1.1)], index < 2 ? accent : paper, 3.5);
          for (let i = 0; i < 16; i++) {
            const [px, py] = point(c, -.03 + i * .072);
            line([[px - 2.6, py - 3.7], [px + 2.6, py + 3.7]], ink, 1.2);
          }
        });
        [1, .78, .54, .3, .06].forEach((t, index) => {
          const ring = corners.map((c) => point(c, t)); ring.push(ring[0]);
          line(ring, ink, 5.5); line(ring, index % 2 ? paper : accent, 2.5);
          const [px, py] = point(corners[1], t);
          ellipse(px, py, 5, 2.4, -.5, null, 1.3);
          line([[px + 3, py - 2], [px + 9, py - 8], [px + 11, py - 5]], ink, 1.1);
        });
        // A separate bent bar foreground shows the bend radius and rib texture.
        curve([216, 327], [[235, 317, 253, 307, 272, 297], [280, 292, 289, 293, 294, 300], [300, 308, 306, 316, 312, 324]], ink, 10);
        curve([216, 327], [[235, 317, 253, 307, 272, 297], [280, 292, 289, 293, 294, 300], [300, 308, 306, 316, 312, 324]], accent, 5.5);
        for (let i = 0; i < 7; i++) line([[224 + i * 7, 319 - i * 3.8], [227 + i * 7, 326 - i * 3.8]], ink, 1.4);
        for (let i = 0; i < 3; i++) line([[296 + i * 5, 302 + i * 6], [302 + i * 5, 298 + i * 6]], ink, 1.4);
        dash([91, 150], [245, 72]); dimension([68, 130], [218, 54]); dimension([61, 256], [129, 307]);
      } else if (trade === 'eletricista') {
        // A physical toggle switch embedded in a routed circuit schematic.
        const tracks = [[[48, 103], [104, 103], [104, 160], [137, 160]], [[263, 156], [302, 156], [302, 79], [347, 79]], [[260, 239], [324, 239], [324, 308]], [[145, 244], [94, 244], [94, 306], [49, 306]]];
        tracks.forEach((p) => line(p, ink, 2.2));
        [[48, 103], [347, 79], [324, 308], [49, 306]].forEach(([px, py]) => circle(px, py, 6, paper, 2));
        polygon([[134, 112], [258, 125], [258, 278], [134, 265]], solid ? accent : paper, 2.4);
        polygon([[258, 125], [273, 113], [273, 265], [258, 278]], ink, 2.4);
        polygon([[134, 112], [149, 101], [273, 113], [258, 125]], paper, 2.4);
        polygon([[164, 148], [230, 155], [230, 233], [164, 226]], ink, 2);
        polygon([[170, 151], [224, 157], [216, 216], [161, 210]], paper, 2.2);
        line([[167, 209], [218, 215]], accent, 3);
        bolt(195, 133, 3); bolt(195, 253, 3);
        polygon([[314, 114], [287, 164], [312, 161], [294, 204], [341, 146], [318, 149], [335, 114]], accent, 0, null);
        line([[94, 266], [83, 273], [105, 281], [83, 289], [94, 296]], ink, 2);
        line([[53, 171], [100, 171]], ink, 1.4, .45); line([[76, 149], [76, 193]], ink, 1.4, .45);
        dash([165, 304], [266, 304]); dimension([137, 328], [273, 328]);
      } else if (trade === 'canalizador') {
        // Twin-wall elbow, flanges and a four-spoke shut-off valve.
        ctx.beginPath(); ctx.moveTo(61, 290); ctx.lineTo(61, 203); ctx.bezierCurveTo(61, 171, 78, 155, 110, 155); ctx.lineTo(293, 155); ctx.bezierCurveTo(325, 155, 339, 173, 339, 202); ctx.lineTo(339, 291);
        stroke(ink, 40); stroke(solid ? accent : paper, 35);
        ctx.beginPath(); ctx.moveTo(61, 279); ctx.lineTo(61, 203); ctx.bezierCurveTo(61, 171, 78, 155, 110, 155); ctx.lineTo(293, 155); ctx.bezierCurveTo(325, 155, 339, 173, 339, 202); ctx.lineTo(339, 279); stroke(ink, 1, .3);
        rect(42, 240, 38, 14, paper, 2.2); rect(320, 240, 38, 14, paper, 2.2);
        ellipse(61, 291, 19, 8, 0, paper, 2.2); ellipse(61, 291, 12, 4, 0, ink, 0, null);
        ellipse(339, 291, 19, 8, 0, paper, 2.2); ellipse(339, 291, 12, 4, 0, ink, 0, null);
        rect(166, 130, 72, 50, paper, 2.2); rect(159, 127, 10, 56, accent, 2); rect(235, 127, 10, 56, accent, 2);
        rect(196, 89, 12, 41, ink, 1.5); circle(202, 85, 39, solid ? paper : accent, 2.8);
        circle(202, 85, 27, paper, 2); line([[175, 85], [229, 85]], ink, 5); line([[202, 58], [202, 112]], ink, 5); circle(202, 85, 8, accent, 2);
        [[164, 138], [164, 173], [240, 138], [240, 173]].forEach(([px, py]) => bolt(px, py, 2));
        polygon([[183, 148], [183, 162], [211, 162], [211, 169], [224, 155], [211, 141], [211, 148]], accent, 0, null);
        dash([44, 326], [357, 326]); dimension([61, 347], [339, 347]);
      } else if (trade === 'pintor') {
        // An imperfect painted swatch is drawn as one deliberate brush shape.
        ctx.beginPath(); ctx.moveTo(80, 92); ctx.bezierCurveTo(126, 84, 227, 92, 285, 82); ctx.lineTo(298, 116); ctx.lineTo(291, 139); ctx.lineTo(301, 171); ctx.lineTo(293, 214); ctx.lineTo(300, 263); ctx.bezierCurveTo(235, 256, 132, 272, 76, 261); ctx.lineTo(83, 237); ctx.lineTo(73, 205); ctx.lineTo(81, 172); ctx.lineTo(73, 133); ctx.closePath(); fill(accent, solid ? 1 : .88);
        for (let i = 0; i < 6; i++) line([[95 + i * 31, 104 + (i % 2) * 8], [94 + i * 31, 240 - (i % 3) * 12]], paper, 1, .3);
        ctx.save(); ctx.translate(196 + drift, 172); ctx.rotate(-.12);
        line([[81, -33], [98, -33], [98, 23], [14, 36], [14, 98]], ink, 8);
        line([[81, -33], [98, -33], [98, 23], [14, 36], [14, 98]], paper, 3.5);
        rect(-83, -56, 166, 47, paper, 2.8);
        ellipse(-83, -32.5, 8, 23.5, 0, paper, 2.2); ellipse(83, -32.5, 8, 23.5, 0, ink, 2);
        for (let i = 0; i < 9; i++) line([[-67 + i * 16, -47], [-71 + i * 16, -18]], ink, 1, .2);
        polygon([[2, 88], [26, 88], [29, 149], [23, 160], [5, 160], [-1, 149]], ink, 2.4);
        line([[8, 104], [8, 145]], accent, 3); circle(14, 151, 3, paper, 0, null);
        ctx.restore();
        line([[69, 303], [131, 303]], ink, 1.3, .4); dimension([69, 320], [131, 320]);
        circle(304, 276, 5, accent, 0, null); circle(315, 291, 2.5, accent, 0, null);
      } else if (trade === 'carpinteiro') {
        // Joinery rather than a generic tree: a mortise, a tenon and a square.
        prism(69, 237, 186, 55, 40, solid ? accent : paper, paper, ink);
        polygon([[136, 242], [176, 254], [198, 241], [158, 229]], ink, 1.5);
        line([[85, 248], [132, 261]], ink, 1.1, .45); line([[172, 274], [222, 288]], ink, 1.1, .45);
        curve([82, 260], [[94, 255, 107, 271, 128, 271]], ink, 1, .5);
        curve([185, 291], [[194, 284, 218, 306, 232, 298]], ink, 1, .5);
        prism(148, 175, 39, 56, 46, accent, paper, ink);
        prism(128, 100, 82, 60, 76, paper, solid ? accent : paper, ink);
        line([[146, 123], [146, 164]], ink, 1, .35); line([[165, 131], [165, 181]], ink, 1, .35);
        dash([159, 220], [159, 232]); dash([183, 211], [183, 238]);
        ctx.save(); ctx.translate(285, 182); ctx.rotate(.18);
        polygon([[0, -96], [29, -96], [29, 110], [-81, 110], [-81, 81], [0, 81]], accent, 2.4);
        for (let i = 0; i < 12; i++) line([[3, -83 + i * 14], [i % 2 ? 13 : 19, -83 + i * 14]], ink, 1.2);
        for (let i = 0; i < 5; i++) line([[-68 + i * 15, 84], [-68 + i * 15, i % 2 ? 94 : 101]], ink, 1.2);
        circle(15, -82, 3.2, paper, 1.2);
        ctx.restore();
        dimension([62, 315], [231, 367]);
      } else if (trade === 'serralheiro') {
        // Extruded I-section and the bright, controlled gesture of a weld.
        const front = [[80, 182], [185, 215], [185, 236], [147, 224], [147, 287], [185, 299], [185, 321], [80, 288], [80, 266], [117, 278], [117, 215], [80, 203]];
        const offset = [126, -76];
        polygon(front.map(([px, py]) => [px + offset[0], py + offset[1]]), paper, 2.4);
        [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]].forEach(([a, b], i) => polygon([front[a], front[b], [front[b][0] + offset[0], front[b][1] + offset[1]], [front[a][0] + offset[0], front[a][1] + offset[1]]], i % 2 ? ink : i === 0 ? accent : paper, 2));
        polygon(front, solid ? accent : paper, 2.8);
        line([[94, 194], [172, 218]], ink, 1, .35); line([[93, 280], [173, 305]], ink, 1, .35);
        ctx.save(); ctx.translate(231, 169); ctx.rotate(.6);
        polygon([[-10, -84], [12, -84], [12, -25], [5, -15], [5, 0], [-5, 0], [-5, -18], [-10, -25]], ink, 2.5);
        rect(-14, -88, 30, 16, accent, 2); line([[-4, -66], [-4, -30]], paper, 1.7);
        curve([2, -89], [[5, -120, 45, -132, 67, -107]], ink, 6);
        ctx.restore();
        for (let i = 0; i < 9; i++) {
          const a = -2.8 + i * .51, inner = 17 + (i % 3) * 3, outer = inner + 14 + ((i + variant) % 3) * 7;
          line([[231 + Math.cos(a) * inner, 169 + Math.sin(a) * inner], [231 + Math.cos(a) * outer, 169 + Math.sin(a) * outer]], accent, i % 2 ? 2 : 3);
        }
        circle(231, 169, 6, paper, 2, accent); dimension([80, 336], [185, 369]);
      } else if (trade === 'ladrilhador') {
        // A laid tile field with one lifted tile and visible grout spacers.
        const origin = [71, 231], A = [52, 23], B = [42, -33];
        for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
          if (row === 2 && col === 1) continue;
          const px = origin[0] + col * A[0] + row * B[0], py = origin[1] + col * A[1] + row * B[1];
          const pts = [[px, py], [px + 47, py + 21], [px + 84, py - 8], [px + 37, py - 29]];
          polygon(pts, (row + col + variant) % 3 === 0 ? accent : paper, 1.9);
          if ((row + col) % 2 === 0) polygon([pts[0], pts[1], pts[2]], ink, 0, null, solid ? .9 : .12);
        }
        polygon([[207, 174], [254, 195], [291, 166], [244, 145]], ink, 1.6);
        polygon([[209, 133], [256, 154], [293, 125], [246, 104]], accent, 2.5);
        polygon([[209, 133], [256, 154], [256, 160], [209, 139]], paper, 1.5);
        polygon([[256, 154], [293, 125], [293, 131], [256, 160]], ink, 1.5);
        dash([209, 148], [209, 174]); dash([293, 140], [291, 166]);
        [[165, 221], [217, 244], [207, 188]].forEach(([px, py]) => { line([[px - 7, py - 3], [px + 7, py + 3]], accent, 3); line([[px - 5, py + 4], [px + 5, py - 4]], accent, 3); });
        dimension([53, 258], [208, 326]); dimension([232, 331], [358, 232]);
        // Fine scored lines inside the lifted tile echo a ceramic glaze.
        line([[226, 130], [253, 142], [274, 126]], paper, 1.2, .75);
      } else if (trade === 'telhados') {
        // A roof section separates tile, battens and the structural envelope.
        polygon([[72, 279], [201, 164], [331, 279], [308, 299], [201, 204], [95, 299]], ink, 2.2);
        polygon([[83, 250], [201, 146], [320, 250], [308, 264], [201, 172], [95, 264]], paper, 2.2);
        polygon([[63, 219], [201, 97], [340, 219], [317, 240], [201, 139], [86, 240]], accent, 2.8);
        line([[201, 97], [201, 139]], ink, 2.2);
        for (let i = 1; i < 6; i++) {
          const t = i / 6, lx = 63 + 138 * t, ly = 219 - 122 * t;
          line([[lx, ly], [lx + 22, ly + 21]], ink, 1.3, .65);
          line([[340 - 139 * t, ly], [318 - 117 * t, 240 - 101 * t]], ink, 1.3, .65);
        }
        line([[75, 230], [201, 119], [329, 230]], paper, 1.4, .8);
        polygon([[251, 140], [251, 79], [284, 79], [284, 169]], paper, 2.4);
        polygon([[251, 79], [265, 68], [298, 68], [284, 79]], accent, 2.2);
        polygon([[284, 79], [298, 68], [298, 181], [284, 169]], ink, 2.2);
        line([[258, 95], [279, 95]], ink, 1); line([[258, 112], [279, 112]], ink, 1);
        dash([68, 242], [68, 281]); dash([337, 242], [337, 281]);
        line([[110, 308], [110, 332], [291, 332], [291, 308]], ink, 1, .35); dimension([110, 352], [291, 352]);
      } else if (trade === 'maquinas') {
        // Lattice crane, counterweight and hook: the silhouette reads at a glance.
        rect(126, 119, 31, 198, paper, 2.3);
        for (let i = 0; i < 5; i++) { const py = 124 + i * 38; line([[129, py], [154, py + 34], [129, py + 34], [154, py]], ink, 1.5); }
        polygon([[59, 108], [330, 108], [330, 130], [59, 130]], accent, 2.4);
        for (let i = 0; i < 9; i++) line([[60 + i * 30, 128], [75 + i * 30, 110], [90 + i * 30, 128]], ink, 1.3);
        line([[63, 107], [141, 63], [329, 107]], ink, 2); line([[141, 63], [141, 108]], ink, 2.2);
        rect(130, 58, 21, 12, ink, 2); rect(68, 130, 42, 33, ink, 2); line([[80, 136], [80, 157]], paper, 1.2, .6); line([[94, 136], [94, 157]], paper, 1.2, .6);
        rect(156, 132, 37, 38, paper, 2.2); rect(162, 138, 25, 21, accent, 1.5);
        rect(269, 129, 24, 12, ink, 2); line([[275, 141], [275, 225]], ink, 2); line([[287, 141], [287, 225]], ink, 2);
        polygon([[269, 222], [293, 222], [291, 242], [281, 249], [271, 242]], accent, 2.2);
        curve([281, 248], [[281, 260, 296, 260, 296, 275], [296, 293, 267, 294, 268, 275]], ink, 9);
        curve([281, 248], [[281, 260, 296, 260, 296, 275], [296, 293, 267, 294, 268, 275]], solid ? accent : paper, 4);
        polygon([[109, 317], [173, 317], [187, 336], [95, 336]], ink, 2); rect(83, 337, 116, 11, accent, 2);
        dash([223, 310], [338, 310]); dimension([240, 334], [324, 334]);
      } else if (trade === 'pladur') {
        // Exploded wall assembly with real panel thickness and steel studs.
        const panel = (px, py, color) => {
          polygon([[px, py], [px + 123, py - 37], [px + 123, py + 154], [px, py + 191]], color, 2.2);
          polygon([[px + 123, py - 37], [px + 132, py - 32], [px + 132, py + 160], [px + 123, py + 154]], ink, 1.8);
          polygon([[px, py + 191], [px + 123, py + 154], [px + 132, py + 160], [px + 9, py + 197]], paper, 1.8);
        };
        panel(190, 97, paper);
        [166, 215, 264].forEach((px, i) => {
          const py = 112 - i * 15;
          polygon([[px, py], [px + 11, py - 3], [px + 11, py + 183], [px, py + 187]], ink, 1.8);
          line([[px + 6, py + 10], [px + 6, py + 174]], paper, 1.3, .65);
          [45, 100, 155].forEach((dy) => ellipse(px + 6, py + dy, 2, 5, 0, paper, 0, null));
        });
        polygon([[160, 112], [279, 76], [290, 83], [171, 119]], accent, 2);
        polygon([[160, 300], [279, 264], [290, 271], [171, 307]], accent, 2);
        panel(74, 134, solid ? accent : paper);
        line([[134, 116], [134, 307]], ink, 1, .35);
        [92, 180].forEach((px) => [166, 215, 268].forEach((py) => circle(px, py - (px - 92) * .3, 2, ink, 0, null)));
        dash([206, 297], [308, 267]); dash([80, 120], [174, 92]);
        dimension([53, 143], [53, 329]); dimension([77, 354], [201, 317]);
      } else {
        // Architect's floor plan with door swings, a compass and pencil.
        polygon([[66, 88], [284, 88], [284, 313], [66, 313]], paper, 2.3);
        line([[82, 104], [268, 104], [268, 295], [82, 295], [82, 104]], ink, 6);
        line([[82, 185], [133, 185]], ink, 5); line([[180, 185], [268, 185]], ink, 5);
        line([[184, 105], [184, 145]], ink, 5); line([[184, 236], [184, 295]], ink, 5);
        line([[133, 185], [133, 141]], ink, 1.4);
        ctx.beginPath(); ctx.arc(133, 185, 44, -Math.PI / 2, 0); stroke(ink, 1.1, .6);
        line([[184, 236], [225, 236]], ink, 1.4);
        ctx.beginPath(); ctx.arc(184, 236, 41, -Math.PI / 2, 0); stroke(ink, 1.1, .6);
        rect(89, 111, 49, 21, accent, 1.5); rect(89, 136, 22, 29, paper, 1.5); circle(113, 244, 19, null, 1.6); rect(242, 211, 18, 68, paper, 1.5);
        rect(106, 101, 40, 6, paper, 1); rect(265, 127, 6, 40, paper, 1); rect(100, 292, 42, 6, paper, 1);
        dimension([65, 65], [285, 65]); dimension([43, 88], [43, 313]);
        ctx.save(); ctx.translate(286 + drift, 208); ctx.rotate(.23);
        polygon([[-5, -67], [-12, 96], [-4, 106], [6, -63]], solid ? paper : accent, 2.2);
        polygon([[5, -66], [57, 88], [68, 95], [16, -70]], ink, 2.2);
        circle(6, -68, 13, accent, 2.5); bolt(6, -68, 4);
        rect(-1, -96, 14, 16, ink, 1.5);
        line([[-6, 20], [40, 20]], ink, 3); circle(17, 20, 5, paper, 1.5);
        line([[-4, 106], [-5, 120]], ink, 2); line([[67, 95], [72, 106]], ink, 2);
        ctx.restore();
        dash([95, 339], [254, 339]);
      }
    } finally { ctx.restore(); }
  }
  return { draw, label: (trade) => LABELS[key(trade)] };
})();
