import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@fontsource/sora/400.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/sora/800.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/jetbrains-mono/400.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
