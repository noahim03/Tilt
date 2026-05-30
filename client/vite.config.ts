import path from "path";
import { config } from "dotenv";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

config({ path: path.resolve(__dirname, "../.env/client.env") });

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envPrefix: "VITE_",
  server: {
    port: 5173,
  },
});
