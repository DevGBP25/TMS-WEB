# Despliegue del TMS Web en IIS

Backend y frontend son **un solo sitio**: Vite compila dentro de `wwwroot` de la API,
así que IIS sirve la página y la API desde el mismo origen. No hay que publicar dos sitios
ni configurar CORS en producción.

El paquete listo para copiar es `deploy/TMS-Web-publish.zip`.

---

## 1. Requisitos en el servidor

El TMS se compila para **.NET 8**, que el servidor ya tiene instalado
(`Microsoft.AspNetCore.App 8.0.15` y `8.0.22`). Por eso **no hay que instalar ningún
runtime**, que era justamente lo que se quería evitar en un servidor que también atiende SAP.

Queda una sola incógnita por confirmar:

| Componente | Estado |
|---|---|
| IIS | por confirmar |
| Runtime ASP.NET Core 8 | ✅ ya instalado |
| **Módulo `AspNetCoreModuleV2`** | **por confirmar** |
| Acceso a SQL (puerto 1433 hacia `DataTMS`) | por confirmar |

El módulo es lo único que puede faltar. Tener el runtime de ASP.NET Core **no implica**
tenerlo: el instalador suelto del runtime no lo incluye, sólo el *Hosting Bundle*. Es lo
que traduce las peticiones de IIS hacia la aplicación, y sin él el sitio devuelve 500.19
aunque todo lo demás esté bien.

Para comprobarlo, correr en el servidor:

```bash
powershell -ExecutionPolicy Bypass -File .\verificar-servidor.ps1 -ServidorSql NOMBRE-DEL-SQL
```

