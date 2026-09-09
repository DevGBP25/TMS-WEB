# GBP · TMS

Sistema de gestión de transporte: planificación de viajes, asignación de unidad y
piloto, y seguimiento de entregas contra SAP Business One.

Backend en ASP.NET Core con arquitectura por capas (Dapper sobre SQL Server) y
frontend en React + Vite. En producción **es un solo sitio de IIS**: la API sirve el
build de React desde su `wwwroot`, así que no hay CORS ni un segundo sitio que mantener.

---

## Estructura

```
TMS/
├── backend/
│   ├── Gbp.Tms.sln
│   ├── Gbp.Tms.Api/              Web API: controllers, Program.cs, middleware
│   │   └── wwwroot/              destino del build de React (generado, no se versiona)
│   ├── Gbp.Tms.Application/      casos de uso, DTOs, interfaces de repositorio
│   ├── Gbp.Tms.Domain/           entidades: Viaje, ViajeParada, Ruta, Piloto, Unidad
│   └── Gbp.Tms.Infrastructure/   Dapper/SQL Server + cliente SAP Service Layer
├── frontend/
│   ├── src/  package.json  vite.config.ts
│   └── .env.development
├── database/                     scripts de esquema y datos de prueba
├── publish/                      ÚNICO path físico que ve IIS (generado)
├── deploy.ps1
└── README.md
```

La dependencia entre capas va en una sola dirección:

```
Api  →  Application  →  Domain
 └───→  Infrastructure  ┘
```

`Application` define las interfaces (`IViajeRepository`, `ISapServiceLayerClient`) y
`Infrastructure` las implementa. El dominio no conoce a nadie.

---

## Requisitos

| Herramienta   | Versión usada | Nota                                             |
|---------------|---------------|--------------------------------------------------|
| .NET SDK      | 9.0.102       | ver *Actualizar a .NET 10* más abajo              |
| Node.js       | 24.15         | 20 LTS o superior                                 |
| SQL Server    | cualquiera    | local para desarrollo                             |
| IIS           | con Hosting Bundle de ASP.NET Core | sólo en el servidor        |

---

## Puesta en marcha

### 1. Base de datos

```bash
sqlcmd -S localhost -E -Q "IF DB_ID('BD_Tms') IS NULL CREATE DATABASE BD_Tms;"
```

```bash
sqlcmd -S localhost -E -d BD_Tms -b -i database/01_schema.sql
```

Datos de prueba (5 rutas, 4 pilotos, 4 unidades y un viaje con dos paradas):

```bash
sqlcmd -S localhost -E -d BD_Tms -b -i database/02_datos_prueba.sql
```

> Los `.sql` están guardados en **UTF-8 con BOM**: sin el BOM, sqlcmd los lee como ANSI
> y los acentos entran corruptos a la base. Los scripts también fijan
> `SET QUOTED_IDENTIFIER ON`, que el índice filtrado `UX_TmsParada_SapDocEntry` exige
> para cualquier INSERT/UPDATE/DELETE sobre `TmsViajeParada`.

### 2. Configuración local

`backend/Gbp.Tms.Api/appsettings.Development.json` ya apunta a `localhost` / `BD_Tms`
con autenticación integrada. Las credenciales de SAP van fuera del repositorio:

```bash
dotnet user-secrets set "Sap:User" "manager" --project backend/Gbp.Tms.Api
```

```bash
dotnet user-secrets set "Sap:Password" "..." --project backend/Gbp.Tms.Api
```

### 3. Levantar en desarrollo

Dos terminales. Backend:

```bash
dotnet run --project backend/Gbp.Tms.Api --launch-profile http
```

Frontend:

```bash
npm run dev --prefix frontend
```

| Servicio     | URL                     |
|--------------|-------------------------|
| Frontend     | http://localhost:5173   |
| API          | http://localhost:5202   |
| **Swagger**  | http://localhost:5202/swagger |
| OpenAPI JSON | http://localhost:5202/swagger/v1/swagger.json |

Swagger sólo se publica en `Development`: en producción no conviene exponer el
catálogo de endpoints. Las descripciones salen de los comentarios XML de los
controllers, los DTOs y las entidades, así que los tres proyectos tienen
`GenerateDocumentationFile` activado.

Vite hace proxy de `/api` hacia el 5202, así que el código del frontend usa siempre
rutas relativas y no cambia nada al publicar.

Diagnóstico rápido:

```bash
curl http://localhost:5202/api/salud/bd
```

### Si un puerto está ocupado

`Failed to bind to address http://127.0.0.1:5202: address already in use` o
`Port 5173 is already in use` significan que quedó una instancia anterior viva
(una terminal cerrada sin `Ctrl+C`, o el backend corriendo en segundo plano).

Ver quién tiene el puerto y liberarlo:

```powershell
Get-NetTCPConnection -LocalPort 5202,5173 -State Listen | Select-Object LocalPort, OwningProcess
```

