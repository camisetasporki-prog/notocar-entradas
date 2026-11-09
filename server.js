const express = require("express");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// =====================================================
// CONFIGURACIÓN
// =====================================================

// Durante el desarrollo dejamos esto en true.
// Cuando terminemos y publiquemos el sistema:
// MODO_PRUEBA = false
const MODO_PRUEBA = false;

// El evento es el 14 de noviembre de 2026
const FECHA_SHOW = "14/11/2026";

// Entradas utilizadas durante las pruebas.
// No modifica la base de datos real.
const pruebasUsadas = new Set();


// =====================================================
// BASE DE DATOS
// =====================================================

const db = new Database("entradas.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS entradas (
        numero INTEGER PRIMARY KEY,
        codigo TEXT UNIQUE NOT NULL,
        nombre TEXT DEFAULT '',
        telefono TEXT DEFAULT '',
        tipo TEXT DEFAULT '',
        precio TEXT DEFAULT '',
        estado TEXT DEFAULT 'VALIDO',
        fecha TEXT DEFAULT '',
        formato TEXT DEFAULT ''
    );
`);
// Agregar columnas que puedan faltar en bases de datos creadas anteriormente
const columnas = db
    .prepare(`PRAGMA table_info(entradas)`)
    .all()
    .map(columna => columna.name);

if (!columnas.includes("telefono")) {
    db.exec(`ALTER TABLE entradas ADD COLUMN telefono TEXT DEFAULT ''`);
}

if (!columnas.includes("formato")) {
    db.exec(`ALTER TABLE entradas ADD COLUMN formato TEXT DEFAULT ''`);
}

// =====================================================
// CARGAR LOS 214 CÓDIGOS
// =====================================================

if (fs.existsSync("codigos.txt")) {

    const codigos = fs
        .readFileSync("codigos.txt", "utf8")
        .split(/\r?\n/)
        .map(codigo => codigo.trim())
        .filter(codigo => codigo !== "");

    const insertar = db.prepare(`
        INSERT OR IGNORE INTO entradas
        (numero, codigo, nombre, telefono, tipo, precio, estado)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const cargarEntradas = db.transaction(() => {

        codigos.forEach((codigo, indice) => {

            const numero = indice + 1;

            // Las primeras 50 son preventa
            const tipo = numero <= 50 ? "Preventa" : "General";

            const precio = numero <= 50 ? "9000" : "12000";

            insertar.run(
                numero,
                codigo,
                "",
                "",
                tipo,
                precio,
                "VALIDO"
            );
        });
    });

    cargarEntradas();

    // CORRECCIÓN TEMPORAL DE LA ENTRADA #1
db.prepare(`
    UPDATE entradas
    SET nombre = '',
        telefono = '',
        tipo = '',
        precio = '9000',
        estado = 'VALIDO',
        fecha = '',
        formato = ''
    WHERE numero = 1
`).run();

    console.log(`${codigos.length} códigos encontrados en codigos.txt`);
}


// =====================================================
// ARCHIVOS DE LA PÁGINA
// =====================================================

app.use(express.json());

app.use(express.static(
    path.join(__dirname, "public")
));


// =====================================================
// PÁGINA PRINCIPAL
// =====================================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );

});


// =====================================================
// VALIDAR ENTRADA
// =====================================================

