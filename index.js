require('dotenv').config();

const express = require('express');
const cors = require('cors');
const sequelize = require('./config/db');


// Importar modelos para que Sequelize los registre.
const Producto = require('./models/Producto');

const app = express();

// ----- MIDOLEWARES----
// Habilitar cors para permitir peticiones desde el frontend (react)
app.use(cors());
//Pasar el body de las peticiones a JSON
app.use(express.json());

// ..... RUTAS BASICAS DE PRUEBA .....
app.get('/',(req, res) => {
    res.send('¡API Backend funcionando exitosamente!');
})

const PORT = process.env.PORT || 3010;

sequelize.sync({ force: false })
    .then(() => {
        console.log('Base de datos conectada y sincronizada.');

        app.listen(PORT, () => {
            console.log(`Servidor corriendo en http://localhost:${PORT}`);
        });
    })
    .catch(error => {
        console.error('Error al conectar con la base de datos:', error);
    });