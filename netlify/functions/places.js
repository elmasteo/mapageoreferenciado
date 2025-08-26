// netlify/functions/places.js
const fetch = require("node-fetch");
const Busboy = require("busboy");

const dataFile = "places.json";
const mediaDir = "media";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH;

// helper para subir archivo a GitHub
async function commitToGitHub(filePath, base64Content, message, sha) {
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;

  if (!sha) {
    const res = await fetch(apiUrl, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
    if (res.ok) {
      const info = await res.json();
      sha = info.sha;
    }
  }

  const payload = {
    message,
    branch: GITHUB_BRANCH,
    content: base64Content,
    ...(sha ? { sha } : {})
  };

  const resp = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`GitHub commit failed: ${err}`);
  }
  return await resp.json();
}

async function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: event.headers,
    });

    const result = { fields: {}, files: [] };

    busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
      let buffer = [];
      file.on("data", (data) => buffer.push(data));
      file.on("end", () => {
        result.files.push({
          name: filename,
          type: mimetype,
          data: Buffer.concat(buffer).toString("base64"),
        });
      });
    });

    busboy.on("field", (fieldname, val) => {
      result.fields[fieldname] = val;
    });

    busboy.on("finish", () => resolve(result));
    busboy.on("error", reject);

    busboy.end(Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8"));
  });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "GET") {
      const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${dataFile}`;
      let data = "[]";

      try {
        const res = await fetch(url);
        if (res.ok) {
          const text = await res.text();
          if (text && text.trim()) {
            try {
              JSON.parse(text);
              data = text;
            } catch {
              data = "[]";
            }
          }
        }
      } catch {
        data = "[]";
      }

      return { statusCode: 200, body: data };
    }

    if (event.httpMethod === "POST") {
      let body;
      let files = [];

      if (event.headers["content-type"]?.includes("multipart/form-data")) {
        const parsed = await parseMultipart(event);
        body = parsed.fields;
        files = parsed.files;
      } else {
        body = JSON.parse(event.body);
        files = body.files || [];
      }

      // traer places.json actual
      const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${dataFile}`;
      let places = [];
      try {
        const res = await fetch(url);
        if (res.ok) {
          places = await res.json();
        }
      } catch {
        places = [];
      }

      body.media = { images: [], audios: [], videos: [] };

      for (const file of files) {
        const filePath = `${mediaDir}/${file.name}`;
        const safeBase64 = Buffer.from(file.data, "base64").toString("base64");

        await commitToGitHub(filePath, safeBase64, `add media ${file.name}`);

        if (file.type.startsWith("image/")) body.media.images.push(`/${filePath}`);
        if (file.type.startsWith("audio/")) body.media.audios.push(`/${filePath}`);
        if (file.type.startsWith("video/")) body.media.videos.push(`/${filePath}`);
      }

      body.files = files.map(f => ({ name: f.name, type: f.type }));

      places.push(body);

      await commitToGitHub(
        dataFile,
        Buffer.from(JSON.stringify(places, null, 2)).toString("base64"),
        `add place ${body.id || "new"}`
      );

      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
