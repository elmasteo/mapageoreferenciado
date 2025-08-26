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

  // si no me pasaron sha, lo busco
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
    content: base64Content, // ya en base64
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
          // valida que no esté vacío y sea JSON
          if (text && text.trim()) {
            try {
              JSON.parse(text); // prueba parseo
              data = text;
            } catch {
              data = "[]"; // JSON inválido → fallback
            }
          }
        }
      } catch (e) {
        data = "[]"; // cualquier error → fallback
      }

      return { statusCode: 200, body: data };
    }


    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body);

      // 1. traer el places.json actual
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

      // 2. guardar archivos si vienen en body.files
      if (body.files && Array.isArray(body.files)) {
        for (const file of body.files) {
          const filePath = `${mediaDir}/${file.name}`;
          await commitToGitHub(
            filePath,
            file.data, // ya en base64 desde el cliente
            `add media ${file.name}`
          );
          // actualizar referencias en el objeto
          if (file.type.startsWith("image/")) {
            body.images = body.images || [];
            body.images.push(`/${filePath}`);
          } else if (file.type.startsWith("audio/")) {
            body.audios = body.audios || [];
            body.audios.push(`/${filePath}`);
          } else if (file.type.startsWith("video/")) {
            body.videos = body.videos || [];
            body.videos.push(`/${filePath}`);
          }
        }
      }

      // 3. añadir el nuevo punto al JSON
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
