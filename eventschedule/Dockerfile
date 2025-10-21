FROM registry.suse.com/bci/php:8

ARG VERSION=v1.0.36

ADD https://github.com/eventschedule/eventschedule/releases/download/${VERSION}/eventschedule.zip /tmp/eventschedule.zip

RUN zypper -q -n install unzip && \
    # Optional: clean up the zypper cache to reduce the final image size
    zypper clean -a && \
    rm -rf /var/cache/zypp/*

RUN unzip /tmp/eventschedule.zip -d /opt/eventschedule && \
    rm -rf /tmp/eventschedule.zip

