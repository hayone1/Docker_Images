FROM wso2/wso2is:7.1.0

ARG USER=wso2carbon
ARG USER_HOME=/home/${USER}
ARG WSO2_SERVER_NAME=wso2is
ARG WSO2_SERVER_VERSION=7.1.0
ARG WSO2_SERVER=${WSO2_SERVER_NAME}-${WSO2_SERVER_VERSION}
ARG WSO2_SERVER_HOME=${USER_HOME}/${WSO2_SERVER}

# Copy JDBC MySQL driver
ADD --chown=${USER}:wso2 https://jdbc.postgresql.org/download/postgresql-42.7.8.jar ${WSO2_SERVER_HOME}/repository/components/lib
