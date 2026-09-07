"use client";

import { useCallback, useEffect, useState } from "react";
import {
  disablePush,
  enablePush,
  getDeviceId,
  getDeviceToken,
  getPushPermission,
  getPushSupport,
  refreshPushToken,
  type SupportResult,
} from "./push";

/**
 * React binding over the functions in ./push.
 *
 * It exists for one reason: support and permission are only knowable in the
 * browser, so they start at their server-safe defaults and settle after mount.
 * A component that renders before that has run should treat `supported: false`
 * as "not yet", not "no" — which is what `canPrompt` encodes.
 */
export function usePush() {
  const [support, setSupport] = useState<SupportResult>({ supported: false, reason: "server" });
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [token, setToken] = useState<string | null>(null);
  // Read from localStorage, so like support and permission it is only knowable
  // after mount — null on the server render, settled by the first sync().
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(() => {
    setSupport(getPushSupport());
    setPermission(getPushPermission());
    setDeviceId(getDeviceId());
  }, []);

  useEffect(() => {
    sync();
  }, [sync]);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      setBusy(true);
      setError(null);
      try {
        return await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setBusy(false);
        sync();
      }
    },
    [sync],
  );

  const enable = useCallback(
    () =>
      run(async () => {
        const result = await enablePush();
        if (result.token) setToken(result.token);
        return result;
      }),
    [run],
  );

  const refresh = useCallback(
    () =>
      run(async () => {
        const result = await refreshPushToken();
        if (result.token) setToken(result.token);
        return result;
      }),
    [run],
  );

  const fetchToken = useCallback(
    (opts?: { prompt?: boolean }) =>
      run(async () => {
        const t = await getDeviceToken(opts);
        setToken(t);
        return t;
      }),
    [run],
  );

  const disable = useCallback(
    () =>
      run(async () => {
        const result = await disablePush();
        setToken(null);
        return result;
      }),
    [run],
  );

  return {
    support,
    permission,
    token,
    /** Stable per-browser id. Not a delivery address — see getDeviceId. */
    deviceId,
    busy,
    error,
    /** Safe to show an opt-in control: supported, and not yet asked. */
    canPrompt: support.supported && permission === "default",
    /** Denied — this origin can never be prompted again. */
    isBlocked: permission === "denied",
    enable,
    refresh,
    disable,
    getToken: fetchToken,
  };
}
