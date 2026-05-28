import * as fs from 'fs';
import { GraphData, GraphLink, GraphNode } from '../store';

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

export const isArchitecturalDependencyLink = (link: GraphLink) =>
  Boolean(link.type && ARCHITECTURAL_LINK_TYPES.includes(link.type as (typeof ARCHITECTURAL_LINK_TYPES)[number]));

export const isRuntimeArchitecturalLink = (link: GraphLink) =>
  Boolean(
    link.type &&
      RUNTIME_ARCHITECTURAL_LINK_TYPES.includes(
        link.type as (typeof RUNTIME_ARCHITECTURAL_LINK_TYPES)[number]
      )
  );

export const isStackAwareLink = (link: GraphLink) =>
  Boolean(link.type && STACK_AWARE_LINK_TYPES.includes(link.type as (typeof STACK_AWARE_LINK_TYPES)[number]));

export const isDiRuntimeLink = (link: GraphLink) =>
  Boolean(
    link.reason &&
      DI_RUNTIME_LINK_REASONS.includes(link.reason as (typeof DI_RUNTIME_LINK_REASONS)[number])
  );

export const isContractSemanticLink = (link: GraphLink) =>
  Boolean(
    link.reason &&
      CONTRACT_SEMANTIC_LINK_REASONS.includes(
        link.reason as (typeof CONTRACT_SEMANTIC_LINK_REASONS)[number]
      )
  );

export interface GraphAdjacency {
  nodeById: Map<string, GraphNode>;
  incomingByTarget: Map<string, GraphLink[]>;
  outgoingBySource: Map<string, GraphLink[]>;
  childrenByParentId: Map<string, GraphNode[]>;
}

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

export const getChildCodeSymbolCount = (
  nodeId: string,
  childrenByParentId: Map<string, GraphNode[]>
) =>
  (childrenByParentId.get(nodeId) || []).filter((child) =>
    ['function', 'class'].includes(child.type)
  ).length;

export const getFileLineCount = (filePath: string) => {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    return text.split(/\r?\n/u).length;
  } catch {
    return null;
  }
};

export const hasKnownParent = (node: GraphNode, nodeById: Map<string, GraphNode>) => {
  return Boolean(node.parentId && nodeById.has(node.parentId));
};

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