app.get("/api/validar/:codigo", (req, res) => {

    const codigo = req.params.codigo
        .toUpperCase()
        .trim();


    // -------------------------------------------------
    // BUSCAR ENTRADA
    // -------------------------------------------------

    const entrada = db
        .prepare(`
            SELECT *
            FROM entradas
            WHERE codigo = ?
        `)
        .get(codigo);


    // -------------------------------------------------
    // SI NO EXISTE
    // -------------------------------------------------

    if (!entrada) {

        return res.json({
            valida: false,
            motivo: "NO_EXISTE",
            mensaje: "ENTRADA INVÁLIDA"
        });

    }


    // -------------------------------------------------
    // MODO PRUEBA
    // -------------------------------------------------

   if (MODO_PRUEBA) {

    // ---------------------------------------------
    // SI YA FUE USADA DURANTE LA PRUEBA
    // ---------------------------------------------

    if (pruebasUsadas.has(codigo)) {

        return res.json({

            valida: false,

            motivo: "USADO",

            mensaje: "ENTRADA YA UTILIZADA",

            modoPrueba: true,

            entrada: {
                numero: entrada.numero,
                codigo: entrada.codigo,
                nombre: entrada.nombre,
                tipo: entrada.tipo,
                precio: entrada.precio,
                estado: "USADO"
            }

        });

    }


    // ---------------------------------------------
    // PRIMERA VEZ QUE SE ESCANEA
    // ---------------------------------------------

    pruebasUsadas.add(codigo);

    return res.json({

        valida: true,

        motivo: "PRUEBA",

        mensaje: "ENTRADA VÁLIDA",

        modoPrueba: true,

        entrada: {
            numero: entrada.numero,
            codigo: entrada.codigo,
            nombre: entrada.nombre,
            tipo: entrada.tipo,
            precio: entrada.precio,
            estado: "USADO",
            fecha: new Date().toISOString()
        }

    });

}


    // -------------------------------------------------
    // FECHA REAL DEL SHOW
    // -------------------------------------------------

    const fechaArgentina = new Intl.DateTimeFormat("es-AR", {
        timeZone: "America/Argentina/Catamarca",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }).format(new Date());


    if (fechaArgentina.split("/").reverse().join("-") < "2026-11-14") {
    return res.json({
        valida: false,
        motivo: "NO_HABILITADA",
        mensaje: "LA VALIDACIÓN TODAVÍA NO ESTÁ HABILITADA",
        fecha: fechaArgentina
    });
}


    // -------------------------------------------------
    // YA UTILIZADA
    // -------------------------------------------------

    if (entrada.estado === "USADO") {

        return res.json({
            valida: false,
            motivo: "USADO",
            mensaje: "ENTRADA YA UTILIZADA",

            entrada: {
                numero: entrada.numero,
                codigo: entrada.codigo,
                nombre: entrada.nombre,
                fecha: entrada.fecha
            }
        });

    }


    // -------------------------------------------------
    // MARCAR COMO USADA
    // -------------------------------------------------

    const fecha = new Date().toISOString();

    const resultado = db.prepare(`
        UPDATE entradas

        SET estado = 'USADO',
            fecha = ?

        WHERE codigo = ?

        AND estado = 'VALIDO'
    `).run(
        fecha,
        codigo
    );


    // -------------------------------------------------
    // VALIDACIÓN EXITOSA
    // -------------------------------------------------

    if (resultado.changes === 1) {

        return res.json({

            valida: true,

            motivo: "VALIDA",

            mensaje: "ENTRADA VÁLIDA",

            entrada: {
                numero: entrada.numero,
                codigo: entrada.codigo,
                nombre: entrada.nombre,
                tipo: entrada.tipo,
                precio: entrada.precio,
                estado: "USADO",
                fecha: fecha
            }

        });

    }


    // -------------------------------------------------
    // OTRO CELULAR LA USÓ PRIMERO
    // -------------------------------------------------

    const actualizada = db
        .prepare(`
            SELECT *
            FROM entradas
            WHERE codigo = ?
        `)
        .get(codigo);


    return res.json({

        valida: false,

        motivo: "USADO",

        mensaje: "ENTRADA YA UTILIZADA",

        entrada: actualizada

    });

});


// =====================================================
// ESTADÍSTICAS
// =====================================================

app.get("/api/estadisticas", (req, res) => {
    const total = db.prepare("SELECT COUNT(*) AS total FROM entradas").get().total;

    let usadas;

    if (MODO_PRUEBA) {
        usadas = pruebasUsadas.size;
    } else {
        usadas = db.prepare("SELECT COUNT(*) AS usadas FROM entradas WHERE estado = 'USADO'").get().usadas;
    }

    const disponibles = total - usadas;

    res.json({
        total,
        usadas,
        disponibles
    });
});

// =====================================================
// LISTAR ENTRADAS
// =====================================================

app.get("/api/entradas", (req, res) => {
    const entradas = db.prepare("SELECT * FROM entradas ORDER BY numero").all();

    if (MODO_PRUEBA) {
        for (const entrada of entradas) {
            if (pruebasUsadas.has(entrada.codigo)) {
                entrada.estado = "USADO";
            } else {
                entrada.estado = "VALIDO";
            }
        }
    }

    res.json(entradas);
});

// =====================================================
// PANEL DE ADMINISTRACIÓN
// =====================================================

app.get("/admin", (req, res) => {

    res.sendFile(
        path.join(__dirname, "public", "admin.html")
    );

});

// =====================================================
// PÁGINA DEL ESCÁNER QR
// =====================================================

app.get("/scanner", (req, res) => {

    res.sendFile(
        path.join(__dirname, "public", "scanner.html")
    );

});

// =====================================================
// PÁGINA DE VALIDACIÓN
// =====================================================

app.get("/validar/:codigo", (req, res) => {

    res.sendFile(
        path.join(__dirname, "public", "validar.html")
    );

});


// =====================================================
// INICIAR SERVIDOR
// =====================================================

app.listen(PORT, () => {

    console.log(
        `Servidor funcionando en http://localhost:${PORT}`
    );

});
