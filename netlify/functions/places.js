// netlify/functions/places.js
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "../data/places.json");

exports.handler = async (event) => {
  if (event.httpMethod === "GET") {
    const data = fs.readFileSync(file, "utf8");
    return { statusCode: 200, body: data };
  }

  if (event.httpMethod === "POST") {
    const body = JSON.parse(event.body);
    let places = JSON.parse(fs.readFileSync(file, "utf8"));
    places.push(body);
    fs.writeFileSync(file, JSON.stringify(places, null, 2));
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  if (event.httpMethod === "PUT") {
    const body = JSON.parse(event.body);
    let places = JSON.parse(fs.readFileSync(file, "utf8"));
    places = places.map(p => p.id === body.id ? body : p);
    fs.writeFileSync(file, JSON.stringify(places, null, 2));
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  if (event.httpMethod === "DELETE") {
    const { id } = JSON.parse(event.body);
    let places = JSON.parse(fs.readFileSync(file, "utf8"));
    places = places.filter(p => p.id !== id);
    fs.writeFileSync(file, JSON.stringify(places, null, 2));
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};
