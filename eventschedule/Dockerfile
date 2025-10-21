FROM php:8.4.13-apache

ARG VERSION=v1.0.36

ADD https://github.com/eventschedule/eventschedule/releases/download/${VERSION}/eventschedule.zip /tmp/eventschedule.zip

RUN apt-get update && \
    apt-get install -y unzip && \
    rm -rf /var/lib/apt/lists/*

RUN unzip /tmp/eventschedule.zip -d /opt/eventschedule && \
    rm -rf /tmp/eventschedule.zip

