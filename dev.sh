#!/bin/bash
# dev.sh - Script para iniciar el entorno de desarrollo con hot reload

# Detener contenedores existentes
echo "Deteniendo contenedores existentes..."
docker compose down

# Iniciar en modo desarrollo
echo "Iniciando contenedor en modo desarrollo con hot reload..."
docker compose -f docker-compose.yml up -d

# Mostrar logs
echo "Mostrando logs (Ctrl+C para salir)..."
docker logs -f whatsapp-erp-chatbot