PROJECT := SQLPal-Server

## Installs a development environment
install: deploy

## Composes project using docker-compose
deploy:
	docker-compose -f docker-compose.yml build --no-cache
	docker-compose -f docker-compose.yml down -v
	docker-compose -f docker-compose.yml up -d --force-recreate

uninstall: down

down:
	docker-compose -f docker-compose.yml down -v