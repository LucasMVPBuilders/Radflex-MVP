import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@fontsource/rethink-sans/400.css";
import "@fontsource/rethink-sans/500.css";
import "@fontsource/rethink-sans/600.css";
import "@fontsource/rethink-sans/700.css";
import "@fontsource/rethink-sans/800.css";
import "@fontsource/jetbrains-mono/400.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
