require('dotenv').config();

const express = require('express');
const cors = require('cors');
const sequelize = require('./config/db');

// Importar modelos para que Sequelize los registre.
const Producto = require('./models/Producto');
const Categoria = require('./models/categoria');
const Proveedor = require('./models/proveedor');
const Usuario = require('./models/usuario');
const bcrypt = require('bcryptjs');
const Movimiento = require('./models/movimientos');
const jwt = require('jsonwebtoken');

const app = express();

// ----- RELACIONES -----
// Una categoría tiene muchos productos
Categoria.hasMany(Producto, { foreignKey: 'categoriaId' });
Producto.belongsTo(Categoria, { foreignKey: 'categoriaId', as: 'categoria' });

// Un proveedor tiene muchos productos
Proveedor.hasMany(Producto, { foreignKey: 'proveedorId' });
Producto.belongsTo(Proveedor, { foreignKey: 'proveedorId', as: 'proveedor' });

// Un producto y un usuario tienen muchos movimientos
Producto.hasMany(Movimiento, { foreignKey: 'productoId' });
Movimiento.belongsTo(Producto, { foreignKey: 'productoId', as: 'producto' });

Usuario.hasMany(Movimiento, { foreignKey: 'usuarioId' });
Movimiento.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

// ----- MIDDLEWARES -----
// Habilitar cors para permitir peticiones desde el frontend (react)
app.use(cors());

// Pasar el body de las peticiones a JSON
app.use(express.json());

// ..... RUTAS BASICAS DE PRUEBA .....
app.get('/', (req, res) => {
    res.send('¡API Backend funcionando exitosamente!');
});


// -------------------------------------------------------------
// --- LOGIN (ruta pública) ---
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const usuario = await Usuario.findOne({ where: { email } });
        if (!usuario) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        const coincide = await bcrypt.compare(password, usuario.password);
        if (!coincide) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        const token = jwt.sign(
            { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            token,
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                email: usuario.email,
                rol: usuario.rol
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- MIDDLEWARE: protege todas las rutas que van DEBAJO de esto ---
const verificarToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token requerido' });
    }

    try {
        req.usuario = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token inválido o vencido' });
    }
};

app.use(verificarToken);

// --- CONFIGURACION: perfil del usuario en sesión ---

