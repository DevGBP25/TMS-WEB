<#
.SYNOPSIS
    Revisa si un servidor Windows tiene lo necesario para hospedar el TMS Web en IIS.

.DESCRIPTION
    Comprueba, en este orden: IIS, el runtime de ASP.NET Core, el modulo
    AspNetCoreModuleV2 (lo que instala el Hosting Bundle) y el acceso a SQL.

    No modifica nada. Se puede correr las veces que haga falta.

    La comprobacion del modulo necesita una sesion de administrador: appcmd.exe
    la exige. Sin elevacion ese punto se informa como no comprobado, nunca como
    faltante, para no dar una alarma falsa.

.EXAMPLE
    .\verificar-servidor.ps1

.EXAMPLE
    .\verificar-servidor.ps1 -ServidorSql '10.0.1.6'
    Ademas prueba que el servidor alcance SQL en el puerto 1433.
#>

[CmdletBinding()]
param(
    # El TMS se compila para .NET 8, que es lo que ya tiene el servidor.
    [int]    $VersionNet = 8,
    [string] $ServidorSql,
    [int]    $PuertoSql = 1433
)

$fallas = New-Object System.Collections.ArrayList

$esAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

function Resultado {
    param([bool] $ok, [string] $titulo, [string] $detalle, [string] $comoArreglar)

    if ($ok) {
        Write-Host '  [ OK ] ' -ForegroundColor Green -NoNewline
    }
    else {
        Write-Host '  [FALTA] ' -ForegroundColor Red -NoNewline
        [void] $fallas.Add("$titulo -> $comoArreglar")
    }

    Write-Host $titulo -NoNewline
    if ($detalle) { Write-Host "  ($detalle)" -ForegroundColor DarkGray } else { Write-Host '' }
}

function SinComprobar {
    param([string] $titulo, [string] $motivo)

    Write-Host '  [ ?? ] ' -ForegroundColor Yellow -NoNewline
    Write-Host $titulo -NoNewline
    Write-Host "  ($motivo)" -ForegroundColor DarkGray
}

Write-Host ''
Write-Host 'Verificacion de requisitos - TMS Web' -ForegroundColor Cyan
Write-Host ("Equipo: {0}    {1}" -f $env:COMPUTERNAME, (Get-Date -Format 'dd/MM/yyyy HH:mm'))
Write-Host ('-' * 62)

if (-not $esAdmin) {
    Write-Host ''
    Write-Host 'Aviso: esta sesion no es de administrador, asi que el registro del' -ForegroundColor Yellow
    Write-Host 'modulo en IIS no se puede comprobar (appcmd.exe lo exige).'        -ForegroundColor Yellow
}

# ---------------------------------------------------------------- 1. Windows / IIS

$so = Get-CimInstance Win32_OperatingSystem
Write-Host ''
Write-Host 'Sistema' -ForegroundColor Yellow
Write-Host "  $($so.Caption)  build $($so.BuildNumber)" -ForegroundColor DarkGray

Write-Host ''
Write-Host 'IIS' -ForegroundColor Yellow

$w3svc = Get-Service W3SVC -ErrorAction SilentlyContinue
Resultado ($null -ne $w3svc) 'Servicio IIS (W3SVC) instalado' $(if ($w3svc) { "estado: $($w3svc.Status)" }) `
    'Agregar el rol Web Server (IIS) desde Administrador del servidor.'

if ($w3svc -and $w3svc.Status -ne 'Running') {
    Write-Host '  [AVISO] El servicio existe pero no esta ejecutandose.' -ForegroundColor Yellow
}

# ---------------------------------------------------------- 2. Runtime de ASP.NET Core

Write-Host ''
Write-Host 'Runtime de .NET' -ForegroundColor Yellow

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue

if (-not $dotnet) {
    Resultado $false 'Comando dotnet disponible' '' `
        "Instalar el Hosting Bundle de .NET $VersionNet (incluye el runtime)."
    $runtimes = @()
}
else {
    $runtimes = & dotnet --list-runtimes 2>$null
}

# El TMS es una aplicacion web: necesita Microsoft.AspNetCore.App, no solo NETCore.App.
$aspnet = $runtimes | Where-Object { $_ -match "^Microsoft\.AspNetCore\.App $VersionNet\." }
$base   = $runtimes | Where-Object { $_ -match "^Microsoft\.NETCore\.App $VersionNet\." }

