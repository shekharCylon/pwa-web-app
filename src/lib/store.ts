/**
 * Device store — a JSON file.
 *
 * Deliberately the simplest thing that proves the loop: a token arrives, it is
 * stored, you can see it. The real registry lives in Engage (push_devices,
 * keyed by app_id) — this is a POC standing in for it, and the payload shape
 * matches so the swap is a change of implementation, not of contract.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const FILE = path.join(process.cwd(), "data", "devices.json");

export interface Device {
  id: string;
  appId: string | null;
  token: string;
  platform: string;
  browser: string;
  swVersion: string | null;
  deviceId: string | null;
  userId: string | null;
  userAgent: string | null;
  status: "active" | "disabled";
  firstSeenAt: string;
  lastSeenAt: string;
  lastClickAt?: string;
  seenCount: number;
}

let chain: Promise<unknown> = Promise.resolve();
function serialise<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

async function readAll(): Promise<Device[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

async function writeAll(devices: Device[]) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(devices, null, 2), "utf8");
  await fs.rename(tmp, FILE);
}

export async function listDevices(): Promise<Device[]> {
  return (await readAll()).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export interface UpsertInput {
  appId?: string | null;
  token: string;
  platform?: string;
  browser?: string;
  swVersion?: string | null;
  deviceId?: string | null;
  userId?: string | null;
  userAgent?: string | null;
}

/**
 * Upsert ON THE TOKEN, never on deviceId.
 *
 * One browser profile is one token. Re-registering — which happens on every
 * launch via refresh() — must update the row rather than add a second, or the
 * list looks like it is growing when it is only repeating itself.
 */
export async function upsertDevice(input: UpsertInput): Promise<{ device: Device; created: boolean }> {
  return serialise(async () => {
    const all = await readAll();
    const now = new Date().toISOString();
    const idx = all.findIndex((d) => d.token === input.token);

    if (idx >= 0) {
      const existing = all[idx];
      all[idx] = {
        ...existing,
        status: "active",
        lastSeenAt: now,
        seenCount: existing.seenCount + 1,
        // Later values win, but a missing one never blanks what we have.
        appId: input.appId ?? existing.appId,
        platform: input.platform ?? existing.platform,
        browser: input.browser ?? existing.browser,
        swVersion: input.swVersion ?? existing.swVersion,
        deviceId: input.deviceId ?? existing.deviceId,
        userId: input.userId ?? existing.userId,
        userAgent: input.userAgent ?? existing.userAgent,
      };
      await writeAll(all);
      return { device: all[idx], created: false };
    }

    const device: Device = {
      id: randomUUID(),
      appId: input.appId ?? null,
      token: input.token,
      platform: input.platform ?? "unknown",
      browser: input.browser ?? "unknown",
      swVersion: input.swVersion ?? null,
      deviceId: input.deviceId ?? null,
      userId: input.userId ?? null,
      userAgent: input.userAgent ?? null,
      status: "active",
      firstSeenAt: now,
      lastSeenAt: now,
      seenCount: 1,
    };
    all.push(device);
    await writeAll(all);
    return { device, created: true };
  });
}

export async function disableDevice(token: string | null, deviceId: string | null) {
  return serialise(async () => {
    const all = await readAll();
    let changed = 0;
    for (const d of all) {
      if ((token && d.token === token) || (deviceId && d.deviceId === deviceId)) {
        d.status = "disabled";
        changed++;
      }
    }
    if (changed) await writeAll(all);
    return changed;
  });
}

export async function recordClick(token?: string) {
  return serialise(async () => {
    const all = await readAll();
    const now = new Date().toISOString();
    // The worker cannot know the token, so a POC records the click on the most
    // recently active device. Engage will match on the message id instead.
    const target = token ? all.find((d) => d.token === token) : all[all.length - 1];
    if (target) {
      target.lastClickAt = now;
      await writeAll(all);
    }
  });
}

export async function deleteDevice(id: string) {
  return serialise(async () => {
    const all = await readAll();
    const next = all.filter((d) => d.id !== id);
    if (next.length === all.length) return false;
    await writeAll(next);
    return true;
  });
}
