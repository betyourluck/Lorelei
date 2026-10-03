"use client";

/**
 * 枠をまたぐ線の経路を、図全体で 1 回に計算して線ごとに配る (spec 17 D4、裁定 3 の案 iii)。
 * エディタが xyflow のストアを見て routeEdges を呼び、線は自分の経路だけを購読する (変わらなければ描き直さない)。
 * ドラッグ中は、動いたノード・枠と関わる線だけを探し直し、ドラッグを終えたら全部を探し直す
 */
import { useStoreApi, type Edge, type InternalNode, type Node } from "@xyflow/react";
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import {
  bezierPolyline,
  ROUTE,
  routeEdges,
  type EdgeRoute,
  type RouteBox,
  type RouteEdgeInput,
} from "../utils/edge-route";
import type { HandleSide, Point } from "../utils/frame-edit";
import { SUBGRAPH_NODE_TYPE } from "../utils/subgraph-tree";

/** 線ごとの経路の入れ物。線は自分の ID だけを購読する */
export class EdgeRouteStore {
  private routes = new Map<string, EdgeRoute>();
  private listeners = new Map<string, Set<() => void>>();

  get(id: string): EdgeRoute | undefined {
    return this.routes.get(id);
  }

  subscribe(id: string, fn: () => void): () => void {
    const set = this.listeners.get(id) ?? new Set();
    set.add(fn);
    this.listeners.set(id, set);
    return () => set.delete(fn);
  }

  /** 中身が変わった線だけを知らせる (変わらない線は前の値をそのまま持つ) */
  replace(next: Map<string, EdgeRoute>): void {
    const changed = new Set<string>();
    for (const [id, r] of Array.from(next)) {
      const old = this.routes.get(id);
      if (old && sameRoute(old, r)) next.set(id, old);
      else changed.add(id);
    }
    for (const id of Array.from(this.routes.keys())) if (!next.has(id)) changed.add(id);
    this.routes = next;
    changed.forEach((id) => this.listeners.get(id)?.forEach((fn) => fn()));
  }
}

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const sameRoute = (a: EdgeRoute, b: EdgeRoute) =>
  samePoint(a.label, b.label) &&
  a.points.length === b.points.length &&
  a.points.every((p, i) => samePoint(p, b.points[i]));

export const EdgeRouteContext = createContext<EdgeRouteStore | null>(null);

const noop = () => () => {};
/** この線の回した経路。回さない線 (と、エディタの外で描く線) は undefined */
export function useEdgeRoute(id: string): EdgeRoute | undefined {
  const store = useContext(EdgeRouteContext);
  return useSyncExternalStore(
    store ? (fn) => store.subscribe(id, fn) : noop,
    () => store?.get(id),
    () => undefined
  );
}

/**
 * ラベルのボタンの大きさの見積もり (P0 の 6: ラベルが空で 101×28、文字は折り返さずに伸びる。12px の字で、全角 12・半角 7)
 */
export function estimateButtonSize(label: string): { width: number; height: number } {
  if (!label) return { width: 101, height: 28 };
  const text = Array.from(label).reduce((w, ch) => w + (ch.charCodeAt(0) <= 0xff ? 7 : 12), 0);
  return { width: Math.max(101, 88 + text), height: 28 };
}

/** xyflow の getHandlePosition と同じ置き方 (接続点の辺の中央) */
function handlePoint(
  node: InternalNode,
  type: "source" | "target"
): (Point & { side: HandleSide }) | null {
  const h = node.internals.handleBounds?.[type]?.[0];
  if (!h) return null;
  const { x, y } = node.internals.positionAbsolute;
  const side = h.position as HandleSide;
  const px = side === "left" ? h.x : side === "right" ? h.x + h.width : h.x + h.width / 2;
  const py = side === "top" ? h.y : side === "bottom" ? h.y + h.height : h.y + h.height / 2;
  return { x: x + px, y: y + py, side };
}

function boxesOf(lookup: Map<string, InternalNode>): RouteBox[] {
  const out: RouteBox[] = [];
  lookup.forEach((n) => {
    const width = n.measured?.width ?? n.width;
    const height = n.measured?.height ?? n.height;
    if (width === undefined || height === undefined) return;
    out.push({
      id: n.id,
      x: n.internals.positionAbsolute.x,
      y: n.internals.positionAbsolute.y,
      width,
      height,
      frame: n.type === SUBGRAPH_NODE_TYPE,
      z: n.internals.z,
      ...(n.parentId !== undefined ? { parentId: n.parentId } : {}),
    });
  });
  return out;
}

function edgeInputsOf(lookup: Map<string, InternalNode>, edges: Edge[]): RouteEdgeInput[] {
  const out: RouteEdgeInput[] = [];
  for (const e of edges) {
    const s = lookup.get(e.source);
    const t = lookup.get(e.target);
    if (!s || !t) continue;
    const from = handlePoint(s, "source");
    const to = handlePoint(t, "target");
    if (!from || !to) continue;
    const label = String((e.data as { label?: unknown } | undefined)?.label ?? "");
    out.push({
      id: e.id,
      source: e.source,
      target: e.target,
      from,
      to,
      button: estimateButtonSize(label),
    });
  }
  return out;
}

const boxKey = (b: RouteBox) =>
  `${b.x},${b.y},${b.width},${b.height},${b.parentId ?? ""},${b.z},${b.frame}`;
