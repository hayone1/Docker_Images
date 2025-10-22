FROM php:8.4.13-apache

ARG VERSION=v1.0.36

RUN docker-php-source extract \
	&& docker-php-ext-install pdo_mysql mysqli \
	&& docker-php-source delete

ADD https://github.com/eventschedule/eventschedule/releases/download/${VERSION}/eventschedule.zip /tmp/eventschedule.zip

RUN apt-get update && \
    apt-get install -y unzip && \
    rm -rf /var/lib/apt/lists/*

RUN unzip /tmp/eventschedule.zip -d /opt/eventschedule && \
    rm -rf /tmp/eventschedule.zip

ENV APACHE_DOCUMENT_ROOT /srv/www/htdocs/public
# Allow setting custom DocumentRoot
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf
RUN sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

# 3. Update AllowOverride from 'None' to 'All'
# This should cover your DocumentRoot directory block and any other necessary blocks.
RUN sed -i -e "s/AllowOverride None/AllowOverride All/g" /etc/apache2/sites-available/*.conf /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

# Enable mod_rewrite
RUN a2enmod rewrite

sed -i -e "s/APP_URL=/APP_URL=https://eventschedule-dev.exoduschurch.global/g"
APP_URL=