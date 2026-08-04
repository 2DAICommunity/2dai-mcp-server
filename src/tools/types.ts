import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context.js';

/** Every tool is registered through this one shape, so `server.ts` stays a
 *  list of registrations and the context is injected rather than imported. */
export type RegisterTool = (server: McpServer, ctx: ToolContext) => void;
