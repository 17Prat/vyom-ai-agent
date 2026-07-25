import puppeteer from "puppeteer-core";

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

async function withBrowser(fn) {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox"]
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

function newPage(page) {
  page.setViewport({ width: 1280, height: 800 });
  page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
}

function parseNum(str) {
  if (!str) return 0;
  const num = str.replace(/,/g, "").trim();
  if (num.endsWith("M")) return Math.round(parseFloat(num) * 1000000);
  if (num.endsWith("K")) return Math.round(parseFloat(num) * 1000);
  return parseInt(num) || 0;
}

function parsePostMeta(ogDesc) {
  if (!ogDesc) return null;
  const likeMatch = ogDesc.match(/([\d,]+[KM]?)\s*like[s]?/i);
  const commentMatch = ogDesc.match(/([\d,]+[KM]?)\s*comment[s]?/i);
  const dateMatch = ogDesc.match(/on\s+(\w+\s+\d+,\s*\d{4})/);
  const colonIdx = ogDesc.indexOf(": ");
  let caption = colonIdx > 0 ? ogDesc.substring(colonIdx + 2).trim() : "";
  caption = caption.replace(/^"+|"\.?$/g, "").trim();
  return {
    likes: parseNum(likeMatch?.[1]),
    comments: parseNum(commentMatch?.[1]),
    date: dateMatch ? dateMatch[1] : "",
    caption: caption
  };
}

function parseProfileMeta(ogDesc) {
  if (!ogDesc) return null;
  const match = ogDesc.match(/([\d,]+[KM]?)\s*Followers?,\s*([\d,]+[KM]?)\s*Following,\s*([\d,]+[KM]?)\s*Posts?\s*-\s*See Instagram photos and videos from\s*(.+?)\s*\(@(\w+)\)/i);
  if (!match) return null;
  return {
    username: match[5],
    full_name: match[4].trim(),
    follower_count: parseNum(match[1]),
    following_count: parseNum(match[2]),
    media_count: parseNum(match[3]),
  };
}

function parseProfileHeader(headerText) {
  const lines = headerText.split("\n").filter(l => l.trim());
  let username = "", fullName = "", followers = "", following = "";
  const bioLines = [];
  for (const line of lines) {
    if (line.includes(" followers") || line.includes(" follower")) {
      followers = line.replace(/ followers?/, "").trim();
    }
    else if (line.includes(" following")) following = line.replace(" following", "").trim();
    else if (line.match(/^[\d,]+[KM]?\s*posts?$/i)) continue;
    else if (!username) username = line;
    else if (!fullName) fullName = line;
    else bioLines.push(line);
  }
  return {
    username,
    full_name: fullName,
    biography: bioLines.join("\n"),
    follower_count: parseNum(followers),
    following_count: parseNum(following),
  };
}

export async function getInstagramProfileInfo(targetUsername) {
  return await withBrowser(async (browser) => {
    const page = await browser.newPage();
    newPage(page);

    await page.goto(`https://www.instagram.com/${targetUsername}/`, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    // Scroll to trigger lazy-loaded posts
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 1500));

    const metaDesc = await page.evaluate(() => {
      const m = document.querySelector('meta[property="og:description"]');
      const m2 = document.querySelector('meta[name="description"]');
      return { og: m?.content || null, name: m2?.content || null };
    });

    const metaProfile = parseProfileMeta(metaDesc.og);

    // Extract bio from meta[name="description"] if available
    // Format: "617K Followers, ... - Name (@user) on Instagram: \"bio text\""
    let bioFromMeta = "";
    if (metaDesc.name) {
      const bioMatch = metaDesc.name.match(/on Instagram:\s*"(.+)"$/);
      if (bioMatch) bioFromMeta = bioMatch[1].trim();
    }

    const headerData = await page.evaluate(() => {
      const header = document.querySelector("header");
      if (!header) return null;
      const text = header.innerText || "";
      const postLinks = Array.from(document.querySelectorAll("article a")).map(a => ({
        href: a.href,
        type: a.href.includes("/reel/") ? "reel" : "post"
      }));
      return { headerText: text, postLinks: postLinks.slice(0, 12) };
    });

    const profile = headerData ? parseProfileHeader(headerData.headerText) : {};

    return JSON.stringify({
      username: profile.username || metaProfile?.username || targetUsername,
      full_name: profile.full_name || metaProfile?.full_name || "",
      biography: bioFromMeta || profile.biography || "No bio available",
      follower_count: profile.follower_count || metaProfile?.follower_count || 0,
      following_count: profile.following_count || metaProfile?.following_count || 0,
      media_count: metaProfile?.media_count || 0,
      is_private: headerData?.headerText?.includes("This account is private") || false,
      latest_posts: (headerData?.postLinks || []).slice(0, 6).map(l => l.href)
    }, null, 2);
  });
}

export async function getInstagramRecentMedia(targetUsername) {
  return await withBrowser(async (browser) => {
    const page = await browser.newPage();
    newPage(page);

    await page.goto(`https://www.instagram.com/${targetUsername}/`, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 1500));

    const postLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("article a")).slice(0, 6).map(a => ({
        href: a.href,
        type: a.href.includes("/reel/") ? "reel" : "post"
      }));
    });

    const posts = [];
    for (const link of postLinks) {
      try {
        await page.goto(link.href, { waitUntil: "networkidle2", timeout: 20000 });
        await new Promise(r => setTimeout(r, 2000));

        const postData = await page.evaluate(() => {
          const m = document.querySelector('meta[property="og:description"]');
          const image = document.querySelector('meta[property="og:image"]');
          const video = document.querySelector('meta[property="og:video"]');
          return {
            ogDesc: m?.content || null,
            ogImage: image?.content || null,
            ogVideo: video?.content || null,
          };
        });

        const meta = parsePostMeta(postData.ogDesc);
        posts.push({
          url: link.href,
          type: link.type,
          caption: meta?.caption || "",
          likes: meta?.likes || 0,
          comments: meta?.comments || 0,
          date: meta?.date || "",
          thumbnail: postData.ogImage || postData.ogVideo || ""
        });
      } catch (e) {
        posts.push({ url: link.href, type: link.type, error: e.message?.substring(0, 100) });
      }
    }

    return JSON.stringify(posts, null, 2);
  });
}

export async function publishInstagramPhoto(imageUrl, caption) {
  const creds = JSON.parse(process.env.IG_CREDENTIALS || "{}");
  if (!creds.username || !creds.password) {
    return "Instagram posting requires login credentials which are not available. Configure IG_USERNAME and IG_PASSWORD.";
  }

  return await withBrowser(async (browser) => {
    const page = await browser.newPage();
    newPage(page);

    await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.type('input[name="email"]', creds.username);
    await page.type('input[name="pass"]', creds.password);
    await page.keyboard.press("Enter");
    await new Promise(r => setTimeout(r, 5000));

    if (page.url().includes("recaptcha") || page.url().includes("challenge")) {
      return "Instagram Security Block: Login requires CAPTCHA verification. Please log into instagram.com in your browser first, then retry.";
    }

    return "Posting via browser is complex. Direct API posting not available.";
  });
}

export { getInstagramRecentMedia as getInstagramPosts };
