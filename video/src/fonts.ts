import { loadFont as loadSchibsted } from "@remotion/google-fonts/SchibstedGrotesk";
import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";

// Same families as the app. loadFont() holds every frame until the files are ready.
const sans = loadSchibsted("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const mono = loadJetBrains("normal", { weights: ["400", "500"], subsets: ["latin"] });

export const SANS = `${sans.fontFamily}, "Segoe UI", system-ui, sans-serif`;
export const MONO = `${mono.fontFamily}, ui-monospace, monospace`;
