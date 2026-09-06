import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";
import { SettingsProvider } from "./lib/settings";
import { SessionProvider } from "./lib/session";
import { PasscodeGate } from "./components/PasscodeGate";
import { ToastProvider } from "./lib/toast";
import "./index.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;

const root = createRoot(document.getElementById("root")!);

if (!convexUrl) {
  // Convex writes VITE_CONVEX_URL into .env.local on its first run. Until
  // that happens, say so rather than failing with a blank screen.
  root.render(<SetupNotice />);
} else {
  const convex = new ConvexReactClient(convexUrl);
  root.render(
    <StrictMode>
      <ConvexProvider client={convex}>
        <SettingsProvider>
          <ToastProvider>
            <SessionProvider>
              <PasscodeGate>
                <App />
              </PasscodeGate>
            </SessionProvider>
          </ToastProvider>
        </SettingsProvider>
      </ConvexProvider>
    </StrictMode>,
  );
}

function SetupNotice() {
  return (
    <div className="flex min-h-full items-center justify-center bg-page p-6">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
        <h1 className="text-base font-semibold tracking-tight text-ink">
          Connect the database
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-ink-2">
          No <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">VITE_CONVEX_URL</code> was
          found. Run the command below once to create a Convex deployment — it writes the URL into{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">.env.local</code> for you.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-page px-3 py-2.5 text-[12.5px] text-ink">
          npx convex dev
        </pre>
        <p className="mt-3 text-xs leading-5 text-ink-3">
          Then restart <code className="text-ink-2">npm run dev</code>.
        </p>
      </div>
    </div>
  );
}
