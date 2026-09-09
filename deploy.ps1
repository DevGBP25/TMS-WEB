<#
.SYNOPSIS
    Compila el frontend y el backend del TMS y deja todo listo en .\publish,
    que es el único path físico que apunta el sitio de IIS.

.EXAMPLE
    .\deploy.ps1
    Publica en Release sobre .\publish.

.EXAMPLE
    .\deploy.ps1 -SkipFrontend
    Republica sólo el backend, reutilizando el wwwroot ya generado.

.EXAMPLE
    .\deploy.ps1 -AppPool 'TMS' -SiteName 'TMS'
    Detiene el pool antes de copiar y lo reinicia al terminar, para evitar
    que IIS mantenga bloqueados los DLL.
#>

[CmdletBinding()]
param(
    [string] $Configuration = 'Release',
    [string] $PublishDir    = (Join-Path $PSScriptRoot 'publish'),
    [string] $AppPool,
    [string] $SiteName,
    [switch] $SkipFrontend,
    [switch] $SkipBackend
)

$ErrorActionPreference = 'Stop'

$backendDir  = Join-Path $PSScriptRoot 'backend'
$apiProject  = Join-Path $backendDir 'Gbp.Tms.Api\Gbp.Tms.Api.csproj'
$frontendDir = Join-Path $PSScriptRoot 'frontend'
$wwwroot     = Join-Path $backendDir 'Gbp.Tms.Api\wwwroot'

function Write-Paso($texto) {
    Write-Host ''
    Write-Host "==> $texto" -ForegroundColor Cyan
}

$inicio = Get-Date
Write-Host "TMS · despliegue $Configuration" -ForegroundColor Green
Write-Host "Destino: $PublishDir"

# ---------- 1. Frontend ----------

if (-not $SkipFrontend) {
    Write-Paso 'Compilando frontend (Vite -> wwwroot)'

    Push-Location $frontendDir
    try {
        if (-not (Test-Path 'node_modules')) {
            Write-Host 'Instalando dependencias (npm ci)...'
            npm ci
            if ($LASTEXITCODE -ne 0) { throw "npm ci falló con código $LASTEXITCODE." }
        }

        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build falló con código $LASTEXITCODE." }
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path (Join-Path $wwwroot 'index.html'))) {
        throw "El build no generó index.html en $wwwroot."
    }
}
else {
    Write-Paso 'Frontend omitido (-SkipFrontend)'
}

# ---------- 2. Detener IIS ----------

$poolDetenido = $false

if ($AppPool) {
    Write-Paso "Deteniendo el pool de aplicaciones '$AppPool'"
    Import-Module WebAdministration -ErrorAction Stop

    if ((Get-WebAppPoolState -Name $AppPool).Value -eq 'Started') {
        Stop-WebAppPool -Name $AppPool
        $poolDetenido = $true

        # El worker process tarda un momento en soltar los DLL.
        $intentos = 0
        while ((Get-WebAppPoolState -Name $AppPool).Value -ne 'Stopped' -and $intentos -lt 20) {
            Start-Sleep -Milliseconds 500
            $intentos++
        }
    }
    else {
        Write-Host 'El pool ya estaba detenido.'
    }
}

try {
    # ---------- 3. Backend ----------

    if (-not $SkipBackend) {
        Write-Paso "Publicando backend en $PublishDir"

        # Se limpia el destino pero se conservan logs y App_Data del servidor.
        if (Test-Path $PublishDir) {
            Get-ChildItem -Path $PublishDir -Force |
                Where-Object { $_.Name -notin @('logs', 'App_Data') } |
                Remove-Item -Recurse -Force
        }
        else {
            New-Item -ItemType Directory -Path $PublishDir | Out-Null
        }

        dotnet publish $apiProject `
            --configuration $Configuration `
            --output $PublishDir `
            --nologo

        if ($LASTEXITCODE -ne 0) { throw "dotnet publish falló con código $LASTEXITCODE." }
    }
    else {
        Write-Paso 'Backend omitido (-SkipBackend)'
    }
}
finally {
    # ---------- 4. Reiniciar IIS ----------

    if ($poolDetenido) {
        Write-Paso "Iniciando el pool '$AppPool'"
        Start-WebAppPool -Name $AppPool
    }
}

# ---------- 5. Verificación ----------

Write-Paso 'Verificando la publicación'

$requeridos = @('Gbp.Tms.Api.dll', 'web.config', 'wwwroot\index.html')
$faltantes  = $requeridos | Where-Object { -not (Test-Path (Join-Path $PublishDir $_)) }

if ($faltantes) {
    throw "Faltan archivos en la publicación: $($faltantes -join ', ')"
}

Write-Host 'Publicación completa:' -ForegroundColor Green
$requeridos | ForEach-Object { Write-Host "  OK  $_" }

if ($SiteName) {
    Write-Paso "Comprobando el sitio '$SiteName'"
    Import-Module WebAdministration -ErrorAction SilentlyContinue
    Get-Website -Name $SiteName | Format-Table Name, State, PhysicalPath -AutoSize
}

$duracion = (Get-Date) - $inicio
Write-Host ''
Write-Host ("Listo en {0:mm\:ss}." -f $duracion) -ForegroundColor Green
Write-Host 'Recuerde configurar la cadena de conexión y las credenciales SAP en el servidor'
Write-Host '(variables de entorno del pool o appsettings.Production.json fuera del control de versiones).'
