# Aparcamientos en tiempo real

Las **plazas libres de los aparcamientos públicos** de varias ciudades francesas, leídas en directo
en sus portales de datos abiertos: Estrasburgo, Bordeaux Métropole, Nantes Métropole, Rennes
(aparcamientos de Citédia y aparcamientos disuasorios de la red STAR), el área de Grenoble y Grand
Poitiers. **Sin cuenta ni clave.**

Integración no oficial, sin relación con las ciudades, las metrópolis ni los operadores de los
aparcamientos. Desarrollada sin el hardware: las fuentes se comprobaron en directo el 21/10/2026,
pero sus comentarios son bienvenidos.

## Lo que obtiene

- Un **dispositivo por aparcamiento** que añada: plazas libres, plazas totales, ocupación, abierto
  o cerrado (según la ciudad) y antigüedad del dato.
- Un **widget** «Aparcamientos»: sus aparcamientos en una línea cada uno, en verde, naranja o rojo
  según la ocupación.
- Cuatro **disparadores de escena**: plazas libres por debajo de un umbral, plazas libres de nuevo
  por encima de un umbral, aparcamiento completo, aparcamiento cerrado.
- Una **acción de escena**: entre sus aparcamientos, encontrar el abierto con más plazas libres,
  con una frase lista para enviar.

## Requisitos

- Gladys Assistant **5.1.0** o posterior.
- Acceso a Internet desde Gladys: los datos vienen de los portales de datos abiertos de las
  ciudades.
- Ninguna cuenta, ninguna clave de API.

## Instalación

1. En Gladys, abra **Integraciones → Instalar desde GitHub**.
2. Pegue la dirección `https://github.com/guim31/gladys-parkings` y confirme.
3. Abra la integración una vez instalada: aparece la pestaña **Configuración**.

## Configuración

### Ajustes

| Ajuste                       | Efecto                                                                   |
| ---------------------------- | ------------------------------------------------------------------------ |
| Ciudades                     | las ciudades cuyos aparcamientos se proponen en la pestaña Descubrir     |
| Actualización                | cada 2, 3 (por defecto) o 5 minutos                                      |
| Idioma de nombres y mensajes | idioma de los nombres de funciones, del widget y de las frases (francés) |

Los nombres de las funciones se fijan al añadir el dispositivo: elija el idioma antes.

### Añadir aparcamientos

1. Marque una o varias ciudades y guarde.
2. Abra la pestaña **Descubrir**: todos los aparcamientos de esas ciudades con recuento en directo
   aparecen allí, como «Ciudad · Aparcamiento».
3. Añada a Gladys los que le interesen. Sus valores llegan enseguida.

Los aparcamientos añadidos son los **aparcamientos vigilados**: el widget, los disparadores y la
acción de escena los proponen. Un aparcamiento añadido se sigue leyendo aunque desmarque después
su ciudad.

### Comprobar

La acción **Estado** de la pestaña Configuración muestra las ciudades leídas, el número de
aparcamientos con recuento en directo, la hora de la última lectura, el último error y el número de
aparcamientos añadidos.

## Dispositivos

Cada aparcamiento añadido es un dispositivo de solo lectura:

| Función             | Tipo Gladys        | Valor                                                             |
| ------------------- | ------------------ | ----------------------------------------------------------------- |
| Plazas libres       | contador           | plazas disponibles según el operador                              |
| Plazas totales      | contador           | capacidad anunciada                                               |
| Ocupación           | nivel (%)          | parte de las plazas ocupadas, de 0 a 100                          |
| Abierto             | binario            | 1 abierto, 0 cerrado o solo abonados (según la ciudad, más abajo) |
| Antigüedad del dato | duración (minutos) | antigüedad del recuento                                           |

La función **Abierto** solo existe para las ciudades que publican el estado de sus aparcamientos:
Estrasburgo, Bordeaux, Nantes y Rennes. Grenoble y Poitiers no lo publican.

La **antigüedad del dato** parte de la hora dada por la ciudad cuando la publica (Bordeaux, Nantes,
STAR, Grenoble, Poitiers), si no de la última lectura correcta (Estrasburgo, Citédia). Crece si el
portal deja de responder: pasados **30 minutos**, el dato se considera **caducado**.

## Widget del panel

Añada el widget **Aparcamientos** a un panel. Muestra una línea por aparcamiento vigilado (diez como
máximo), por ejemplo «Feydeau — 165 / 490 libres». En los ajustes del widget puede elegir los
aparcamientos mostrados; vacío, los muestra todos.

Colores: **verde** hasta el 80 % de ocupación, **naranja** del 80 al 95 %, **rojo** por encima o
cuando el operador lo anuncia completo, **gris** cuando está cerrado, sin recuento o con el dato
caducado.

## Disparadores de escena

| Disparador                            | Ocurre cuando                                                           |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Plazas libres por debajo de un umbral | las plazas libres bajan al umbral elegido (5, 10, 20, 50, 100)          |
| Plazas libres de nuevo                | las plazas libres suben por encima del umbral elegido                   |
| Aparcamiento completo                 | no queda ninguna plaza, o completo según el operador (umbral de Nantes) |
| Aparcamiento cerrado                  | el aparcamiento cierra (ciudades que publican el estado)                |

