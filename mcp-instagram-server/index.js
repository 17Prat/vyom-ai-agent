import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { IgApiClient } from "instagram-private-api";
import dotenv from "dotenv";

dotenv.config();

const IG_USERNAME = process.env.IG_USERNAME;
const IG_PASSWORD = process.env.IG_PASSWORD;

if (!IG_USERNAME || !IG_PASSWORD) {
  console.error("Missing IG_USERNAME or IG_PASSWORD in environment variables.");
  process.exit(1);
}

const server = new Server(
  {
    name: "brahmand-instagram-connector",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

async function login() {
  const ig = new IgApiClient();
  ig.state.generateDevice(IG_USERNAME);
  await ig.simulate.preLoginFlow();
  const user = await ig.account.login(IG_USERNAME, IG_PASSWORD);
  process.nextTick(() =>
    ig.simulate.postLoginFlow().catch(() => {})
  );
  return { ig, user };
}

function handleError(error) {
  const msg = error.message?.toLowerCase() || "";
  if (msg.includes("checkpoint") || msg.includes("challenge") || msg.includes("467") || msg.includes("400") || msg.includes("verification")) {
    return "Instagram Security Block: Instagram requires a login confirmation. Please open your Instagram app on your phone, look for the 'Was This You?' security popup, click 'This Was Me', and then retry this query in a moment.";
  }
  return error.message || "Unknown error";
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_instagram_profile",
        description: "Fetch your Instagram profile details including username, full name, bio, follower count, following count, and media count.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_recent_posts",
        description: "Fetch your most recent Instagram posts (up to 10) with caption, like count, and comment count.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "publish_instagram_post",
        description: "Publish a new photo post to Instagram. Requires a public image URL and a caption.",
        inputSchema: {
          type: "object",
          properties: {
            imageUrl: {
              type: "string",
              description: "Direct URL to the public image (JPEG/PNG) to publish.",
            },
            caption: {
              type: "string",
              description: "The caption to include with the image.",
            },
          },
          required: ["imageUrl", "caption"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "get_instagram_profile": {
        const { ig, user } = await login();
        const accountDetails = await ig.account.currentUser();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                username: accountDetails.username,
                full_name: accountDetails.full_name,
                biography: accountDetails.biography,
                follower_count: accountDetails.follower_count,
                following_count: accountDetails.following_count,
                media_count: accountDetails.media_count,
                is_private: accountDetails.is_private || false,
              }, null, 2),
            },
          ],
        };
      }

      case "get_recent_posts": {
        const { ig, user } = await login();
        const userFeed = ig.feed.user(user.pk);
        const items = await userFeed.items();
        const posts = items.slice(0, 10).map(item => ({
          id: item.id,
          caption: item.caption?.text || "No caption",
          like_count: item.like_count,
          comment_count: item.comment_count,
          media_type: item.media_type === 1 ? "image" : item.media_type === 2 ? "video" : "carousel",
          url: `https://instagram.com/p/${item.code}`,
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(posts, null, 2),
            },
          ],
        };
      }

      case "publish_instagram_post": {
        const { imageUrl, caption } = request.params.arguments;
        if (!imageUrl || !imageUrl.startsWith("http")) {
          throw new Error("Please provide a valid absolute image URL (starting with http:// or https://).");
        }

        const { ig } = await login();

        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());

        const publishResult = await ig.publish.photo({
          file: buffer,
          caption: caption,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                media_id: publishResult.media.id,
                url: `https://instagram.com/p/${publishResult.media.code}`,
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    const errorMsg = handleError(error);
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${request.params.name}: ${errorMsg}`,
        },
      ],
      isError: true,
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Brahmand Instagram MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
