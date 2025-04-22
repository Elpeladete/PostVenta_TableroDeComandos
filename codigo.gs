// Función principal para servir la página web
function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
      .setTitle("Tablero de Control - Service Plus");
}

// Función para leer y procesar el archivo CSV con filtro de fechas
function getDataFromCSV(startDate = null, endDate = null, vertical = null, assignee = null, sectorPV = null, priority = null, distributor = null, client = null, status = null) {
  try {
    const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQe2wNEhqN0q-DC67Yv7sWVnWXkKPgwIGSpV6uf8XEg6qFq1cn7guaTka6iVDA-F1lBLOVNFcDwVTS0/pub?gid=951524555&single=true&output=csv";
    const response = UrlFetchApp.fetch(csvUrl);

    if (response.getResponseCode() !== 200) {
      throw new Error("Error al cargar el archivo CSV. Código de respuesta: " + response.getResponseCode());
    }

    const csvData = response.getContentText();
    const rows = Utilities.parseCsv(csvData);

    if (!rows || rows.length === 0) {
      throw new Error("El archivo CSV está vacío o no contiene datos.");
    }

    const headers = rows[0].map(header => header.trim().toLowerCase());
    Logger.log("Encabezados del CSV: " + JSON.stringify(headers));

    const requiredColumns = [
      "status",
      "estado de la reparación",
      "ingresos generados",
      "cliente",
      "created at",
      "fecha de reporte",
      "fecha de validación de garantía",
      "fecha de resolución",
      "cubierto por garantía",
      "costo de garantía",
      "satisfacción del cliente",
      "vertical asociada", // Corregido: singular
      "assignee",
      "sector pv involucrado",
      "priority",
      "distribuidor asociado",
      "cliente asociado"
    ].map(col => col.toLowerCase());

    requiredColumns.forEach(col => {
      if (!headers.includes(col)) {
        throw new Error(`La columna requerida '${col}' no existe en el archivo CSV. Encabezados encontrados: ${JSON.stringify(headers)}`);
      }
    });

    const data = rows.slice(1);
    const filteredData = data.filter(row => {
      const createdAt = parseISODate(row[headers.indexOf("created at")]);
      if (!createdAt || isNaN(createdAt)) {
        Logger.log(`Fecha inválida en la fila: ${row[headers.indexOf("created at")]}`);
        return false;
      }

      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      const rowVertical = row[headers.indexOf("vertical asociada")]; // Corregido: singular
      const rowAssignee = row[headers.indexOf("assignee")];
      const rowSectorPV = row[headers.indexOf("sector pv involucrado")];
      const rowPriority = row[headers.indexOf("priority")];
      const rowDistributor = row[headers.indexOf("distribuidor asociado")];
      const rowClient = row[headers.indexOf("cliente asociado")];
      const rowStatus = row[headers.indexOf("status")];

      return (!start || createdAt >= start) &&
             (!end || createdAt <= end) &&
             (!vertical || rowVertical === vertical) &&
             (!assignee || rowAssignee === assignee) &&
             (!sectorPV || rowSectorPV === sectorPV) &&
             (!priority || rowPriority === priority) &&
             (!distributor || rowDistributor === distributor) &&
             (!client || rowClient === client) &&
             (!status || rowStatus === status);
    }).map(row => {
      return requiredColumns.map(col => row[headers.indexOf(col)]);
    });

    const kpis = calculateKPIs(filteredData, requiredColumns);
    Logger.log("KPIs calculados: " + JSON.stringify(kpis));
    return kpis;
  } catch (error) {
    Logger.log("Error en getDataFromCSV: " + error.message);
    throw error;
  }
}

// Función para obtener opciones únicas de una columna
function getUniqueOptions(columnName) {
  try {
    const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQe2wNEhqN0q-DC67Yv7sWVnWXkKPgwIGSpV6uf8XEg6qFq1cn7guaTka6iVDA-F1lBLOVNFcDwVTS0/pub?gid=951524555&single=true&output=csv";
    const response = UrlFetchApp.fetch(csvUrl);

    if (response.getResponseCode() !== 200) {
      throw new Error("Error al cargar el archivo CSV. Código de respuesta: " + response.getResponseCode());
    }

    const csvData = response.getContentText();
    const rows = Utilities.parseCsv(csvData);

    if (!rows || rows.length === 0) {
      throw new Error("El archivo CSV está vacío o no contiene datos.");
    }

    const headers = rows[0].map(header => header.trim().toLowerCase());
    const columnIndex = headers.indexOf(columnName.toLowerCase());

    if (columnIndex === -1) {
      throw new Error(`La columna '${columnName}' no existe en el archivo CSV.`);
    }

    const uniqueOptions = new Set();
    for (let i = 1; i < rows.length; i++) {
      const value = rows[i][columnIndex];
      if (value) {
        uniqueOptions.add(value);
      }
    }

    return Array.from(uniqueOptions).sort();
  } catch (error) {
    Logger.log("Error en getUniqueOptions: " + error.message);
    throw error;
  }
}

// Función para convertir fechas en formato ISO 8601 o manejar "N/A"
function parseISODate(dateString) {
  if (!dateString || dateString.trim().toUpperCase() === "N/A") {
    return null;
  }
  try {
    return new Date(dateString);
  } catch (e) {
    Logger.log(`Error al convertir la fecha: ${dateString}`);
    return null;
  }
}