const edgeKey = (e: RouteEdgeInput) =>
  `${e.source}>${e.target}|${e.from.x},${e.from.y},${e.from.side}|${e.to.x},${e.to.y},${e.to.side}|${e.button.width}`;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const boundsOf = (pts: Point[], m: number): Rect => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs) - m;
  const y = Math.min(...ys) - m;
  return { x, y, width: Math.max(...xs) + m - x, height: Math.max(...ys) + m - y };
};
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/**
 * ドラッグ中に使い回せる線 (D4 の案 iii): 端が動いておらず、動いたノード・枠の前と今の矩形が、
 * その線の前の道筋 (回していなければ今の曲線) の範囲にかからない線
 */
export function reusableEdges(
  prevBoxes: Map<string, string>,
  boxes: RouteBox[],
  prevEdges: Map<string, string>,
  edges: RouteEdgeInput[],
  cache: Map<string, Point[] | null>,
  prevRects: Map<string, Rect>
): Set<string> {
  const moved: Rect[] = [];
  const movedIds = new Set<string>();
  for (const b of boxes) {
    if (prevBoxes.get(b.id) !== boxKey(b)) {
      movedIds.add(b.id);
      moved.push(b);
      const old = prevRects.get(b.id);
      if (old) moved.push(old);
    }
  }
  for (const id of Array.from(prevBoxes.keys())) {
    if (!boxes.some((b) => b.id === id)) {
      const old = prevRects.get(id);
      if (old) moved.push(old);
    }
  }
  const reuse = new Set<string>();
  for (const e of edges) {
    if (prevEdges.get(e.id) !== edgeKey(e) || !cache.has(e.id)) continue;
    if (movedIds.has(e.source) || movedIds.has(e.target)) continue;
    const kept = cache.get(e.id);
    const area = boundsOf(kept ?? bezierPolyline(e.from, e.to), 2 * ROUTE.MARGIN);
    if (moved.some((r) => overlap(r, area))) continue;
    reuse.add(e.id);
  }
  return reuse;
}

/** ドラッグ中にこれより重かった計算の後は、次の計算を遅らせる */
const SLOW_RUN_MS = 8;

/**
 * エディタで 1 回呼ぶ。xyflow のストアのノード・線が変わるたびに経路を計算し、返す入れ物へ入れる
 */
export function useEdgeRouting(): EdgeRouteStore {
  const storeApi = useStoreApi<Node, Edge>();
  const [store] = useState(() => new EdgeRouteStore());

  useEffect(() => {
    const cache = new Map<string, Point[] | null>();
    let prevBoxes = new Map<string, string>();
    let prevRects = new Map<string, Rect>();
    let prevEdges = new Map<string, string>();
    let wasDragging = false;

    const run = () => {
      const state = storeApi.getState();
      const boxes = boxesOf(state.nodeLookup);
      const edges = edgeInputsOf(state.nodeLookup, state.edges);
      const boxMap = new Map(boxes.map((b) => [b.id, boxKey(b)]));
      const edgeMap = new Map(edges.map((e) => [e.id, edgeKey(e)]));
      const dragging = state.nodes.some((n) => n.dragging);
      const same =
        boxMap.size === prevBoxes.size &&
        Array.from(boxMap).every(([id, k]) => prevBoxes.get(id) === k) &&
        edgeMap.size === prevEdges.size &&
        Array.from(edgeMap).every(([id, k]) => prevEdges.get(id) === k);
      // ドラッグを終えた時は、形が変わっていなくても全部を探し直す (重なりの離し方は全部を見て決まる)
      if (same && !(wasDragging && !dragging)) return;
      const reuse = dragging
        ? reusableEdges(prevBoxes, boxes, prevEdges, edges, cache, prevRects)
        : new Set<string>();
      store.replace(routeEdges(boxes, edges, { cache, reuse }));
      prevBoxes = boxMap;
      prevRects = new Map(
        boxes.map((b) => [b.id, { x: b.x, y: b.y, width: b.width, height: b.height }])
      );
      prevEdges = edgeMap;
      wasDragging = dragging;
    };

    // 知らせは 1 フレームに 1 回にまとめる (取り込みの直後はノードを 1 つ測るたびに知らせが来る)。
    // ドラッグ中で前の計算が重かった時は、その時間の 2 倍だけ次を遅らせる (ノードは毎フレーム動き、回した線は少し遅れて付いてくる。
    // ノード 110・線 150 で回す線 58 本の図で、ドラッグ中の 1 回が 22ms。P1 の画面)
    let frame: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastCost = 0;
    const timedRun = () => {
      const t0 = performance.now();
      run();
      lastCost = performance.now() - t0;
    };
    const schedule = () => {
      if (frame !== null || timer !== null) return;
      const dragging = storeApi.getState().nodes.some((n) => n.dragging);
      if (dragging && lastCost > SLOW_RUN_MS) {
        timer = setTimeout(() => {
          timer = null;
          timedRun();
        }, lastCost * 2);
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = null;
        timedRun();
      });
    };
    run();
    // xyflow はノードを測った後に nodeLookup を書き換えて set({}) で知らせる (nodes・edges の参照は変わらない) ので、
    // 参照では絞らず、画面の移動・拡大だけが変わった時を飛ばす。形が同じかは run の中で比べる
    const unsubscribe = storeApi.subscribe((state, prev) => {
      if (
        state.transform !== prev.transform &&
        state.nodes === prev.nodes &&
        state.edges === prev.edges
      )
        return;
      schedule();
    });
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
    };
  }, [storeApi, store]);

  return store;
}
