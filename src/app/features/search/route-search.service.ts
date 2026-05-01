import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { METRO_OPERATORS, type MetroOperatorId } from '../../core/tdx';
import { MetroService } from '../metro';
import type { MetroNetwork, MetroStation } from '../metro';

export interface SearchableStation {
  /** Globally unique. */
  readonly id: string;
  readonly stationId: string;
  readonly operatorId: MetroOperatorId;
  readonly name: { readonly zh: string; readonly en: string };
  readonly lineIds: readonly string[];
}

export interface RoutePath {
  readonly stations: readonly SearchableStation[];
  /** Total cost in graph units (one station = 1, line transfer = TRANSFER_COST). */
  readonly cost: number;
  /** Number of distinct lines traversed (1 = no transfer). */
  readonly transfers: number;
}

export const TRANSFER_COST = 5;

/**
 * Cross-line Metro route search. TRTC + TYMC stations form one graph;
 * stations sharing the same `(operator, lineId)` are linked by single
 * edges (cost 1), and a synthetic `(stationId)` node bridges TRTC/TYMC
 * stations with the same `stationId` (cost 0) so the user can change
 * operators when both serve the same physical interchange.
 *
 * Phase 6.1 keeps the graph metro-only; cross-mode (Bus/TRA) is deferred
 * to Phase 8.
 */
@Injectable({ providedIn: 'root' })
export class RouteSearchService {
  private readonly metro = inject(MetroService);

  private graph: Map<string, Map<string, number>> | null = null;
  private stationIndex: Map<string, SearchableStation> | null = null;

  /** Pre-loads metro networks and builds the graph. Idempotent. */
  ensureGraph(): Observable<void> {
    if (this.graph) return new Observable((s) => {
      s.next();
      s.complete();
    });
    const ops = Object.keys(METRO_OPERATORS) as MetroOperatorId[];
    return forkJoin(ops.map((op) => this.metro.fetchNetwork(op))).pipe(
      map((networks) => {
        this.buildGraph(networks);
      })
    );
  }

  search(fromId: string, toId: string): RoutePath | null {
    if (!this.graph || !this.stationIndex) return null;
    const path = dijkstra(this.graph, fromId, toId);
    if (!path) return null;
    const stations = path.nodes
      .map((id) => this.stationIndex!.get(id))
      .filter((s): s is SearchableStation => !!s);
    const transfers = countLineChanges(stations);
    return { stations, cost: path.cost, transfers };
  }

  /** Snapshot of all known stations, used by the search panel for autocomplete. */
  allStations(): readonly SearchableStation[] {
    if (!this.stationIndex) return [];
    return [...this.stationIndex.values()];
  }

  private buildGraph(networks: readonly MetroNetwork[]): void {
    const graph = new Map<string, Map<string, number>>();
    const index = new Map<string, SearchableStation>();
    const lineSequences = new Map<string, MetroStation[]>();

    for (const net of networks) {
      for (const s of net.stations) {
        index.set(s.id, {
          id: s.id,
          stationId: s.stationId,
          operatorId: s.operatorId,
          name: s.name,
          lineIds: s.lineIds,
        });
        ensure(graph, s.id);
      }
      // Group by line, ordered by station list as TDX returns it (good enough
      // for adjacency — TDX StationOfLine sequence is stable per operator).
      for (const s of net.stations) {
        for (const lineId of s.lineIds) {
          const lineKey = `${net.operatorId}-${lineId}`;
          const list = lineSequences.get(lineKey) ?? [];
          list.push(s);
          lineSequences.set(lineKey, list);
        }
      }
    }

    // Adjacency: consecutive stations on the same line are connected.
    for (const list of lineSequences.values()) {
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1];
        const b = list[i];
        addEdge(graph, a.id, b.id, 1);
      }
    }

    // Cross-operator interchange: stations sharing physical name (zh) get
    // a cheap free-transfer edge. Approximate but works for major xfers.
    const byName = new Map<string, SearchableStation[]>();
    for (const s of index.values()) {
      const arr = byName.get(s.name.zh) ?? [];
      arr.push(s);
      byName.set(s.name.zh, arr);
    }
    for (const arr of byName.values()) {
      if (arr.length < 2) continue;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          addEdge(graph, arr[i].id, arr[j].id, 0);
        }
      }
    }

    this.graph = graph;
    this.stationIndex = index;
  }
}

function ensure(graph: Map<string, Map<string, number>>, k: string): void {
  if (!graph.has(k)) graph.set(k, new Map());
}

function addEdge(
  graph: Map<string, Map<string, number>>,
  a: string,
  b: string,
  cost: number
): void {
  ensure(graph, a);
  ensure(graph, b);
  const prevAB = graph.get(a)!.get(b);
  if (prevAB === undefined || cost < prevAB) graph.get(a)!.set(b, cost);
  const prevBA = graph.get(b)!.get(a);
  if (prevBA === undefined || cost < prevBA) graph.get(b)!.set(a, cost);
}

interface DijkstraResult {
  readonly nodes: readonly string[];
  readonly cost: number;
}

function dijkstra(
  graph: Map<string, Map<string, number>>,
  from: string,
  to: string
): DijkstraResult | null {
  if (!graph.has(from) || !graph.has(to)) return null;
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const visited = new Set<string>();
  dist.set(from, 0);
  prev.set(from, null);

  // Naive priority queue: scan unvisited entries in `dist`. ~3000 stations
  // ⇒ O(V²) ≈ 9M ops worst case, runs in <50ms.
  while (true) {
    let bestId: string | null = null;
    let bestCost = Infinity;
    for (const [id, c] of dist) {
      if (!visited.has(id) && c < bestCost) {
        bestCost = c;
        bestId = id;
      }
    }
    if (bestId === null) break;
    if (bestId === to) break;
    visited.add(bestId);
    const neighbours = graph.get(bestId);
    if (!neighbours) continue;
    for (const [nb, w] of neighbours) {
      if (visited.has(nb)) continue;
      const nc = bestCost + w;
      if (nc < (dist.get(nb) ?? Infinity)) {
        dist.set(nb, nc);
        prev.set(nb, bestId);
      }
    }
  }

  if (!dist.has(to)) return null;

  // Reconstruct path.
  const nodes: string[] = [];
  let cur: string | null = to;
  while (cur !== null) {
    nodes.unshift(cur);
    cur = prev.get(cur) ?? null;
  }
  return { nodes, cost: dist.get(to)! };
}

function countLineChanges(stations: readonly SearchableStation[]): number {
  if (stations.length === 0) return 0;
  let prevLines = new Set(stations[0].lineIds);
  let changes = 0;
  for (let i = 1; i < stations.length; i++) {
    const cur = new Set(stations[i].lineIds);
    const overlap = [...cur].some((l) => prevLines.has(l));
    if (!overlap) changes++;
    prevLines = cur;
  }
  return changes;
}