// Función para calcular los KPIs
function calculateKPIs(data, columnNames) {
  Logger.log("Calculando KPIs...");
  Logger.log("Número de filas procesadas: " + data.length);

  let ticketsTotales = 0;
  let ticketsResueltos = 0;
  let reparacionesExitosas = 0;
  let reparacionesTotales = 0;
  let ingresosGenerados = 0;
  let clientesUnicos = new Set();

  let tiempoRespuestaInicialTotal = 0;
  let tiempoValidacionGarantiaTotal = 0;
  let tiempoResolucionTotal = 0;
  let reparacionesCubiertas = 0;
  let reparacionesNoCubiertas = 0;
  let costosGarantiaTotal = 0;
  let satisfaccionTotal = 0;
  let encuestasRespondidas = 0;

  const statusIndex = columnNames.indexOf("status");
  const reparacionIndex = columnNames.indexOf("estado de la reparación");
  const ingresosIndex = columnNames.indexOf("ingresos generados");
  const clienteIndex = columnNames.indexOf("cliente");
  const createdAtIndex = columnNames.indexOf("created at");
  const fechaReporteIndex = columnNames.indexOf("fecha de reporte");
  const fechaValidacionGarantiaIndex = columnNames.indexOf("fecha de validación de garantía");
  const fechaResolucionIndex = columnNames.indexOf("fecha de resolución");
  const cubiertoGarantiaIndex = columnNames.indexOf("cubierto por garantía");
  const costoGarantiaIndex = columnNames.indexOf("costo de garantía");
  const satisfaccionIndex = columnNames.indexOf("satisfacción del cliente");

  data.forEach((row, index) => {
    try {
      const status = row[statusIndex] || "Incomplete";
      const estadoReparacion = row[reparacionIndex] || "PENDIENTE";
      const ingresos = parseFloat(row[ingresosIndex] || 0);
      const cliente = row[clienteIndex];
      const createdAt = parseISODate(row[createdAtIndex]);
      const fechaReporte = parseISODate(row[fechaReporteIndex]);
      const fechaValidacionGarantia = parseISODate(row[fechaValidacionGarantiaIndex]);
      const fechaResolucion = parseISODate(row[fechaResolucionIndex]);
      const cubiertoGarantia = row[cubiertoGarantiaIndex];
      const costoGarantia = parseFloat(row[costoGarantiaIndex] || 0);
      const satisfaccion = parseFloat(row[satisfaccionIndex] || 0);

      ticketsTotales++;
      if (status === "Complete") ticketsResueltos++;
      if (estadoReparacion === "EXITOSA") reparacionesExitosas++;
      if (estadoReparacion) reparacionesTotales++;
      ingresosGenerados += isNaN(ingresos) ? 0 : ingresos;
      if (cliente) clientesUnicos.add(cliente);

      if (fechaReporte && createdAt) {
        tiempoRespuestaInicialTotal += (createdAt - fechaReporte) / (1000 * 60 * 60);
      }
      if (createdAt && fechaValidacionGarantia) {
        tiempoValidacionGarantiaTotal += (fechaValidacionGarantia - createdAt) / (1000 * 60 * 60);
      }
      if (createdAt && fechaResolucion) {
        tiempoResolucionTotal += (fechaResolucion - createdAt) / (1000 * 60 * 60);
      }
      if (cubiertoGarantia === "Sí") {
        reparacionesCubiertas++;
      } else if (cubiertoGarantia === "No") {
        reparacionesNoCubiertas++;
      }
      costosGarantiaTotal += isNaN(costoGarantia) ? 0 : costoGarantia;
      if (!isNaN(satisfaccion)) {
        satisfaccionTotal += satisfaccion;
        encuestasRespondidas++;
      }
    } catch (error) {
      Logger.log(`Error al procesar la fila ${index + 1}: ${error.message}`);
    }
  });

  const tasaResolucion = (ticketsResueltos / ticketsTotales) * 100 || 0;
  const tasaExitoReparaciones = (reparacionesExitosas / reparacionesTotales) * 100 || 0;
  const tiempoRespuestaInicialPromedio = tiempoRespuestaInicialTotal / ticketsTotales || 0;
  const tiempoValidacionGarantiaPromedio = tiempoValidacionGarantiaTotal / ticketsTotales || 0;
  const tiempoResolucionPromedio = tiempoResolucionTotal / ticketsTotales || 0;
  const porcentajeReparacionesCubiertas = (reparacionesCubiertas / (reparacionesCubiertas + reparacionesNoCubiertas)) * 100 || 0;
  const satisfaccionPromedio = satisfaccionTotal / encuestasRespondidas || 0;

  Logger.log("KPIs calculados exitosamente.");
  return {
    tasaResolucion,
    tasaExitoReparaciones,
    ingresosGenerados,
    ticketsTotales,
    clientesUnicos: clientesUnicos.size,
    tiempoRespuestaInicialPromedio,
    tiempoValidacionGarantiaPromedio,
    tiempoResolucionPromedio,
    porcentajeReparacionesCubiertas,
    costosGarantiaTotal,
    satisfaccionPromedio
  };
}
