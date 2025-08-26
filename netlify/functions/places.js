// netlify/functions/places.js
const fetch = require("node-fetch");

const dataFile = "places.json"; // archivo a versionar en GitHub
const mediaDir = "media";       // carpeta para guardar assets

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
      } catch (e) {
        data = "[]";
      }

      return { statusCode: 200, body: data };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body);

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

      // inicializar media
      body.media = { images: [], audios: [], videos: [] };

      // guardar archivos si vienen en body.files
      if (body.files && Array.isArray(body.files)) {
        for (const file of body.files) {
          const filePath = `${mediaDir}/${file.name}`;
          await commitToGitHub(
            filePath,
            file.data, // base64 desde el cliente
            `add media ${file.name}`
          );

          // actualizar media
          if (file.type.startsWith("image/")) {
            body.media.images.push(`/${filePath}`);
          } else if (file.type.startsWith("audio/")) {
            body.media.audios.push(`/${filePath}`);
          } else if (file.type.startsWith("video/")) {
            body.media.videos.push(`/${filePath}`);
          }
        }

        // ya no necesitamos guardar `data` dentro de `files`
        body.files = body.files.map(f => ({ name: f.name, type: f.type }));
      }

      // añadir el nuevo punto al JSON
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
