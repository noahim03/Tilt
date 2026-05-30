const { analyzeRiotPlayer } = require("./riot-service.cjs");

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function errorMessage(error) {
  if (error.status === 404) return "Account doesn't exist.";
  if (error.status === 401 || error.status === 403) {
    return "Riot API key is invalid or expired.";
  }
  if (error.status === 429) {
    return "Riot API rate limit hit. Wait about 2 minutes, then search once. Repeat searches for the same account will be cached.";
  }
  return error.message || "Could not analyze this account.";
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    send(res, 405, { message: "Method not allowed" });
    return;
  }

  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    send(res, 500, { message: "Riot API key is not configured." });
    return;
  }

  const { gameName, tagLine } = req.query;
  const name = Array.isArray(gameName) ? gameName[0] : gameName;
  const tag = Array.isArray(tagLine) ? tagLine[0] : tagLine;

  if (!name || !tag) {
    send(res, 400, { message: "gameName and tagLine are required." });
    return;
  }

  try {
    const result = await analyzeRiotPlayer(name, tag, apiKey);
    send(res, 200, result);
  } catch (error) {
    send(res, error.status ?? 500, { message: errorMessage(error) });
  }
};