Resultado ([bool] $base) "Runtime base .NET $VersionNet" `
    $(if ($base) { ($base | ForEach-Object { ($_ -split ' ')[1] }) -join ', ' }) `
    "Instalar el Hosting Bundle de .NET $VersionNet."

Resultado ([bool] $aspnet) "Runtime ASP.NET Core $VersionNet" `
    $(if ($aspnet) { ($aspnet | ForEach-Object { ($_ -split ' ')[1] }) -join ', ' }) `
    "Instalar el Hosting Bundle de .NET $VersionNet (el runtime base solo no sirve para una app web)."

# --------------------------------------------------- 3. Hosting Bundle / modulo de IIS

Write-Host ''
Write-Host 'Modulo de IIS (lo decisivo)' -ForegroundColor Yellow

$ancm = Join-Path $env:ProgramFiles 'IIS\Asp.Net Core Module\V2\aspnetcorev2.dll'
$hayAncm = Test-Path $ancm
$versionAncm = ''
if ($hayAncm) { $versionAncm = "v$((Get-Item $ancm).VersionInfo.FileVersion)" }

Resultado $hayAncm 'AspNetCoreModuleV2 presente' $versionAncm `
    "Instalar el Hosting Bundle de .NET $VersionNet. Si IIS se instalo despues, reparar el bundle."

# Que el archivo exista no basta: IIS tiene que tenerlo registrado como modulo global.
$appcmd = Join-Path $env:windir 'system32\inetsrv\appcmd.exe'

if (-not $esAdmin) {
    SinComprobar 'AspNetCoreModuleV2 registrado en IIS' 'requiere sesion de administrador'
}
elseif (-not (Test-Path $appcmd)) {
    SinComprobar 'AspNetCoreModuleV2 registrado en IIS' 'no se encontro appcmd.exe'
}
else {
    $globales = & $appcmd list config /section:globalModules 2>&1 | Out-String
    $modulos  = & $appcmd list modules /name:AspNetCoreModuleV2 2>&1 | Out-String

    # Tiene que estar en los dos lados: cargado por el servidor y habilitado en el sitio.
    $registrado = ($globales -match 'AspNetCoreModuleV2') -and ($modulos -match 'AspNetCoreModuleV2')

    Resultado $registrado 'AspNetCoreModuleV2 registrado en IIS' '' `
        'Reparar el Hosting Bundle desde Programas y caracteristicas: IIS no lo tiene registrado.'
}

# --------------------------------------------------------------- 4. Acceso a SQL

if ($ServidorSql) {
    Write-Host ''
    Write-Host 'Conectividad con SQL Server' -ForegroundColor Yellow

    $prueba = Test-NetConnection -ComputerName $ServidorSql -Port $PuertoSql -WarningAction SilentlyContinue

    Resultado $prueba.TcpTestSucceeded "Alcanza ${ServidorSql}:${PuertoSql}" `
        $(if ($prueba.RemoteAddress) { "IP $($prueba.RemoteAddress)" }) `
        'Revisar el firewall entre este servidor y SQL, y que SQL escuche por TCP.'
}
else {
    Write-Host ''
    Write-Host 'Conectividad con SQL: omitida (pase -ServidorSql NOMBRE para probarla)' -ForegroundColor DarkGray
}

# ------------------------------------------------------------------ resumen

Write-Host ''
Write-Host ('-' * 62)

if ($fallas.Count -eq 0) {
    Write-Host 'No hay puntos pendientes. Se puede publicar el TMS.' -ForegroundColor Green
    if (-not $esAdmin) {
        Write-Host 'Queda sin comprobar el registro del modulo: repita como administrador.' -ForegroundColor Yellow
    }
}
else {
    Write-Host "Falta resolver $($fallas.Count) punto(s):" -ForegroundColor Red
    Write-Host ''
    $fallas | ForEach-Object { Write-Host "  - $_" }
    Write-Host ''
    Write-Host 'Descarga del Hosting Bundle:' -ForegroundColor Cyan
    Write-Host "  https://dotnet.microsoft.com/download/dotnet/$VersionNet.0"
    Write-Host '  Seccion "ASP.NET Core Runtime" -> "Hosting Bundle" (Windows)'
}

Write-Host ''
