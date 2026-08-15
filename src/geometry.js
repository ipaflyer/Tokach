/**
 * Геометрия обвода: черта, контур, попадание внутрь.
 */

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointInAabb(p, box) {
  return p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
}

function circleHitsAabb(cx, cy, radius, box) {
  const nearestX = clamp(cx, box.x, box.x + box.w);
  const nearestY = clamp(cy, box.y, box.y + box.h);
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

function distPointToAabb(p, box) {
  if (pointInAabb(p, box)) {
    return 0;
  }
  const nearestX = clamp(p.x, box.x, box.x + box.w);
  const nearestY = clamp(p.y, box.y, box.y + box.h);
  return Math.hypot(p.x - nearestX, p.y - nearestY);
}

function polylineLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += dist(points[i - 1], points[i]);
  }
  return length;
}

function polygonArea(points) {
  let sum = 0;
  const count = points.length;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    sum += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(sum) * 0.5;
}

function pointInPolygon(p, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const crosses =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-9) + xi;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonCentroid(points) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < points.length; i += 1) {
    x += points[i].x;
    y += points[i].y;
  }
  const n = Math.max(1, points.length);
  return { x: x / n, y: y / n };
}

function samplePolygonOverlap(poly, testFn, samples) {
  const bounds = boundsOf(poly);
  let hits = 0;
  let total = 0;
  const steps = Math.max(4, samples);
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const p = {
        x: bounds.x + ((i + 0.5) / steps) * bounds.w,
        y: bounds.y + ((j + 0.5) / steps) * bounds.h,
      };
      if (!pointInPolygon(p, poly)) {
        continue;
      }
      total += 1;
      if (testFn(p)) {
        hits += 1;
      }
    }
  }
  if (total === 0) {
    return 0;
  }
  return hits / total;
}

function boundsOf(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    minX = Math.min(minX, points[i].x);
    minY = Math.min(minY, points[i].y);
    maxX = Math.max(maxX, points[i].x);
    maxY = Math.max(maxY, points[i].y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function wallAssistRatio(poly, walls, wallDist) {
  if (poly.length < 2) {
    return 0;
  }
  let near = 0;
  let total = 0;
  const samples = 24;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const edgeLen = dist(a, b);
    const steps = Math.max(1, Math.ceil(edgeLen / 18));
    for (let s = 0; s < steps; s += 1) {
      const t = (s + 0.5) / steps;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      total += 1;
      let closest = Infinity;
      for (let w = 0; w < walls.length; w += 1) {
        closest = Math.min(closest, distPointToAabb(p, walls[w]));
      }
      if (closest <= wallDist) {
        near += 1;
      }
    }
    if (total > samples * 8) {
      break;
    }
  }
  return total === 0 ? 0 : near / total;
}

function findClosingIndex(points, pos, closeRadius, minPath) {
  if (points.length < 8) {
    return -1;
  }
  let traveled = 0;
  for (let i = points.length - 1; i >= 1; i -= 1) {
    traveled += dist(points[i], points[i - 1]);
    if (traveled < minPath) {
      continue;
    }
    if (dist(points[i - 1], pos) <= closeRadius) {
      return i - 1;
    }
  }
  return -1;
}

function densifyPolyline(points, spacing) {
  if (points.length === 0) {
    return [];
  }
  const out = [{ x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const length = dist(a, b);
    const steps = Math.max(1, Math.ceil(length / spacing));
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

window.ObvodGeometry = {
  dist,
  clamp,
  pointInAabb,
  circleHitsAabb,
  distPointToAabb,
  polylineLength,
  polygonArea,
  pointInPolygon,
  polygonCentroid,
  samplePolygonOverlap,
  boundsOf,
  wallAssistRatio,
  findClosingIndex,
  densifyPolyline,
};
