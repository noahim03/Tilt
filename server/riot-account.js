const { getAccount } = require("./riot-service.cjs");

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
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
    const account = await getAccount(name, tag, apiKey);
    send(res, 200, { exists: true, account });
  } catch (error) {
    if (error.status === 404) {
      send(res, 404, { exists: false, message: "Account doesn't exist." });
      return;
    }

    send(res, error.status ?? 500, {
      message:
        error.status === 401 || error.status === 403
          ? "Riot API key is invalid or expired."
          : "Could not validate this account.",
    });
  }
};
