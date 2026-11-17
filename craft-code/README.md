# craft-code

VS Code in the browser ([code-server](https://github.com/coder/code-server)) with Claude Code and
the [Craft Apps](https://github.com/hayone1/craft-vscode) extension, plus eight
[storytold](https://github.com/storytold) craft apps (PhotoCraft, VectorCraft, LightCraft,
FilmCraft, EffectCraft, WordCraft, GridCraft and DeckCraft) and the [craft-mcp](https://hub.docker.com/r/hayone/craft-mcp) relay. All
of it runs in one container on one port, so one-click hosts can run it.

Open the address, sign in with the password, and click an app in the Craft view. The app opens in
an editor panel. Then ask Claude Code in the panel next to it, for example "open VectorCraft and
draw a gold star".

```sh
docker run -d -p 8080:8080 -v craft-home:/home/coder -e PASSWORD=choose-one hayone/craft-code
# open http://localhost:8080
```

## Tags

| Tag | What the tag holds |
| --- | --- |
| `vscode`, `latest` | The whole studio for one person, as described on this page. |
| `workspace` | The workspace image for [craft-coder](https://github.com/hayone1/craft-code), where Coder gives each user their own workspace. The image has code-server, Node, git, jq and the eight craft CLIs. The image has no apps, relay or Caddy, because craft-coder runs those once for every user. The image starts as the `coder` user, and a Coder template starts the Coder agent in it. |

## What runs inside

| Path on the port | What answers |
| --- | --- |
| `/` | code-server, behind its password |
| `/relay/` | the craft-mcp relay. The app pages and the coding agent meet here. |
| `/healthz` | `ok`, for the host's health check |

The app pages are served inside the container only (`127.0.0.1:4100/<app>/`). The Craft Apps
extension shows them through code-server's port proxy, so code-server's password protects them too.

## Settings

All settings are optional environment variables.

| Variable | What it does |
| --- | --- |
| `PUBLIC_URL` | The address people open, for example `https://studio.example.com`. Railway, Render, Koyeb and Fly.io are detected without it. The default is `http://localhost:$PORT`. |
| `PASSWORD` | The sign-in password. Without it, the first start makes one, saves it in `/home/coder/.craft-studio/secrets.env` and prints it in the log. `HASHED_PASSWORD` works too. |
| `AUTH` | `password` (default) or `none`. Use `none` only behind another sign-in. |
| `PORT` | The port (default `8080`). |
| `PROJECT_DIR` | The folder VS Code opens (default `/home/coder/project`). |
| `CRAFT_APP_URL` | App pages somewhere else, for example `http://craft-app-{app}:8080/`. Without it, the pages inside the container are used. |
| `CRAFT_RELAY_URL`, `CRAFT_RELAY_TOKEN` | A craft-mcp relay somewhere else, and one of its `MINT_TOKENS`. Without them, the relay inside the container is used. |
| `RELAY_UPSTREAM` | With an outside relay: its address inside your network, for example `craft-mcp:8080`. The container then passes `PUBLIC_URL/relay/` on to it. |
| `EMBED_ORIGINS` | Editors that may frame the inside app pages (default `PUBLIC_URL,vscode-webview://*`). |
| `EXTENSIONS` | More Open VSX extensions to install, separated by commas. |
| `UPDATE_EXTENSIONS` | `false` keeps the installed Claude Code and Craft Apps versions. By default each start installs the newest ones. |
| `CLAUDE_CLI` | `false` skips the `claude` command (the extension has its own copy). |

Keep `/home/coder` on a volume. Your projects, settings, extensions and the generated secrets live
there.

## Notes

- Browsers only run VS Code's panels on `https://` or on `localhost`. On a server, put the
  container behind HTTPS. One-click hosts do that for you.
- Each person signs in to Claude Code in the Claude Code panel with their own account.
- The app pages share the editor's address. Only the eight app pages from the image are served
  there.

Source: [hayone1/Docker_Images](https://github.com/hayone1/Docker_Images/tree/main/craft-code).
Deploy buttons, Docker Compose and Helm charts: [hayone1/craft-code](https://github.com/hayone1/craft-code). The same image is the workspace image of craft-coder there.
