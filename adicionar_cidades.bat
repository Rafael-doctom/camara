@echo off
REM Adiciona Itapetininga, Cerquilho e Ipero ao site: descobre a configuracao de cada Camara
REM no SisCam e coleta os dados. Cidade ja configurada e pulada. Demora: a primeira coleta
REM de cada cidade leva bastante tempo (legislaturas anteriores incluidas).
cd /d "%~dp0agentes"
python descobrir_cidade.py itapetininga --nome "Itapetininga"
python descobrir_cidade.py cerquilho --nome "Cerquilho"
python descobrir_cidade.py ipero --nome "Iperó"
python orquestrador.py --cidade itapetininga
python orquestrador.py --cidade cerquilho
python orquestrador.py --cidade ipero
pause
