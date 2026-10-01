import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // These values belong only to server functions, never to browser defines.
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "OSRM_BASE_URL",
    "OVERPASS_URL",
    "ROUTING_PROVIDER",
    "VALHALLA_BASE_URL",
  ]) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }
  return {
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        server: { entry: "server" },
      }),
      react(),
    ],
    resolve: {
      alias: {
        "@": "/src",
      },
    },
  };
});
