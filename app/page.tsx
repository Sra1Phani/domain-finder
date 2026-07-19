import App from "./ui/App";

// The v1 search page is replaced by the Stage-2 client app. All existing API
// routes (/api/search, /api/check, /api/watch, /api/cron/poll, /api/[transport])
// are unchanged.
export default function Page() {
  return <App />;
}
