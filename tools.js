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
      description: "Publishes a photo post directly to your Instagram account feed.",
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
  }
];
