import { httpRouter } from 'convex/server';
import { mcpHandler, mcpMethodNotAllowed, mcpOptions } from './mcp.js';

const http = httpRouter();

// MCP endpoint: /mcp with Bearer auth, /mcp/<key> for clients that
// cannot send headers (claude.ai connectors). See convex/mcp.ts.
http.route({ path: '/mcp', method: 'POST', handler: mcpHandler });
http.route({ pathPrefix: '/mcp/', method: 'POST', handler: mcpHandler });

http.route({ path: '/mcp', method: 'GET', handler: mcpMethodNotAllowed });
http.route({
	pathPrefix: '/mcp/',
	method: 'GET',
	handler: mcpMethodNotAllowed
});

http.route({ path: '/mcp', method: 'DELETE', handler: mcpMethodNotAllowed });
http.route({
	pathPrefix: '/mcp/',
	method: 'DELETE',
	handler: mcpMethodNotAllowed
});

http.route({ path: '/mcp', method: 'OPTIONS', handler: mcpOptions });
http.route({ pathPrefix: '/mcp/', method: 'OPTIONS', handler: mcpOptions });

export default http;
