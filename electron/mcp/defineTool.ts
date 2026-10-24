/** Typed wrappers around `McpServer.registerTool` so tool handlers get arguments inferred from their schema. */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { GraphData } from '../store';
import { ensureGraphLoaded } from './utils';

/** Name, display text and input shape of one MCP tool. */
export interface ToolSpec<Shape extends z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  inputSchema: Shape;
}

/** The arguments a handler receives, derived from the tool's input schema. */
export type ToolArgs<Shape extends z.ZodRawShape> = z.output<z.ZodObject<Shape>>;

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

type MaybePromise<T> = T | Promise<T>;

/** Registers a tool whose handler arguments are typed by its schema instead of repeated by hand. */
export function defineTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  spec: ToolSpec<Shape>,
  handler: (args: ToolArgs<Shape>) => MaybePromise<ToolResponse>
) {
  const { name, ...config } = spec;
  // The SDK types the callback from the schema; the handler type above already guarantees it.
  server.registerTool(name, config, handler as never);
}

/** A tool that works on the loaded project graph (the `projectPath` argument, if any, opens it). */
export function defineGraphTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  spec: ToolSpec<Shape>,
  handler: (graph: GraphData, args: ToolArgs<Shape>) => MaybePromise<ToolResponse>
) {
  defineTool(server, spec, async (args) =>
    handler(await ensureGraphLoaded((args as { projectPath?: string }).projectPath), args)
  );
}
