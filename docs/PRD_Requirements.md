# VoIP Manager

## Descripcion

El objetivo del proyecto es poder administrar una instancia de Asterisk version 18+, administrando endpoints, colas
permisos de marcacion, configuracion de audios en general


## Objetos a administrar

### Extensiones PJSIP

El servicio de poder administrar utilizando una base de datos donde se registren los endpoints, permitiendo poder
autenticar cada extension

Debe permitir:

- Crear
- Clonar existente
- Modificar
- Eliminar

Debe contemplar las opciones mas utilizadas para configurar, y aquellas opciones menos utilizadas manejar en un apartado
como avanzado para configurar manual ( en caso de ser necesario )

### Colas de atencion

El servicio de poder tener la opcion de administrar colas de atencion ( tipo call center ), permitiendo poder:

- Para colas
    - Agregar
    - Modificar
    - Eliminar

- Para los miembros de las colas
    - Agregar extensiones (PJSIP)
    - Quitar extensiones

Para agregar miembros a la cola, las extensiones debe poder estar no eliminadas

### Troncales SIP (PJSIP)

La creacion de troncales debe poder almacenarse donde se almancenan las extensiones normales, solo que debe poder identificarse
como `trunk`, esto para que la administracion se realice de forma independiente.

Se debe poder definir troncales que:

- Sin registro, solo con un IP (interna/external)
- Con usuario y password
    - Seleccionar si requiere registro con el carrier
    - Definir un callerid opcional

### Plan de marcado

- Debe poder definir por base de datos, definir el nombre del contexto y las prioridades que debe ejecutar


### Las configuraciones

- Las configuraciones de cada objeto debe realizarse con el esquema de `Realtime` que maneja asterisk mismo, utilizando
`alembic` para instalar el esquema de base de datos
- La conexion a la base de datos se debe realizar utilizando ODBC (MariaDB/ODBC)
- El CDR se debe guardar tambien en la base de datos
- Debe contener una sesion de AMI para poder realizar el reinicio de modulos (aquellos que soporten), el monitoreo de
    la extensiones que estan registradas (para mostrar en un dashboard o en un KPI)
- Poder hacer pruebas de marcacion a extensiones (utilizando Originate)
- Poder leer logs del mismo servicio para detectar errores o inconsistencias en el servicio


### Otros requerimientos

El servicio de administracion debe tener el stack:

- NodeJS 24+
- `Fastify`. Manejo de las rutas y el entorno de ejecucion de la API/web
- `zod`. Validador de parametros/datos/variables de entorno
- `asterisk-manager`. Conectividad con Asterisk
- `ip-range-check`. Para manejar el permiso desde las IP autorizadas al servicio
- `dizzle`. Manejo de base de datos a Mysql/MariaDB
- La autenticacion debe ser local, pero implementar JWT para las autorizaciones
- Los usuarios debe poder tener roles que permitan realizar operaciones sobre los diferentes objetos
- `VueJS`. Para el manejo de la interfaz web (Frontend), utilizando las mejores practicas de UI/UX
- Para el estilo de la web, utilizar `https://www.shadcn-vue.com/`



Desarrollado: Saul Uribe
Fecha: 17/11/2026
