# wso2is-postgres

WSO2 Identity Server image with the PostgreSQL JDBC driver pre-installed.

The Dockerfile and `docker-entrypoint.sh` are the official WSO2 Ubuntu image files
(`wso2/docker-is` v7.3.0.1, `dockerfiles/ubuntu/is`) with one addition: the
PostgreSQL JDBC driver is added to `repository/components/lib`.

| Component            | Version                         |
| -------------------- | ------------------------------- |
| WSO2 Identity Server | 7.3.0                           |
| Base image           | ubuntu:24.04                    |
| JDK                  | Eclipse Temurin 21.0.9+10       |
| PostgreSQL JDBC      | 42.7.13                         |
| dnsjava              | 3.6.1                           |

The image tag matches the upstream WSO2 IS version (for example `hayone/wso2is-postgres:7.3.0`
corresponds to `wso2/wso2is:7.3.0`).

## Configuring PostgreSQL

The image does not contain a database configuration. Mount a `deployment.toml` with the
PostgreSQL datasources through the config volume
(`/home/wso2carbon/wso2-config-volume`, copied over `WSO2_SERVER_HOME` at start-up).
See the WSO2 guide linked below for the required settings and DB scripts.

## Build and publish

Use the `Build and Push Docker Image` GitHub workflow with:

- `image_folder`: `wso2is-postgres`
- `version_tag`: the upstream WSO2 IS version, e.g. `7.3.0`
- `platforms`: `linux/amd64,linux/arm64`

Local build:

```sh
docker build -t hayone/wso2is-postgres:7.3.0 -t hayone/wso2is-postgres:latest .
docker push hayone/wso2is-postgres:7.3.0
docker push hayone/wso2is-postgres:latest
```

## References

- Official Dockerfile: https://github.com/wso2/docker-is/tree/v7.3.0.1/dockerfiles/ubuntu/is
- Upstream image tags: https://hub.docker.com/r/wso2/wso2is/tags
- WSO2 Identity Server source and releases: https://github.com/wso2/product-is
- Change the carbon database to PostgreSQL: https://is.docs.wso2.com/en/latest/deploy/configure/databases/carbon-database/change-to-postgresql/
- PostgreSQL JDBC driver: https://jdbc.postgresql.org/
