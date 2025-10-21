FROM php:8.4.13-apache

ARG VERSION=v1.0.36

ADD https://github.com/eventschedule/eventschedule/releases/download/${VERSION}/eventschedule.zip /tmp/eventschedule.zip

RUN apt-get update && \
    apt-get install -y unzip && \
    rm -rf /var/lib/apt/lists/*

RUN unzip /tmp/eventschedule.zip -d /opt/eventschedule && \
    rm -rf /tmp/eventschedule.zip

ENV APACHE_DOCUMENT_ROOT /srv/www/htdocs/public

RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf
RUN sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

