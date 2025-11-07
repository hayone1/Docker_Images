FROM php:8.4.13-apache

ARG VERSION=v1.0.36

# # System deps
# RUN apk add --no-cache \
#     bash git curl ca-certificates busybox-extras \
#     libpng-dev libjpeg-turbo-dev freetype-dev zlib-dev \
#     oniguruma-dev libxml2-dev icu-dev \
#     libzip-dev zip unzip \
#     nodejs npm

# # PHP extensions (incl. gd w/ jpeg + freetype)
# RUN docker-php-ext-configure gd --with-jpeg --with-freetype \
#  && docker-php-ext-install \
#     pdo pdo_mysql mbstring exif pcntl bcmath intl opcache zip gd

RUN apt-get update && \
    apt-get install -y \
    unzip \
    libfreetype-dev \
    libjpeg62-turbo-dev \
    libpng-dev \
    zlib1g-dev && \
    rm -rf /var/lib/apt/lists/*

RUN docker-php-source extract \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) gd \
	&& docker-php-ext-install pdo_mysql mysqli \
	&& docker-php-source delete

ADD https://github.com/eventschedule/eventschedule/releases/download/${VERSION}/eventschedule.zip /tmp/eventschedule.zip

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