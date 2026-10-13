// Cloud storage for the craft apps: sign-in with an OpenID Connect provider, then personal and
// shared folders in an S3 bucket. Everything is configured by environment and optional; without
// AUTH_ISSUER, AUTH_CLIENT_ID and STORAGE_S3_BUCKET the apps keep only "This device".
//
//   AUTH_NAME             shown as "Sign in with <AUTH_NAME>"
//   AUTH_ISSUER           OpenID Connect issuer (its /.well-known/openid-configuration is read)
//   AUTH_CLIENT_ID        confidential client; its redirect URI is <APP_ORIGIN>/_storage/callback
//   AUTH_CLIENT_SECRET
//   AUTH_SCOPES           default "openid profile email"
//   AUTH_USERNAME_CLAIM   default preferred_username
//   AUTH_GROUPS_CLAIM     claim listing the user's groups, when the provider sends one
//   AUTH_SESSION_HOURS    default 168
//   APP_ORIGIN            app origin with {app}, e.g. https://{app}.example.org; a proxy that
//                         serves the apps elsewhere (craft-ai-hub) names its origin per request
//                         in X-Craft-Origin, which is trusted like X-Gateway-Secret
//   STORAGE_NAME          shown in the apps, default "Cloud"
//   STORAGE_S3_ENDPOINT, STORAGE_S3_REGION, STORAGE_S3_BUCKET, STORAGE_S3_ACCESS_KEY,
//   STORAGE_S3_SECRET_KEY, STORAGE_S3_PATH_STYLE (default true)
//   STORAGE_HOME          personal prefix, default users/{username}/ (empty: no personal folder)
//   STORAGE_SHARED        JSON [{"name": "Team", "prefix": "team/", "groups": ["team"], "readOnly": false}];
//                         no groups: every signed-in user
//   GROUPS_SFTPGO_URL, GROUPS_SFTPGO_API_KEY
//                         also take the user's groups from an SFTPGo user of the same name
//
// The session cookie also signs people in to the apps themselves when the proxy in front of them
// asks /session/check (sign-in with the provider instead of a shared password).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const env = process.env;
const SECRET = env.MCP_KEY;
const configured = Boolean(env.AUTH_ISSUER && env.AUTH_CLIENT_ID && env.STORAGE_S3_BUCKET && env.APP_ORIGIN);
const SESSION_MS = Number(env.AUTH_SESSION_HOURS || 168) * 3600_000;
const HOME = env.STORAGE_HOME ?? "users/{username}/";
const SHARED = JSON.parse(env.STORAGE_SHARED || "[]");
const s3 = configured && new S3Client({
  endpoint: env.STORAGE_S3_ENDPOINT || undefined,
  region: env.STORAGE_S3_REGION || "us-east-1",
  forcePathStyle: env.STORAGE_S3_PATH_STYLE !== "false",
  credentials: env.STORAGE_S3_ACCESS_KEY ? { accessKeyId: env.STORAGE_S3_ACCESS_KEY, secretAccessKey: env.STORAGE_S3_SECRET_KEY } : undefined,
});

