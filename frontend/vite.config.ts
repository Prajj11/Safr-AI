import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // These values belong only to server functions, never to browser defines.
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NOTIFY_MODE",
    "NOTIFY_CHANNELS",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_WHATSAPP_FROM",
    "TWILIO_WHATSAPP_NUMBER",
    "TWILIO_SMS_FROM",
    "TWILIO_PHONE_NUMBER",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "OSRM_BASE_URL",
    "OVERPASS_URL",
    "OVERPASS_FALLBACK_URL",
    "ROUTING_PROVIDER",
    "VALHALLA_BASE_URL",
  ]) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }
  return {
    plugins: [
      tailwindcss(),
      tanstackStart({
        server: { entry: "server" },
      }),
      react(),
    ],
    resolve: {
      tsconfigPaths: true,
      alias: {
        "@": "/src",
      },
    },
  };
});
