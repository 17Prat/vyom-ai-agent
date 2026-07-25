import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const IG_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
const GRAPH_API_VERSION = 'v20.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

if (!INSTAGRAM_ACCESS_TOKEN || !IG_ACCOUNT_ID) {
  console.error("Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ACCOUNT_ID in environment variables.");
  process.exit(1);
}

// Create MCP Server
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

// Register Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_instagram_profile",
        description: "Fetch the basic profile information, followers count, and bio of the connected Instagram Business account.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_recent_posts",
        description: "Fetch the most recent posts (up to 10) from the Instagram account, including like counts and comments counts.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "publish_instagram_post",
        description: "Publish a new image post to Instagram. Requires a direct image URL (must be public) and a caption.",
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

// Handle Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "get_instagram_profile": {
        const url = `${BASE_URL}/${IG_ACCOUNT_ID}?fields=id,username,followers_count,follows_count,media_count,name,biography,profile_picture_url&access_token=${INSTAGRAM_ACCESS_TOKEN}`;
        const response = await axios.get(url);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "get_recent_posts": {
        const url = `${BASE_URL}/${IG_ACCOUNT_ID}/media?fields=id,caption,media_type,media_url,like_count,comments_count,timestamp&limit=10&access_token=${INSTAGRAM_ACCESS_TOKEN}`;
        const response = await axios.get(url);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "publish_instagram_post": {
        const { imageUrl, caption } = request.params.arguments;
        
        // Step 1: Create media container
        const createMediaUrl = `${BASE_URL}/${IG_ACCOUNT_ID}/media`;
        const createParams = new URLSearchParams({
          image_url: imageUrl,
          caption: caption,
          access_token: INSTAGRAM_ACCESS_TOKEN
        });
        
        let containerRes;
        try {
          containerRes = await axios.post(createMediaUrl, createParams);
        } catch (error) {
          throw new Error(`Failed to create media container: ${error.response?.data?.error?.message || error.message}`);
        }

        const creationId = containerRes.data.id;
        if (!creationId) {
          throw new Error("Failed to get creation_id from Instagram.");
        }

        // Step 2: Publish media container
        const publishUrl = `${BASE_URL}/${IG_ACCOUNT_ID}/media_publish`;
        const publishParams = new URLSearchParams({
          creation_id: creationId,
          access_token: INSTAGRAM_ACCESS_TOKEN
        });

        const publishRes = await axios.post(publishUrl, publishParams);

        return {
          content: [
            {
              type: "text",
              text: `Successfully published Instagram post! Post ID: ${publishRes.data.id}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.message;
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

// Start Stdio Server Transport
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Brahmand Instagram MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
