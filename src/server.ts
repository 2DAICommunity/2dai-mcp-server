import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from './config.js';
import { createClient, VERSION, type ToolContext } from './context.js';
import { registerGetAccount } from './tools/get-account.js';
import { registerGenerateImage } from './tools/generate-image.js';
import { registerGenerateWithRefs } from './tools/generate-with-refs.js';
import { registerGenerateVideo } from './tools/generate-video.js';
import { registerGenerateSimilar } from './tools/generate-similar.js';
import { registerGenerateWallpaper } from './tools/generate-wallpaper.js';
import { registerCheckGeneration } from './tools/check-generation.js';
import { registerCancelGeneration } from './tools/cancel-generation.js';
import { registerUploadImage } from './tools/upload-image.js';
import { registerDownloadCreation } from './tools/download-creation.js';
import { registerListCreations } from './tools/list-creations.js';
import { registerBrowseFeed } from './tools/browse-feed.js';
import { registerListFolders } from './tools/list-folders.js';
import { registerManageFolder } from './tools/manage-folder.js';
import { registerOrganiseCreation } from './tools/organise-creation.js';
import { registerPublishCreation } from './tools/publish-creation.js';
import { registerGetStats } from './tools/get-stats.js';
import { registerGetWalletStatus } from './tools/get-wallet-status.js';
import { registerGetLock } from './tools/get-lock.js';
import { registerGetWalletHistory } from './tools/get-wallet-history.js';
import { registerGetTokenPrice } from './tools/get-token-price.js';

/** Builds a fully configured MCP server, knowing nothing about how it will be
 *  transported. `index.ts` is the only file aware of stdio; a future
 *  `serve-http.ts` for mcp.2dai.io reuses this untouched, which is the whole
 *  point of the split. */
export function createServer(config: Config): McpServer {
  const server = new McpServer(
    { name: '2dai-mcp-server', version: VERSION },
    {
      instructions:
        'Tools for the 2DAI creative platform: generate images and video on the user\'s own account, ' +
        'upload references, and organise their cloud drive. Generation spends real credit — call ' +
        'get_account first when you are unsure there is headroom, and never generate speculatively. ' +
        'Long generations return a queueId; collect them with check_generation rather than re-submitting, ' +
        'which would be charged again. The stats, feed and wallet tools are read-only and never spend.',
    },
  );

  const ctx: ToolContext = { client: createClient(config), config };

  registerGetAccount(server, ctx);
  registerGenerateImage(server, ctx);
  registerGenerateWithRefs(server, ctx);
  registerGenerateVideo(server, ctx);
  registerGenerateSimilar(server, ctx);
  registerGenerateWallpaper(server, ctx);
  registerCheckGeneration(server, ctx);
  registerCancelGeneration(server, ctx);
  registerUploadImage(server, ctx);
  registerDownloadCreation(server, ctx);
  registerListCreations(server, ctx);
  registerBrowseFeed(server, ctx);
  registerListFolders(server, ctx);
  registerManageFolder(server, ctx);
  registerOrganiseCreation(server, ctx);
  registerPublishCreation(server, ctx);
  registerGetStats(server, ctx);
  registerGetWalletStatus(server, ctx);
  registerGetLock(server, ctx);
  registerGetWalletHistory(server, ctx);
  registerGetTokenPrice(server, ctx);

  return server;
}
