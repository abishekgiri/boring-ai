"use client";

import { useEffect, useState } from "react";

function formatTimestamp(value) {
  if (!value) {
    return "Waiting for a response";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export default function HealthStatus({ apiBaseUrl, initialState }) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      try {
        const response = await fetch(`${apiBaseUrl}/health`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Health check failed with ${response.status}`);
        }

        const payload = await response.json();

        if (!cancelled) {
          setState({
            status: "online",
            message: "Backend is reachable from the frontend.",
            data: payload,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "offline",
            message:
              error instanceof Error
                ? error.message
                : "Unable to reach the backend.",
            data: null,
          });
        }
      }
    }

    checkHealth();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  const statusClasses = {
    loading: "border-amber-700/15 bg-amber-50 text-amber-900",
    online: "border-emerald-700/15 bg-emerald-50 text-emerald-900",
    offline: "border-rose-700/15 bg-rose-50 text-rose-900",
  };

  return (
    <aside
      className={`rounded-[1.75rem] border p-6 shadow-sm ${
        statusClasses[state.status]
      }`}
    >
      <p className="text-sm font-semibold uppercase tracking-[0.28em]">
        Backend link check
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-tight">
        {state.status === "online"
          ? "Connected"
          : state.status === "offline"
            ? "Needs attention"
            : "Connecting"}
      </h2>
      <p className="mt-4 text-base leading-7">{state.message}</p>

      <div className="mt-6 rounded-[1.4rem] border border-current/10 bg-white/70 p-4 text-sm">
        <dl className="space-y-3">
          <div>
            <dt className="font-semibold uppercase tracking-[0.18em] opacity-70">
              API base URL
            </dt>
            <dd className="mt-1 break-all font-medium">{apiBaseUrl}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-[0.18em] opacity-70">
              Service
            </dt>
            <dd className="mt-1 font-medium">
              {state.data?.service ?? "Not available yet"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-[0.18em] opacity-70">
              Environment
            </dt>
            <dd className="mt-1 font-medium">
              {state.data?.environment ?? "Unknown"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-[0.18em] opacity-70">
              Last response
            </dt>
            <dd className="mt-1 font-medium">
              {formatTimestamp(state.data?.timestamp)}
            </dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