app.put('/perfil', async (req, res) => {
    try {
        const { nombre } = req.body;
        if (!nombre || !nombre.trim()) {
            throw new Error('El nombre es obligatorio');
        }
        await Usuario.update(
            { nombre: nombre.trim() },
            { where: { id: req.usuario.id } }
        );
        const usuario = await Usuario.findByPk(req.usuario.id, {
            attributes: { exclude: ['password'] }
        });
        res.json(usuario);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/perfil/password', async (req, res) => {
    try {
        const { passwordActual, passwordNueva } = req.body;

        if (!passwordNueva || passwordNueva.length < 6) {
            throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
        }

        const usuario = await Usuario.findByPk(req.usuario.id);
        const coincide = await bcrypt.compare(passwordActual, usuario.password);
        if (!coincide) {
            throw new Error('La contraseña actual es incorrecta');
        }

        usuario.password = await bcrypt.hash(passwordNueva, 10);
        await usuario.save();
        res.json({ message: 'Contraseña actualizada' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ------------------------------------------------------------
// --- RUTAS CRUD PARA PRODUCTOS ---

// 1. POST: Crear un nuevo producto
app.post('/productos', async (req, res) => {
    try {
        const nuevoProducto = await Producto.create(req.body);
        res.json(nuevoProducto);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. GET: Obtener todos los productos (con su categoría)
app.get('/productos', async (req, res) => {
    try {
        const productos = await Producto.findAll({
            include: [{ model: Categoria, as: 'categoria' },
                      {model: Proveedor, as: 'proveedor'}
            ]
        });
        res.json(productos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. PUT: Actualizar un producto existente
app.put('/productos/:id', async (req, res) => {
    try {
        await Producto.update(req.body, {
            where: { id: req.params.id }
        });
        res.json({ message: 'Producto actualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. DELETE: Eliminar un producto
app.delete('/productos/:id', async (req, res) => {
    try {
        await Producto.destroy({
            where: { id: req.params.id }
        });
        res.json({ message: 'Producto eliminado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- RUTAS CRUD PARA CATEGORIAS ---

app.get('/categorias', async (req, res) => {
    try {
        const categorias = await Categoria.findAll();
        res.json(categorias);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/categorias', async (req, res) => {
    try {
        const nuevaCategoria = await Categoria.create(req.body);
        res.json(nuevaCategoria);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/categorias/:id', async (req, res) => {
    try {
        await Categoria.update(req.body, {
            where: { id: req.params.id }
        });
        res.json({ message: 'Categoría actualizada' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/categorias/:id', async (req, res) => {
    try {
        await Categoria.destroy({
            where: { id: req.params.id }
        });
        res.json({ message: 'Categoría eliminada' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- RUTAS CRUD PARA PROVEEDORES ---

app.get('/proveedores', async (req, res) => {
    try {
        const proveedores = await Proveedor.findAll();
        res.json(proveedores);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/proveedores', async (req, res) => {
    try {
        const nuevoProveedor = await Proveedor.create(req.body);
        res.json(nuevoProveedor);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/proveedores/:id', async (req, res) => {
    try {
        await Proveedor.update(req.body, {
            where: { id: req.params.id }
        });
        res.json({ message: 'Proveedor actualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/proveedores/:id', async (req, res) => {
    try {
        await Proveedor.destroy({
            where: { id: req.params.id }
        });
        res.json({ message: 'Proveedor eliminado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- RUTAS CRUD PARA USUARIOS ---

// La contraseña nunca se devuelve al frontend
app.get('/usuarios', async (req, res) => {
    try {
        const usuarios = await Usuario.findAll({
            attributes: { exclude: ['password'] }
        });
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// La contraseña se guarda encriptada
app.post('/usuarios', async (req, res) => {
    try {
        const passwordEncriptada = await bcrypt.hash(req.body.password, 10);
        const nuevoUsuario = await Usuario.create({
            ...req.body,
            password: passwordEncriptada
        });
        res.json({
            id: nuevoUsuario.id,
            nombre: nuevoUsuario.nombre,
            email: nuevoUsuario.email,
            rol: nuevoUsuario.rol
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Si no se envía contraseña, se mantiene la actual
app.put('/usuarios/:id', async (req, res) => {
    try {
        const datos = { ...req.body };
        if (datos.password) {
            datos.password = await bcrypt.hash(datos.password, 10);
        } else {
            delete datos.password;
        }
        await Usuario.update(datos, {
            where: { id: req.params.id }
        });
        res.json({ message: 'Usuario actualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/usuarios/:id', async (req, res) => {
    try {
        await Usuario.destroy({
            where: { id: req.params.id }
        });
        res.json({ message: 'Usuario eliminado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- RUTAS PARA MOVIMIENTOS (KARDEX) ---

// Historial de movimientos, del más reciente al más antiguo
app.get('/movimientos', async (req, res) => {
    try {
        const movimientos = await Movimiento.findAll({
            include: [
                { model: Producto, as: 'producto', attributes: ['id', 'nombre'] },
                { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] }
            ],
            order: [['fecha_hora', 'DESC']]
        });
        res.json(movimientos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Registrar movimiento + actualizar stock en UNA transacción
app.post('/movimientos', async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { productoId, usuarioId, tipo_movimiento, cantidad, observaciones } = req.body;
        const cant = parseInt(cantidad);

        if (!cant || cant <= 0) {
            throw new Error('La cantidad debe ser mayor a 0');
        }

        const producto = await Producto.findByPk(productoId, {
            transaction: t,
            lock: t.LOCK.UPDATE
        });
        if (!producto) {
            throw new Error('Producto no encontrado');
        }

        let nuevoStock = producto.stock;

        if (tipo_movimiento === 'Entrada') {
            nuevoStock += cant;
        } else if (tipo_movimiento === 'Salida') {
            if (cant > producto.stock) {
                throw new Error('Stock insuficiente para esta salida');
            }
            nuevoStock -= cant;
        } else if (tipo_movimiento === 'Ajuste') {
            nuevoStock = cant; // El ajuste fija el stock real contado
        } else {
            throw new Error('Tipo de movimiento no válido');
        }

        const movimiento = await Movimiento.create({
            productoId,
            usuarioId,
            tipo_movimiento,
            cantidad: cant,
            observaciones
        }, { transaction: t });

        await producto.update({ stock: nuevoStock }, { transaction: t });

        await t.commit();
        res.json(movimiento);
    } catch (error) {
        await t.rollback();
        res.status(400).json({ error: error.message });
    }
});

// ----- ARRANQUE DEL SERVIDOR -----
const PORT = process.env.PORT || 3001;

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