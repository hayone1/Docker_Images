This documentation follows the visual structure and technical tone of the official Stalwart Labs documentation, specifically tailored for your custom `stalwart-cli` Docker image.

---

# Management: Command Line Interface (Docker)

`stalwart-cli-docker` is a containerized distribution of the schema-driven command line tool for administering Stalwart Mail servers. This version is hardened for container orchestration and provides a consistent environment for automation and CI/CD pipelines.

### Capabilities at a glance

| Task | Command | Title |
| :--- | :--- | :--- |
| Inspect what objects the server exposes | `describe` | Exploring the schema |
| Read a single object by ID | `get` | Fetching a single object |
| List or filter objects | `query` | Searching and listing |
| Create one or more objects | `create` | Creating objects |
| Apply a bulk plan from a JSON file | `apply` | Declarative bulk operations |
| Export live server state | `snapshot` | Exporting server state |

## Installation

The Dockerized CLI is available via the provided `Dockerfile`. It is built on `debian-slim` to ensure a minimal attack surface and small image size.

### Building the image

With the `Dockerfile` in your current directory, run:

```bash
docker build -t stalwart-cli .
```

### Verification

Verify the installation by checking the version:

```bash
docker run --rm stalwart-cli --version
```

## Connecting to a server

Every invocation requires a server URL and credentials. These are best managed via environment variables to keep the command line clean and prevent credential leaking in process lists.

| Flag | Environment Variable | Purpose |
| :--- | :--- | :--- |
| `--url <URL>` | `STALWART_URL` | The Stalwart server endpoint (required). |
| `--api-key <TOKEN>` | `STALWART_TOKEN` | Bearer token (recommended for automation). |
| `--user <USER>` | `STALWART_USER` | Basic-auth username. |
| `--password <PASS>` | `STALWART_PASSWORD` | Basic-auth password. |
--insecure / -k	| (none) | Skip TLS certificate verification (matches curl -k).
--no-color | (none) | Disable ANSI color output. The NO_COLOR environment variable also disables colors.

### Typical invocation

Using environment variables for a secure and clean workflow:

```bash
export STALWART_URL=https://mail.exoduschurch.global
export STALWART_TOKEN='your_api_token_here'

docker run --rm -e STALWART_URL -e STALWART_TOKEN stalwart-cli describe
```

Here is the updated section for your documentation, styled to match the official Stalwart Docs layout. I’ve added a dedicated **Authentication Methods** section that covers both the CLI flags and environment variables.

---

## Authentication Methods

The CLI supports two primary authentication schemes: **API Keys** (recommended for automation and Kubernetes) and **Basic Auth** (User/Password). Every command requires one of these methods to be present either as a command-line argument or an environment variable.

### 1. Using API Keys (Bearer Token)
This is the most secure method for headless operations as it avoids handling raw passwords.

* **As Environment Variable:**
    ```bash
    export STALWART_TOKEN='your_api_token'
    docker run --rm -e STALWART_URL -e STALWART_TOKEN stalwart-cli describe
    ```
* **As Command-Line Argument:**
    ```bash
    docker run --rm -e STALWART_URL stalwart-cli --api-key "your_api_token" describe
    ```

### 2. Using Basic Auth (Username & Password)
Useful for manual administration or when an API key hasn't been provisioned yet.

* **As Environment Variables:**
    ```bash
    export STALWART_USER='admin'
    export STALWART_PASSWORD='your_secret_password'
    
    docker run --rm \
      -e STALWART_URL \
      -e STALWART_USER \
      -e STALWART_PASSWORD \
      stalwart-cli describe
    ```
* **As Command-Line Arguments:**
    ```bash
    docker run --rm -e STALWART_URL stalwart-cli \
      --user "admin" \
      --password "your_secret_password" \
      describe
    ```

---

## Precedence and Behavior

1.  **Arguments Override Env Vars**: If both are provided, the flags passed to the command (e.g., `--user`) take precedence over the environment variables (e.g., `STALWART_USER`).
2.  **Mutually Exclusive**: You cannot use both `--api-key` and `--user` in the same invocation.
3.  **Interactive Prompts**: If you provide `--user` but omit `--password` (and `STALWART_PASSWORD` is not set), the CLI will attempt to prompt for a password interactively. 
    * *Note:* In Docker, this requires the `-it` flag: `docker run --rm -it ...`.

## Security Best Practices

* **Avoid Command History**: When using flags like `--password`, your password may be saved in your shell's history file (`.bash_history`). Prefer environment variables or the interactive prompt for manual tasks.
* **Token Rotation**: For Kubernetes cronjobs or readiness probes, use `STALWART_TOKEN` and rotate it periodically via Kubernetes Secrets.

## Running in Kubernetes

The image is configured with numeric IDs (**UID 1001 / GID 1001**) to comply with standard Kubernetes Security Contexts.

### Readiness Probe Example

You can use the `describe` command to verify that the CLI can successfully authenticate and communicate with the mail server:

```yaml
readinessProbe:
  exec:
    command:
      - stalwart-cli
      - "--url"
      - "http://stalwart-internal:8080"
      - "--api-key"
      - "management-token"
      - "describe"
  initialDelaySeconds: 10
  periodSeconds: 30
```

## Data Persistence & Local Files

When using commands that require local files (like `apply` or `snapshot`), you must mount the local directory as a volume to the container's home directory.

**Exporting a server snapshot:**

```bash
docker run --rm \
  -v $(pwd):/home/stalwart \
  -e STALWART_URL -e STALWART_TOKEN \
  stalwart-cli snapshot > server_backup.json
```

**Importing a configuration:**

```bash
docker run --rm \
  -v $(pwd):/home/stalwart \
  -e STALWART_URL -e STALWART_TOKEN \
  stalwart-cli apply --file config.json
```

## Security

* **Non-Root Execution**: The container runs as a non-privileged user `stalwart` (1001).
* **Minimal Base**: The image excludes unnecessary tools like `curl` or `wget` to reduce the blast radius.
* **TLS Support**: The image includes updated CA certificates to ensure secure communication with your Stalwart instance over HTTPS.