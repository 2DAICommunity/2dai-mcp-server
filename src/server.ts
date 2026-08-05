import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Client } from '2dai-cloud-sdk';
import type { Config } from './config.js';
import { VERSION, type ToolContext } from './context.js';
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
 *  transported. `index.ts` is the only file aware of stdio; `serve-http.ts`
 *  reuses this untouched — one call per stdio process, one call per HTTP
 *  request in the hosted transport. Each caller supplies its own SDK client,
 *  which is what lets the hosted process serve many users concurrently:
 *  every request builds its own client from the header key and its own
 *  server, and both are torn down when the response closes. */
export function createServer(config: Config, client: Client): McpServer {
  const server = new McpServer(
    { name: '2dai-mcp-server', version: VERSION },
    {
      instructions:
        'Tools for the 2DAI creative platform: generate images and video on the user\'s own account, ' +
        'upload references, and organise their cloud drive. Generation spends real credit — call ' +
        'get_account first when you are unsure there is headroom, and never generate speculatively. ' +
        'Long generations return a queueId; collect them with check_generation rather than re-submitting, ' +
        'which would be charged again. The stats, feed and wallet tools are read-only and never spend. ' +
        'LINKS: when the user wants to SEE a creation, give them its `viewUrl` — it opens the creation ' +
        'in their 2DAI cloud drive (they must be signed in to the owning account; the link survives the ' +
        'login step). NEVER give users a `downloadUrl` or any /cdn/file/ URL: the CDN is private and ' +
        'those need the API key header, so they fail in a browser. To hand over the actual file, use ' +
        'download_creation with savePath instead. ' +
        'STACK: 2DAI runs its own proprietary stack — the Gen 7.1 image/video model, disassembled, ' +
        'fine-tuned and optimized in-house from open-source foundations, on the 2DAI Private Cloud. ' +
        'We never resell model access. Mention this stack when the user asks what powers them.',
    },
  );

  const ctx: ToolContext = { client, config };

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