const mac = (text) => createHmac("sha256", SECRET).update(text).digest("base64url");
const seal = (value) => { const body = Buffer.from(JSON.stringify(value)).toString("base64url"); return `${body}.${mac(body)}`; };
const unseal = (token) => {
  const [body, sig] = (token ?? "").split(".");
  if (!sig || sig.length !== mac(body).length || !timingSafeEqual(Buffer.from(sig), Buffer.from(mac(body)))) return null;
  const value = JSON.parse(Buffer.from(body, "base64url").toString());
  return value.exp > Date.now() ? value : null;
};
const cookies = (req) => Object.fromEntries((req.headers.cookie ?? "").split(/;\s*/).filter(Boolean).map((c) => [c.slice(0, c.indexOf("=")), c.slice(c.indexOf("=") + 1)]));
const cookie = (name, value, maxAge, path = "/") => `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const json = (res, status, body, headers = {}) => res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers }).end(JSON.stringify(body));

let discovery;
const provider = async () => (discovery ??= await fetch(`${env.AUTH_ISSUER.replace(/\/$/, "")}/.well-known/openid-configuration`).then((r) => r.json()));
const redirectUri = (req, app) => `${(req.headers["x-craft-origin"] || env.APP_ORIGIN.replace("{app}", app)).replace(/\/$/, "")}/_storage/callback`;

async function groupsOf(username, claims) {
  const groups = new Set([claims[env.AUTH_GROUPS_CLAIM]].flat().filter((g) => typeof g === "string"));
  if (env.GROUPS_SFTPGO_URL) {
    const r = await fetch(`${env.GROUPS_SFTPGO_URL.replace(/\/$/, "")}/api/v2/users/${encodeURIComponent(username)}`, { headers: { "X-SFTPGO-API-KEY": env.GROUPS_SFTPGO_API_KEY } });
    if (r.ok) for (const g of (await r.json()).groups ?? []) groups.add(g.name);
  }
  return [...groups];
}

const roots = (user) => [
  ...(HOME ? [{ id: "home", name: "My files", prefix: HOME.replace("{username}", user.u), readOnly: false }] : []),
  ...SHARED.map((s, i) => ({ id: `shared${i}`, name: s.name, prefix: s.prefix, readOnly: Boolean(s.readOnly), groups: s.groups ?? [] }))
    .filter((s) => !s.groups.length || s.groups.some((g) => user.g.includes(g))),
];

// root + relative path -> S3 key, refusing anything outside the root.
const resolve = (user, rootId, path = "", folder = false) => {
  const root = roots(user).find((r) => r.id === rootId);
  if (!root) throw Object.assign(new Error("no such folder"), { status: 404 });
  const parts = path.split("/").filter(Boolean);
  if (parts.some((p) => p === "." || p === ".." || p.includes("\\"))) throw Object.assign(new Error("bad path"), { status: 400 });
  const rel = parts.join("/");
  return { root, key: root.prefix + rel + (folder && rel ? "/" : "") };
};

const body = async (req) => { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks); };

export async function handleStorage(req, res, app, action, url) {
  if (!configured) return action === "config" ? json(res, 200, { enabled: false }) : json(res, 404, { error: "cloud storage is not configured" });
  const user = unseal(cookies(req).craft_session);
  const q = url.searchParams;
  try {
    switch (action) {
      case "config":
        return json(res, 200, {
          enabled: true,
          name: env.STORAGE_NAME || "Cloud",
          signIn: env.AUTH_NAME || "your account",
          user: user && { name: user.n || user.u, roots: roots(user).map(({ id, name, readOnly }) => ({ id, name, readOnly })) },
        });
      case "login": {
        const p = await provider();
        const verifier = randomBytes(32).toString("base64url");
        const state = randomBytes(16).toString("base64url");
        const auth = new URL(p.authorization_endpoint);
        auth.search = new URLSearchParams({
          response_type: "code", client_id: env.AUTH_CLIENT_ID, redirect_uri: redirectUri(req, app), scope: env.AUTH_SCOPES || "openid profile email",
          state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
        });
        // A top-level sign-in (the app's own login) returns to the page it came from.
        const back = q.get("return");
        const pending = { verifier, state, back: back?.startsWith("/") && !back.startsWith("//") ? back : null, exp: Date.now() + 600_000 };
        return res.writeHead(302, { location: auth.href, "set-cookie": cookie("craft_oidc", seal(pending), 600, "/_storage") }).end();
      }
      case "callback": {
        const pending = unseal(cookies(req).craft_oidc);
        if (!pending || q.get("state") !== pending.state) return finish(res, false, "The sign-in expired. Try again.");
        const p = await provider();
        const token = await fetch(p.token_endpoint, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code", code: q.get("code") ?? "", redirect_uri: redirectUri(req, app), code_verifier: pending.verifier,
            client_id: env.AUTH_CLIENT_ID, ...(env.AUTH_CLIENT_SECRET ? { client_secret: env.AUTH_CLIENT_SECRET } : {}),
          }),
        }).then((r) => r.json());
        if (!token.access_token) return finish(res, false, token.error_description || token.error || "The sign-in failed.");
        const claims = await fetch(p.userinfo_endpoint, { headers: { authorization: `Bearer ${token.access_token}` } }).then((r) => r.json());
        const u = claims[env.AUTH_USERNAME_CLAIM || "preferred_username"] ?? claims.sub;
        if (!u || /[/\\]|^\.\.?$/.test(u)) return finish(res, false, "Your account has no usable user name.");
        const session = seal({ u, n: claims.name, g: await groupsOf(u, claims), exp: Date.now() + SESSION_MS });
        const set = [cookie("craft_session", session, SESSION_MS / 1000), cookie("craft_oidc", "", 0, "/_storage")];
        if (pending.back) return res.writeHead(302, { location: pending.back, "set-cookie": set, "cache-control": "no-store" }).end();
        return finish(res, true, "", set);
      }
      case "logout":
        return json(res, 200, {}, { "set-cookie": cookie("craft_session", "", 0) });
    }
    if (!user) return json(res, 401, { error: "sign in first" });
    if (action === "list" && req.method === "GET") {
      const { key } = resolve(user, q.get("root"), q.get("path"), true);
      const folders = [];
      const files = [];
      let token;
      do {
        const page = await s3.send(new ListObjectsV2Command({ Bucket: env.STORAGE_S3_BUCKET, Prefix: key, Delimiter: "/", ContinuationToken: token }));
        for (const p of page.CommonPrefixes ?? []) folders.push(p.Prefix.slice(key.length, -1));
        for (const o of page.Contents ?? []) if (o.Key !== key) files.push({ name: o.Key.slice(key.length), size: o.Size, modified: o.LastModified });
        token = page.NextContinuationToken;
      } while (token);
      return json(res, 200, { folders, files });
    }
    if (action === "file" && req.method === "GET") {
      const { key } = resolve(user, q.get("root"), q.get("path"));
      const o = await s3.send(new GetObjectCommand({ Bucket: env.STORAGE_S3_BUCKET, Key: key }));
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": o.ContentLength, "cache-control": "no-store" });
      return o.Body.pipe(res);
    }
    if ((action === "file" && req.method === "PUT") || (action === "folder" && req.method === "POST")) {
      const { root, key } = resolve(user, q.get("root"), q.get("path"), action === "folder");
      if (root.readOnly) return json(res, 403, { error: `${root.name} is read-only` });
      if (action === "folder") {
        await s3.send(new PutObjectCommand({ Bucket: env.STORAGE_S3_BUCKET, Key: key, Body: "" }));
      } else {
        await new Upload({ client: s3, params: { Bucket: env.STORAGE_S3_BUCKET, Key: key, Body: req } }).done();
      }
      return json(res, 200, {});
    }
    return json(res, 404, { error: "not found" });
  } catch (e) {
    const status = e.status ?? (e.name === "NoSuchKey" ? 404 : 500);
    if (status === 500) console.error(`storage ${action}: ${e}`);
    return json(res, status, { error: status === 500 ? "storage error" : e.message });
  }
}

// The sign-in popup's last page: tell the app, then close.
function finish(res, ok, message, setCookies = []) {
  const payload = JSON.stringify({ type: "craft-storage-sign-in", ok, message }).replace(/</g, "\\u003c");
  res.writeHead(ok ? 200 : 400, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "set-cookie": setCookies }).end(
    `<!doctype html><meta charset="utf-8"><title>Sign-in</title><body style="font:14px system-ui;background:#1c1c1c;color:#ddd;padding:2em">` +
    `<p>${ok ? "Signed in. You can close this window." : message.replace(/[<>&]/g, "")}</p>` +
    `<script>window.opener?.postMessage(${payload}, location.origin);${ok ? "window.close();" : ""}</script>`,
  );
}

// For the proxy's auth_request: 204 with a valid session, else 401.
export const checkSession = (req, res) => res.writeHead(configured && unseal(cookies(req).craft_session) ? 204 : 401).end();

// What the proxy shows instead of an app without a session: on to the provider, back to this page.
export const loginPage = (res) => res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(
  `<!doctype html><meta charset="utf-8"><title>Sign in</title><body style="background:#1c1c1c">` +
  `<script>location.replace("/_storage/login?return=" + encodeURIComponent(location.pathname + location.search + location.hash))</script>`,
);
