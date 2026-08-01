export const toolsDefinition = [
  {
    type: "function",
    function: {
      name: "list_skills",
      description: "Lists all available skill files (.md) in the skills directory.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_skill",
      description: "Reads the content of a specific skill markdown file.",
      parameters: {
        type: "object",
        properties: {
          skillName: {
            type: "string",
            description: "The name of the skill file to read (e.g., 'festival_marketing_strategy' or 'festival_marketing_strategy.md').",
          },
        },
        required: ["skillName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Searches the web for up-to-date information, news, weather, prices, etc.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scrape_website",
      description: "Scrapes the content of a specific URL.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL of the website to scrape.",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Generates an image based on a descriptive prompt.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "A highly descriptive prompt for the image generation model (focus on subject, lighting, composition).",
          },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_instagram_posts",
      description: "Fetch the most recent posts from any Instagram account (username required). Includes likes, comments, caption, and date.",
      parameters: {
        type: "object",
        properties: {
          username: {
            type: "string",
            description: "Instagram username to fetch posts from (e.g. 'vishal_y_24'). Leave empty for own account.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
    name: "post_to_instagram",
    description: "Posts a photo to your Instagram feed. Login is handled automatically, just call this tool.",
    parameters: {
      type: "object",
      properties: {
        imageUrl: {
          type: "string",
          description: "Direct URL of the image (JPEG/PNG) to post.",
        },
        caption: {
          type: "string",
          description: "The caption to go with the image.",
        },
      },
      required: ["imageUrl", "caption"],
    },
    },
  },
  {
    type: "function",
    function: {
      name: "get_instagram_profile",
      description: "Fetch profile details from any Instagram account (username required). Includes biography, full name, follower/following counts, posts count, and latest post links.",
      parameters: {
        type: "object",
        properties: {
          username: {
            type: "string",
            description: "Instagram username to fetch profile of (e.g. 'its_pooja_067_'). Leave empty for own account.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_instagram_message",
      description: "Sends a direct message (DM) to any Instagram user. Login is handled automatically.",
      parameters: {
        type: "object",
        properties: {
          username: {
            type: "string",
            description: "Instagram username to send the message to (e.g. 'vishal_y_24').",
          },
          message: {
            type: "string",
            description: "The message text to send.",
          },
          mediaPath: {
            type: "string",
            description: "Optional URL or local absolute path of a photo or video to send as an attachment.",
          },
        },
        required: ["username", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp_message",
      description: "Sends a direct message on WhatsApp using WhatsApp Web. First-time execution opens a browser window for QR code scanning.",
      parameters: {
        type: "object",
        properties: {
          recipient: {
            type: "string",
            description: "Target phone number with country code (digits only, e.g. '919876543210') OR contact name (e.g. 'Kirti').",
          },
          message: {
            type: "string",
            description: "The text message to send.",
          }
        },
        required: ["recipient", "message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_video",
      description: "Generates a vertical AI video using Pollinations AI (VEO model) based on a description prompt. Returns the local path to the generated MP4 file.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Descriptive prompt for the video generation (e.g. 'sunset timelapse, cinematic golden hour light').",
          },
          duration: {
            type: "integer",
            description: "Duration of the video in seconds (default is 4).",
          },
          model: {
            type: "string",
            description: "Video model to use (default is 'veo').",
          },
          aspectRatio: {
            type: "string",
            description: "Aspect ratio of the video (e.g. '16:9', '9:16', default is '9:16').",
          },
          audio: {
            type: "boolean",
            description: "Whether to generate synchronized audio track (default is false).",
          }
        },
        required: ["prompt"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "post_video_to_instagram",
      description: "Publishes a video or reel post to your Instagram timeline. Login is handled automatically.",
      parameters: {
        type: "object",
        properties: {
          videoPath: {
            type: "string",
            description: "Local absolute path or URL of the video file to upload.",
          },
          caption: {
            type: "string",
            description: "The caption text / hashtags to post with the video.",
          }
        },
        required: ["videoPath", "caption"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "plan_instagram_reel",
      description: "Generates a structured 30-45s multi-scene script layout, narration, and visual prompts for an Instagram Reel based on a topic.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "The topic of the Instagram Reel (e.g. 'Diwali significance' or 'AI Space Exploration').",
          }
        },
        required: ["topic"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_free_video_asset",
      description: "Generates a free 9:16 vertical image asset to serve as the background or thumbnail for a short video/reel.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Descriptive prompt for the visual asset (e.g. 'mystical temple archway under starry night sky, cinematic lighting, 8k').",
          }
        },
        required: ["prompt"]
      }
    }
  }
];
