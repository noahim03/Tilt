import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { analyzeRiotPlayer, getAccount } = require("../api/riot-service.cjs");
const dirname = path.dirname(fileURLToPath(import.meta.url));

function getLocalRiotApiKey() {
  if (process.env.RIOT_API_KEY) return process.env.RIOT_API_KEY;

  const envPath = path.resolve(dirname, "../.env");
  if (!fs.existsSync(envPath)) return undefined;

  const env = fs.readFileSync(envPath, "utf8");
  const line = env
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith("RIOT_API_KEY="));

  return line?.split("=").slice(1).join("=").trim();
}

function sendJson(
  res: {
    statusCode: number;
    setHeader: (key: string, value: string) => void;
    end: (body: string) => void;
  },
  status: number,
  body: unknown
) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function errorMessage(error: { status?: number; message?: string }) {
  if (error.status === 404) return "Account doesn't exist.";
  if (error.status === 401 || error.status === 403) {
    return "Riot API key is invalid or expired.";
  }
  if (error.status === 429) {
    return "Riot API rate limit hit. Wait about 2 minutes, then search once. Repeat searches for the same account will be cached.";
  }
  return error.message ?? "Could not reach Riot API.";
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "riot-api-dev",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? "", "http://localhost");
          if (
            url.pathname !== "/api/analyze" &&
            url.pathname !== "/api/riot-account"
          ) {
            next();
            return;
          }

          if (req.method !== "GET") {
            sendJson(res, 405, { message: "Method not allowed" });
            return;
          }

          const apiKey = getLocalRiotApiKey();
          if (!apiKey) {
            sendJson(res, 500, { message: "Riot API key is not configured." });
            return;
          }

          const gameName = url.searchParams.get("gameName");
          const tagLine = url.searchParams.get("tagLine");

          if (!gameName || !tagLine) {
            sendJson(res, 400, {
              message: "gameName and tagLine are required.",
            });
            return;
          }

          try {
            if (url.pathname === "/api/riot-account") {
              const account = await getAccount(gameName, tagLine, apiKey);
              sendJson(res, 200, { exists: true, account });
              return;
            }

            const result = await analyzeRiotPlayer(gameName, tagLine, apiKey);
            sendJson(res, 200, result);
          } catch (error) {
            const status =
              typeof error === "object" && error !== null && "status" in error
                ? Number((error as { status?: number }).status)
                : 500;
            sendJson(res, status || 500, {
              message: errorMessage(error as { status?: number; message?: string }),
            });
          }
        });
      },
    },
  ],
  server: {
    port: 5173,
  },
});