```powershell
Get-NetTCPConnection -LocalPort 5202,5173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Vite está configurado con `strictPort: true` a propósito: si el 5173 está tomado
falla en vez de saltar al 5174, porque el proxy y el origen permitido en CORS
asumen ese puerto.

---

## Despliegue

```powershell
.\deploy.ps1
```

Compila el frontend a `backend/Gbp.Tms.Api/wwwroot`, publica el backend en `publish/`
y verifica que estén `Gbp.Tms.Api.dll`, `web.config` y `wwwroot/index.html`.

Con IIS de por medio, conviene detener el pool para que suelte los DLL:

```powershell
.\deploy.ps1 -AppPool 'TMS' -SiteName 'TMS'
```

Otras opciones: `-SkipFrontend`, `-SkipBackend`, `-Configuration Debug`,
`-PublishDir <ruta>`.

### Configurar el sitio en IIS

1. Instalar el **ASP.NET Core Hosting Bundle** (el que corresponda al runtime, hoy 9.x).
2. Crear el sitio apuntando el path físico a `TMS\publish`.
3. Pool de aplicaciones en **No Managed Code** (ASP.NET Core corre fuera del CLR de IIS).
4. Cadena de conexión y credenciales SAP como **variables de entorno del pool**, no en
   el `appsettings.json` versionado:

   | Variable                          | Ejemplo                          |
   |-----------------------------------|----------------------------------|
   | `ConnectionStrings__Tms`          | `Server=...;Database=BD_Tms;...` |
   | `Sap__Url`                        | `https://sap...:50000/b1s/v1`    |
   | `Sap__Company`                    | `BD_Tecnolite`                   |
   | `Sap__User` / `Sap__Password`     | usuario de servicio              |
   | `ASPNETCORE_ENVIRONMENT`          | `Production`                     |

   El doble guión bajo es cómo .NET mapea variables de entorno a secciones anidadas.

`deploy.ps1` conserva `logs/` y `App_Data/` al limpiar el destino, para no borrar lo
que el servidor haya acumulado.

---

## API

| Método | Ruta                          | Descripción                                     |
|--------|-------------------------------|--------------------------------------------------|
| GET    | `/api/salud`                  | ping de la API                                    |
| GET    | `/api/salud/bd`               | verifica la conexión a SQL Server                 |
| GET    | `/api/viajes`                 | listado paginado y filtrable                      |
| GET    | `/api/viajes/{id}`            | viaje con sus paradas                             |
| GET    | `/api/viajes/indicadores`     | tarjetas del tablero                              |
| GET    | `/api/viajes/disponibles`     | entregas de SAP aún no asignadas a un viaje       |
| POST   | `/api/viajes`                 | crea el viaje desde entregas de SAP               |
| POST   | `/api/viajes/{id}/asignar`    | asigna unidad y piloto                            |
| POST   | `/api/viajes/{id}/estado`     | avanza el estado del viaje                        |
| GET    | `/api/catalogos/{pilotos\|unidades\|rutas}` | catálogos para los combos       |

Los errores de negocio salen como `{ "ok": false, "mensaje": "..." }` con 400 o 404;
el resto se registra y sale como 500 genérico en producción.

### Máquina de estados del viaje

```
Planificado ──► Asignado ──► EnRuta ──► Entregado ──► Liquidado
     │              │           │            │
     └──────────────┴───────────┴────────────┴──► Cancelado
```

`ViajeService` rechaza cualquier otro salto. Al pasar a `EnRuta` se sella `SalidaReal`
y la unidad queda `EnRuta`; al cerrar el viaje la unidad vuelve a `Disponible`.
Antes de asignar se valida que la unidad esté disponible, que su capacidad alcance el
peso del viaje y que la licencia del piloto esté vigente.

---

## Integración con SAP

`SapServiceLayerClient` mantiene una sesión `B1SESSION` por proceso, la renueva al
vencer el plazo de `Sap:SesionMin` y reintenta una vez si SAP responde 401. Con
`Sap:VerifySsl` en `false` acepta el certificado interno del Service Layer.

Hoy consume `DeliveryNotes` (ODLN) para alimentar la planificación. **El peso por
entrega llega en cero**: hay que decidir con logística de dónde sale (líneas del
documento, peso del artículo o un campo de usuario) y completarlo en
`SapServiceLayerClient.Map`.

---

## Pendientes conocidos

- **Autenticación**: `ViajesController.Crear` usa `User.Identity?.Name ?? "sistema"`.
  Falta conectar el login del portal.
- **Peso por entrega** desde SAP (arriba).
- **Actualización de paradas**: el modelo y la tabla soportan llegada, receptor y
  motivo de rechazo, pero todavía no hay endpoint para que el piloto las marque.
- **Reversa del stock en SAP** al cancelar un viaje ya despachado.

---

## Actualizar a .NET 10

El proyecto está en `net9.0` porque es el SDK instalado en el equipo de desarrollo.
Para pasar a .NET 10 basta con instalar el SDK y cambiar el `TargetFramework` en los
cuatro `.csproj`; conviene subir también los paquetes `Microsoft.Extensions.*` y
`Serilog.AspNetCore` a la línea `10.x` para que coincidan con el runtime.
