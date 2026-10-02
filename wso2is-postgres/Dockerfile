# Official WSO2 Identity Server image (Ubuntu), pinned by digest.
# Tag and digest from https://hub.docker.com/r/wso2/wso2is/tags
FROM wso2/wso2is:7.3.0@sha256:d9ffe26f8a87d479b0987e9e22df8f8214407fd0138d78ba6f2dd8c0f75fbfc6

# Add PostgreSQL JDBC driver.
# WSO2_SERVER_HOME (/home/wso2carbon/wso2is-7.3.0) is set by the base image.
ARG POSTGRESQL_JDBC_VERSION=42.7.13
ADD --chown=wso2carbon:wso2 https://repo1.maven.org/maven2/org/postgresql/postgresql/${POSTGRESQL_JDBC_VERSION}/postgresql-${POSTGRESQL_JDBC_VERSION}.jar ${WSO2_SERVER_HOME}/repository/components/lib/
