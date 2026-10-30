@echo off
REM Atualiza todos os dados da Camara de Tatui e regenera o site.
REM Pode ser agendado no Agendador de Tarefas do Windows (ver docs\AGENTES.md).
cd /d "%~dp0agentes"
python orquestrador.py %*