Si reporta que el módulo falta, instalar el **Hosting Bundle de .NET 8**
(https://dotnet.microsoft.com/download/dotnet/8.0 → *ASP.NET Core Runtime · Hosting Bundle*).
Instalarlo **después** de IIS; si IIS se agregó después, hay que *Reparar* el bundle desde
*Programas y características*, no reinstalarlo.

> **Nota de soporte.** .NET 8 deja de recibir parches en **noviembre de 2026**. Se eligió
> para no instalar nada en el servidor de SAP y poder verificar el despliegue de inmediato.
> Antes de esa fecha conviene migrar el proyecto a .NET 10 LTS, con soporte hasta 2028.
> El cambio es de una línea por proyecto: el retarget de 9 a 8 no requirió tocar código.

---

## 2. Copiar la aplicación

Descomprimir `TMS-Web-publish.zip` en, por ejemplo, `C:\inetpub\TMS`.

La carpeta debe quedar con `Gbp.Tms.Api.dll`, `web.config` y la subcarpeta `wwwroot`
en la raíz — no dentro de otra carpeta.

---

## 3. Configuración (esto no viaja en el paquete)

Copiar `deploy/appsettings.Production.json` junto al `.dll` y **editar la cadena de conexión**:
poner el nombre real del servidor SQL y la contraseña de `userdata`.

La llave JWT ya viene generada en ese archivo. No reutilizar la de desarrollo.

Ese archivo tiene credenciales: restringir su lectura a la identidad del pool y a
administradores, y no versionarlo (`.gitignore` ya lo excluye).

Alternativa sin archivo, si se prefiere: definir las variables de entorno
`ConnectionStrings__Tms` y `Jwt__Key` en el pool de aplicaciones. El doble guion bajo
es el separador de secciones.

---

## 4. Pool de aplicaciones

Crear un pool llamado `TMS`:

| Ajuste | Valor | Por qué |
|---|---|---|
| .NET CLR version | **No Managed Code** | La aplicación no usa el CLR de IIS; lo carga el módulo |
| Managed pipeline | Integrated | |
| Identity | `ApplicationPoolIdentity` | Suficiente salvo que SQL use autenticación de Windows |
| Idle Time-out | `0` | Evita que el primer acceso de la mañana tarde en responder |
| Regular Time Interval | `0` | Sin reciclado por reloj |

Dar permiso de escritura a la identidad del pool sobre la carpeta `logs`
(ahí escribe Serilog; sin permiso la aplicación no arranca):

```bash
icacls C:\inetpub\TMS\logs /grant "IIS AppPool\TMS:(OI)(CI)M"
```

Si la carpeta aún no existe, crearla antes.

---

## 5. Crear el sitio

En el Administrador de IIS: *Sites → Add Website*.

| Campo | Valor |
|---|---|
| Site name | `TMS` |
| Application pool | `TMS` (el del paso anterior, no `DefaultAppPool`) |
| Physical path | `C:\inetpub\TMS` |
| Type | `http` |
| IP address | `All Unassigned` |
| Port | `8080` |
| Host name | **vacío** |

Como todavía no hay dominio, conviene dejar el *Host name* en blanco y usar un puerto
propio: así se entra por `http://IP-DEL-SERVIDOR:8080` sin depender de DNS y sin chocar
con lo que ya esté publicado en el puerto 80. Cuando exista el nombre definitivo se
agrega un binding más; no hay que rehacer nada.

**Abrir el puerto en el firewall.** IIS sólo abre el 80 y el 443 al instalarse; un puerto
distinto queda bloqueado y el sitio responde sólo desde el propio servidor:

```bash
netsh advfirewall firewall add rule name="TMS Web 8080" dir=in action=allow protocol=TCP localport=8080
```

Si al probar desde el servidor funciona pero desde tu equipo no, es esto.

---

## 6. Verificación

En este orden, porque cada paso descarta una causa distinta:

1. `http://IP-DEL-SERVIDOR:8080/` → debe cargar la pantalla de inicio de sesión.
   Probar primero desde el propio servidor; si ahí carga y desde afuera no, es el firewall.
2. `http://IP-DEL-SERVIDOR:8080/api/noexiste` → debe responder `404` con
   `{"ok":false,"mensaje":"No existe el endpoint /api/noexiste."}`.
   Si devuelve HTML, el sitio está sirviendo archivos estáticos pero la API no se está
   ejecutando.
3. `http://IP-DEL-SERVIDOR:8080/api/salud/bd` → confirma que llega a `DataTMS`.
4. Iniciar sesión con `admin`.

**Swagger no está disponible en producción**: sólo se registra en el entorno Development.
Es deliberado — expone la superficie completa de la API. Si se necesita para probar en el
servidor, se habilita aparte.

---

## 7. Si algo falla

| Error | Causa habitual |
|---|---|
| **500.19** | `web.config` no se puede leer, o falta el Hosting Bundle |
| **500.30** – *In-process start failure* | La aplicación arrancó y se cayó: casi siempre falta `Jwt:Key`, la cadena de conexión, o el permiso sobre `logs` |
| **500.31** – *Failed to load ASP.NET Core runtime* | Falta el runtime 8.x en el servidor |
| **502.5** | El proceso no inició. Ver el log de stdout |
| Página en blanco | Los archivos de `wwwroot` no se copiaron |

Para ver el detalle real del arranque, habilitar temporalmente el log de stdout en
`web.config`:

```xml
<aspNetCore processPath="dotnet" arguments=".\Gbp.Tms.Api.dll"
            stdoutLogEnabled="true" stdoutLogFile=".\logs\stdout"
            hostingModel="inprocess" />
```

Reiniciar el pool, reproducir el error y leer `logs\stdout_*.log`. **Volver a dejarlo en
`false`**: con el log activo el archivo crece sin límite.

El log de la aplicación —más legible— está en `logs\tms-AAAAMMDD.log`.

---

## 8. Republicar una versión nueva

Desde el equipo de desarrollo:

```bash
.\deploy.ps1
```

Genera `publish\` completo (frontend + backend). Copiar su contenido al servidor
**conservando** `appsettings.Production.json` y `logs`, con el pool detenido para que
IIS suelte los DLL.

Si el despliegue se hace en el mismo servidor donde corre IIS, el script puede encargarse
del pool:

```bash
.\deploy.ps1 -AppPool TMS -SiteName TMS
```