El campo **Aparcamientos** filtra los aparcamientos afectados; vacío, cualquier aparcamiento
vigilado. Las variables disponibles en las acciones siguientes: aparcamiento, ciudad, plazas
libres, plazas totales, ocupación.

Los disparadores comparan dos lecturas sucesivas: nada se dispara cuando un portal vuelve tras una
avería, ni con un dato caducado.

## Acción de escena

**Buscar el aparcamiento con más plazas libres**: entre sus aparcamientos vigilados (o los
elegidos), el que está abierto, tiene un recuento reciente y más plazas libres. Resultados:

- `found`: 1 si se encontró un aparcamiento, 0 si no (para comprobar con «Continuar solo si»);
- `sentence`: «Feydeau: 165 plazas libres de 490.», o «Ningún aparcamiento vigilado tiene plazas
  libres en este momento.»;
- `parking_name`, `city`, `free`, `total`, `occupancy`.

La frase sigue el idioma elegido en la configuración.

## Ejemplos de escenas

- **Antes de ir al centro**: disparador «Calendario» o un botón, acción «Buscar el aparcamiento con
  más plazas libres» y luego «Enviar un mensaje» con `sentence`.
- **Aparcamiento de la estación casi lleno**: disparador «Plazas libres por debajo de un umbral»
  (aparcamiento de la estación, umbral 20) un día laborable por la mañana, y luego una
  notificación «Salga antes o tome el tranvía».
- **Aparcamiento disuasorio libre de nuevo**: disparador «Plazas libres de nuevo» (umbral 50) en su
  aparcamiento disuasorio, y luego un mensaje.

## Datos y actualización

| Ciudad           | Portal                                        | Hora publicada | Estado abierto/cerrado |
| ---------------- | --------------------------------------------- | -------------- | ---------------------- |
| Estrasburgo      | data.strasbourg.eu (Opendatasoft)             | no             | sí                     |
| Bordeaux         | opendata.bordeaux-metropole.fr (Opendatasoft) | sí             | sí                     |
| Nantes           | data.nantesmetropole.fr (Opendatasoft)        | sí             | sí                     |
| Rennes (Citédia) | data.rennesmetropole.fr (Opendatasoft)        | no             | sí                     |
| Rennes (STAR)    | data.explore.star.fr (Opendatasoft)           | sí             | sí                     |
| Grenoble         | data.mobilites-m.fr (API Mobilités M)         | sí             | no                     |
| Poitiers         | data.grandpoitiers.fr (Data Fair)             | sí             | no                     |

Una petición por ciudad y por lectura (dos para Grenoble, cuya lista de aparcamientos solo se relee
una vez al día), unas decenas de kilobytes. Cada 2 minutos son 720 peticiones al día por ciudad, muy
por debajo de las cuotas de los portales para un uso anónimo. Solo se leen las ciudades marcadas y
las de los aparcamientos añadidos.

Bordeaux: solo se proponen los aparcamientos «conectados» (recuento en directo). STAR: las plazas
contadas son las ordinarias (sin las de coche compartido, vehículos eléctricos y movilidad
reducida).

## Solución de problemas

- **Ningún aparcamiento en Descubrir**: compruebe que hay una ciudad marcada y guardada, y ejecute
  la acción **Estado**. Un error «HTTP 503» o «timeout» viene del portal de la ciudad: inténtelo
  más tarde.
- **«dato caducado» en el widget**: el portal no responde o no actualiza este aparcamiento desde
  hace más de 30 minutos. El valor mostrado es el último conocido.
- **Falta un aparcamiento**: no tiene recuento en directo (sin sensores, o averiados). Aparecerá en
  cuanto la ciudad publique un recuento.
- **No hay función «Abierto»**: la ciudad no publica el estado de sus aparcamientos (Grenoble,
  Poitiers).
- Para más detalles, ponga `LOG_LEVEL=debug`: cada lectura queda entonces registrada.

## Limitaciones

- Solo se admiten las ciudades indicadas. **Toulouse** solo publica datos estáticos (capacidades,
  tarifas), sin plazas libres. **Lyon** publica las plazas libres de los aparcamientos LPA sin su
  capacidad, **Angers** también; **Montpellier** estaba fuera de servicio durante las pruebas; para
  Lille y Metz ya no se encontró ningún flujo público: estas ciudades podrán añadirse si sus datos
  lo permiten.
- Las cifras son las de los operadores, actualizadas por ellos cada uno a cinco minutos: pueden
  diferir del panel de la entrada del aparcamiento.
- Solo lectura: sin reserva ni pago.

## Créditos

- Datos: Eurométropole de Strasbourg, Bordeaux Métropole, Nantes Métropole, Rennes Métropole y
  STAR, SMMAG – Mobilités M, Grand Poitiers, bajo sus licencias abiertas respectivas (Licence
  Ouverte / ODbL).
- Mismo uso que integraciones comunitarias de aparcamientos de Home Assistant (sin código tomado).
- Creada a partir de la
  [plantilla oficial de integración](https://github.com/GladysAssistant/integration-template-js).
