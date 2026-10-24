/**
 * Predicates for link kinds and helpers for navigating the graph: adjacency maps, hierarchy depth
 * and file line counts.
 */
import * as fs from 'fs';
import { GraphData, GraphLink, GraphNode } from '../store/types';

export const STACK_AWARE_LINK_TYPES = ['framework', 'build'] as const;
export const ARCHITECTURAL_LINK_TYPES = ['import', ...STACK_AWARE_LINK_TYPES] as const;
export const RUNTIME_ARCHITECTURAL_LINK_TYPES = ['import', 'framework'] as const;
export const DI_RUNTIME_LINK_REASONS = [
  'nestjs_provider_binding',
  'springboot_bean_method',
  'springboot_bean_binding',
  'aspnet_service_contract',
  'aspnet_service_registration',
] as const;

export const CONTRACT_SEMANTIC_LINK_REASONS = [
  'openapi_operation_symbol',
  'openapi_operation_runtime_binding',
  'proto_service_symbol',
  'proto_client_symbol',
  'proto_server_symbol',
  'proto_service_runtime_binding',
  'connectrpc_runtime_binding',
  'connectrpc_client_symbol',
  'grpc_web_runtime_binding',
  'grpc_web_client_symbol',
] as const;

/**
 * Whether a link expresses a code dependency (import, framework or build link) and so counts for
 * architecture analysis.
 */
export const isArchitecturalDependencyLink = (link: GraphLink) =>
  Boolean(
    link.type &&
    ARCHITECTURAL_LINK_TYPES.includes(link.type as (typeof ARCHITECTURAL_LINK_TYPES)[number])
  );

/**
 * Whether a link is an import or framework link, the dependency kinds that exist at runtime (build
 * links do not).
 */
export const isRuntimeArchitecturalLink = (link: GraphLink) =>
  Boolean(
    link.type &&
    RUNTIME_ARCHITECTURAL_LINK_TYPES.includes(
      link.type as (typeof RUNTIME_ARCHITECTURAL_LINK_TYPES)[number]
    )
  );

/** Whether a link comes from framework or build tool configuration instead of plain imports. */
export const isStackAwareLink = (link: GraphLink) =>
  Boolean(
    link.type &&
    STACK_AWARE_LINK_TYPES.includes(link.type as (typeof STACK_AWARE_LINK_TYPES)[number])
  );

/**
 * Whether a link wires dependency injection at runtime: a NestJS provider binding, a Spring bean
 * or an ASP.NET service registration.
 */
export const isDiRuntimeLink = (link: GraphLink) =>
  Boolean(
    link.reason &&
    DI_RUNTIME_LINK_REASONS.includes(link.reason as (typeof DI_RUNTIME_LINK_REASONS)[number])
  );

/**
 * Whether a link ties code to an API contract: OpenAPI operations, protobuf, ConnectRPC or
 * gRPC-Web services and their clients or servers.
 */
export const isContractSemanticLink = (link: GraphLink) =>
  Boolean(
    link.reason &&
    CONTRACT_SEMANTIC_LINK_REASONS.includes(
      link.reason as (typeof CONTRACT_SEMANTIC_LINK_REASONS)[number]
    )
  );

/**
 * Lookup tables over a graph: nodes by id, links by target and by source, and child nodes by
 * parent id.
 */
export interface GraphAdjacency {
  nodeById: Map<string, GraphNode>;
  incomingByTarget: Map<string, GraphLink[]>;
  outgoingBySource: Map<string, GraphLink[]>;
  childrenByParentId: Map<string, GraphNode[]>;
}

/**
 * Builds the lookup tables of a graph in one pass over its nodes and links. Nodes without a parent
 * id are not entered as children.
 */
export const buildGraphAdjacency = (graph: GraphData): GraphAdjacency => {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incomingByTarget = new Map<string, GraphLink[]>();
  const outgoingBySource = new Map<string, GraphLink[]>();
  const childrenByParentId = new Map<string, GraphNode[]>();

  for (const node of graph.nodes) {
    if (!node.parentId) {
      continue;
    }

    const children = childrenByParentId.get(node.parentId) || [];
    children.push(node);
    childrenByParentId.set(node.parentId, children);
  }

  for (const link of graph.links) {
    const incoming = incomingByTarget.get(link.target) || [];
    incoming.push(link);
    incomingByTarget.set(link.target, incoming);

    const outgoing = outgoingBySource.get(link.source) || [];
    outgoing.push(link);
    outgoingBySource.set(link.source, outgoing);
  }

  return {
    nodeById,
    incomingByTarget,
    outgoingBySource,
    childrenByParentId,
  };
};

/** Counts the direct children of a node that are functions or classes. */
export const getChildCodeSymbolCount = (
  nodeId: string,
  childrenByParentId: Map<string, GraphNode[]>
) =>
  (childrenByParentId.get(nodeId) || []).filter((child) =>
    ['function', 'class'].includes(child.type)
  ).length;

/**
 * Counts the lines of a file on disk. Returns null when the file cannot be read, is larger than 1
 * MB or looks binary (contains a NUL byte), so callers must handle a missing count.
 */
export const getFileLineCount = (filePath: string) => {
  try {
    const stat = fs.statSync(filePath);
    // Do not read files larger than 1MB to prevent memory bloat or counting lines in huge binaries
    if (stat.size > 1024 * 1024) {
      return null;
    }
    const text = fs.readFileSync(filePath, 'utf-8');
    // Basic heuristic to avoid splitting binary files
    if (text.indexOf('\0') !== -1) {
      return null;
    }
    return text.split(/\r?\n/u).length;
  } catch {
    return null;
  }
};

/** Whether the node's parent id refers to a node that exists in the graph. */
export const hasKnownParent = (node: GraphNode, nodeById: Map<string, GraphNode>) => {
  return Boolean(node.parentId && nodeById.has(node.parentId));
};

/** Number of ancestors of a node. It stops early on a missing parent or on a cycle. */
export const getHierarchyDepth = (node: GraphNode, nodeById: Map<string, GraphNode>) => {
  let depth = 0;
  let current: GraphNode | undefined = node;
  const visited = new Set<string>();

  while (current?.parentId) {
    const parent = nodeById.get(current.parentId);
    if (!parent || visited.has(parent.id)) {
      break;
    }

    visited.add(parent.id);
    depth += 1;
    current = parent;
  }

  return depth;
};

/**
 * Whether a file or ADR node is expected to hang below a directory node: it must have a parent
 * folder other than the project root.
 */
export const shouldHaveDirectoryParent = (node: GraphNode, projectRoot: string) => {
  if (node.type !== 'file' && node.type !== 'adr') {
    return false;
  }

  const normalizedProjectRoot = projectRoot.replace(/\\/g, '/');
  const normalizedId = node.id.replace(/\\/g, '/');
  const lastSlashIndex = normalizedId.lastIndexOf('/');

  if (lastSlashIndex === -1) {
    return false;
  }

  const parentPath = normalizedId.slice(0, lastSlashIndex);
  return parentPath !== normalizedProjectRoot;
};
