FROM clemlesne/blue-agent:bookworm-12.0.1

# Install OpenJDK 17
ENV JAVA_HOME=/opt/jdk-17
RUN wget https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10+7/OpenJDK17U-jdk_x64_linux_hotspot_17.0.10_7.tar.gz \
    && tar -xvf OpenJDK17U-jdk_x64_linux_hotspot_17.0.10_7.tar.gz \
    && sudo mv jdk-17.0.10+7 /opt/jdk-17 \
    && rm OpenJDK17U-jdk_x64_linux_hotspot_17.0.10_7.tar.gz

# Install Maven 3.9.6
ENV MAVEN_VERSION=3.9.11
ENV M2_HOME=/opt/apache-maven-${MAVEN_VERSION}
RUN wget https://dlcdn.apache.org/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz \
    && tar -xvf apache-maven-${MAVEN_VERSION}-bin.tar.gz \
    && sudo mv apache-maven-${MAVEN_VERSION} /opt/ \
    && rm apache-maven-${MAVEN_VERSION}-bin.tar.gz

ENV PATH=$JAVA_HOME/bin:$M2_HOME/bin:$PATH

# Verify the installation
RUN java -version
RUN mvn -version