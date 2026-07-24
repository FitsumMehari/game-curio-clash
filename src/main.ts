import "./styles/main.css";
import { boot } from "./app/boot";

async function polishNativeShell(): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0c1412" });
    await SplashScreen.hide({ fadeOutDuration: 280 });
  } catch {
    // Web / plugins unavailable — ignore
  }
}

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("#app missing");
void polishNativeShell();
boot(root);
