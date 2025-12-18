import { createServer } from "http";
import crypto from "crypto";
import pkg from "pg";
import path from "path";

const { Pool } = pkg;

const PORT = process.env.PORT || 3000;

// Connect to Postgres using Render's DATABASE_URL environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Serve static files
const serveFile = async (res, filePath, contentType) => {
  try {
    const fs = await import("fs/promises");
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch (error) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 page not found");
  }
};

// Ensure links table exists
const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS links (
      short_code TEXT PRIMARY KEY,
      url TEXT NOT NULL
    )
  `);
};

// Get all links
const loadLinks = async () => {
  const res = await pool.query("SELECT short_code, url FROM links");
  const links = {};
  res.rows.forEach((row) => {
    links[row.short_code] = row.url;
  });
  return links;
};

// Save a new link
const saveLink = async (shortCode, url) => {
  await pool.query(
    "INSERT INTO links(short_code, url) VALUES($1, $2)",
    [shortCode, url]
  );
};

// Create HTTP server
const server = createServer(async (req, res) => {
  if (req.method === "GET") {
    if (req.url === "/") {
      return serveFile(res, path.join("public", "index.html"), "text/html");
    } else if (req.url === "/style.css") {
      return serveFile(res, path.join("public", "style.css"), "text/css");
    } else if (req.url === "/links") {
      const links = await loadLinks();
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(links));
    } else {
      const shortCode = req.url.slice(1);
      const links = await loadLinks();
      if (links[shortCode]) {
        res.writeHead(302, { location: links[shortCode] });
        return res.end();
      }
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Shortened URL not found");
    }
  }

  if (req.method === "POST" && req.url === "/shorten") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      let url, shortCode;
      try {
        const parsed = JSON.parse(body);
        url = parsed.url;
        shortCode = parsed.shortCode;
      } catch (error) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        return res.end("Invalid JSON format");
      }

      if (!url) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        return res.end("URL is required");
      }

      const finalShortCode = shortCode || crypto.randomBytes(4).toString("hex");

      const links = await loadLinks();
      if (links[finalShortCode]) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        return res.end("Short code already exists. Please choose another.");
      }

      await saveLink(finalShortCode, url);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, shortCode: finalShortCode }));
    });
  }
});

// Initialize DB and start server
initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
});
