// Minimal disjoint-set structure used to merge matching regions into clone groups.

/**
 * Disjoint sets over integer nodes with path compression; nodes are created by `add` and start in
 * their own set.
 */
export class UnionFind {
  private readonly parent: number[] = [];
  /** Creates a new node in its own set and returns its number. */
  add(): number {
    this.parent.push(this.parent.length);
    return this.parent.length - 1;
  }
  /** Representative of the node's set; compresses the path so later lookups are near constant. */
  find(node: number): number {
    let root = node;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[node] !== root) {
      const next = this.parent[node];
      this.parent[node] = root;
      node = next;
    }
    return root;
  }
  /** Merges the sets of the two nodes; a no-op when they already share a set. */
  union(a: number, b: number) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent[rootB] = rootA;
  }
}
