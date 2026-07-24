import "./styles/main.css";
import { boot } from "./app/boot";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("#app missing");
boot(root);
