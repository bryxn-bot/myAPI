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
const Venta = require('./models/venta');
const DetalleVenta = require('./models/detalleventa');
const { Op } = require('sequelize');

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

// Ventas
Usuario.hasMany(Venta, { foreignKey: 'usuarioId' });
Venta.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

Venta.hasMany(DetalleVenta, { foreignKey: 'ventaId', as: 'detalle' });
DetalleVenta.belongsTo(Venta, { foreignKey: 'ventaId' });

Producto.hasMany(DetalleVenta, { foreignKey: 'productoId' });
DetalleVenta.belongsTo(Producto, { foreignKey: 'productoId', as: 'producto' });

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

// --- RUTAS PARA VENTAS (PUNTO DE VENTA) ---

// Historial de ventas
app.get('/ventas', async (req, res) => {
    try {
        const ventas = await Venta.findAll({
            include: [
                { model: DetalleVenta, as: 'detalle',
                  include: [{ model: Producto, as: 'producto', attributes: ['id', 'nombre'] }] },
                { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] }
            ],
            order: [['createdAt', 'DESC']]
        });
        res.json(ventas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Registrar venta: venta + detalle + descuento de stock + salida en kardex (UNA transacción)
app.post('/ventas', async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { items, metodoPago, montoRecibido } = req.body; // items: [{ productoId, cantidad }]

        if (!Array.isArray(items) || items.length === 0) {
            throw new Error('El carrito está vacío');
        }

        // Unir productos repetidos
        const carrito = {};
        for (const it of items) {
            const cant = parseInt(it.cantidad);
            if (!cant || cant <= 0) throw new Error('Cantidad inválida');
            carrito[it.productoId] = (carrito[it.productoId] || 0) + cant;
        }

        let total = 0;
        const lineas = [];

        for (const [productoId, cant] of Object.entries(carrito)) {
            const producto = await Producto.findByPk(productoId, {
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            if (!producto) throw new Error('Producto no encontrado');

            const stockActual = producto.stock || 0;
            if (cant > stockActual) {
                throw new Error(`Stock insuficiente de ${producto.nombre} (quedan ${stockActual})`);
            }

            const precio = Number(producto.precio); // el precio sale de la BD, no del frontend
            const subtotal = +(precio * cant).toFixed(2);
            total += subtotal;
            lineas.push({ producto, cant, precio, subtotal, stockActual });
        }
        total = +total.toFixed(2);

        const metodo = metodoPago || 'Efectivo';
        if (metodo === 'Efectivo' && montoRecibido != null && Number(montoRecibido) < total) {
            throw new Error('El monto recibido es menor al total');
        }

        const venta = await Venta.create({
            total,
            metodoPago: metodo,
            montoRecibido: metodo === 'Efectivo' ? montoRecibido : null,
            usuarioId: req.usuario.id
        }, { transaction: t });

        for (const l of lineas) {
            await DetalleVenta.create({
                ventaId: venta.id,
                productoId: l.producto.id,
                cantidad: l.cant,
                precioUnitario: l.precio,
                subtotal: l.subtotal
            }, { transaction: t });

            await l.producto.update({ stock: l.stockActual - l.cant }, { transaction: t });

            await Movimiento.create({
                productoId: l.producto.id,
                usuarioId: req.usuario.id,
                tipo_movimiento: 'Salida',
                cantidad: l.cant,
                observaciones: `Venta #${venta.id}`
            }, { transaction: t });
        }

        await t.commit();
        res.json({ id: venta.id, total });
    } catch (error) {
        await t.rollback();
        res.status(400).json({ error: error.message });
    }
});

// Reporte del día (por defecto hoy, hora de Perú) + lista de ventas de ese día
app.get('/ventas/reporte', async (req, res) => {
    try {
        const fecha = req.query.fecha || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
        const desde = new Date(`${fecha}T00:00:00-05:00`);
        const hasta = new Date(`${fecha}T23:59:59.999-05:00`);
        if (isNaN(desde)) throw new Error('Fecha inválida');

        const ventas = await Venta.findAll({
            where: { createdAt: { [Op.between]: [desde, hasta] } },
            include: [
                { model: DetalleVenta, as: 'detalle',
                  include: [{ model: Producto, as: 'producto', attributes: ['id', 'nombre'] }] },
                { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] }
            ],
            order: [['createdAt', 'DESC']]
        });

        // Las anuladas no suman al reporte
        const validas = ventas.filter(v => v.estado === 'Completada');
        const totalVendido = validas.reduce((s, v) => s + Number(v.total), 0);

        const porMetodo = {};
        const porProducto = {};
        for (const v of validas) {
            const m = porMetodo[v.metodoPago] ||= { metodoPago: v.metodoPago, cantidad: 0, total: 0 };
            m.cantidad += 1;
            m.total += Number(v.total);

            for (const d of v.detalle) {
                const nombre = d.producto?.nombre || `Producto ${d.productoId}`;
                const p = porProducto[nombre] ||= { nombre, unidades: 0, total: 0 };
                p.unidades += d.cantidad;
                p.total += Number(d.subtotal);
            }
        }

        res.json({
            fecha,
            cantidadVentas: validas.length,
            anuladas: ventas.length - validas.length,
            totalVendido,
            ticketPromedio: validas.length ? totalVendido / validas.length : 0,
            porMetodo: Object.values(porMetodo),
            topProductos: Object.values(porProducto).sort((a, b) => b.unidades - a.unidades).slice(0, 5),
            ventas
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ===== IMPORTAR PRODUCTOS DESDE EXCEL =====
app.post('/productos/importar', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'Administrador') {
    return res.status(403).json({ error: 'Solo el Administrador puede importar' });
  }
  const filas = req.body.productos;
  if (!Array.isArray(filas) || !filas.length) {
    return res.status(400).json({ error: 'El archivo no tiene filas' });
  }

  const resultado = { creados: 0, categoriasNuevas: 0, omitidos: [] };
  const t = await sequelize.transaction();
  try {
    const cacheCategorias = {};

    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      const fila = i + 2; // fila real en Excel (la 1 es el encabezado)
      const nombre = String(f.nombre || '').trim();
      const precio = Number(f.precio);
      const stock = parseInt(f.stock) || 0;
      const codigo = f.codigoBarras ? String(f.codigoBarras).trim() : null;
      const catNombre = String(f.categoria || '').trim();

      if (!nombre || isNaN(precio) || precio < 0) {
        resultado.omitidos.push(`Fila ${fila}: nombre o precio inválido`);
        continue;
      }
      if (!catNombre) {
        resultado.omitidos.push(`Fila ${fila} (${nombre}): sin categoría`);
        continue;
      }
      if (codigo) {
        const dup = await Producto.findOne({ where: { codigoBarras: codigo }, transaction: t });
        if (dup) {
          resultado.omitidos.push(`Fila ${fila} (${nombre}): el código ${codigo} ya existe`);
          continue;
        }
      }

      // Busca la categoría por nombre; si no existe, la crea
      const clave = catNombre.toLowerCase();
      if (!cacheCategorias[clave]) {
        const [cat, creada] = await Categoria.findOrCreate({
          where: { nombre: catNombre },
          defaults: { nombre: catNombre },
          transaction: t,
        });
        if (creada) resultado.categoriasNuevas++;
        cacheCategorias[clave] = cat.id;
      }

      await Producto.create(
        { nombre, precio, stock, codigoBarras: codigo, categoriaId: cacheCategorias[clave] },
        { transaction: t }
      );
      resultado.creados++;
    }

    await t.commit();
    res.json(resultado);
  } catch (e) {
    await t.rollback();
    console.error(e);
    res.status(500).json({ error: 'Error al importar: ' + e.message });
  }
});

// ===== EXPORTAR HISTORIAL DE VENTAS (para Excel) =====
app.get('/ventas/exportar', verificarToken, async (req, res) => {
  if (req.usuario.rol !== 'Administrador') {
    return res.status(403).json({ error: 'Solo el Administrador puede exportar' });
  }
  try {
    const { desde, hasta } = req.query; // formato YYYY-MM-DD, opcionales
    const where = {};
    const rango = {};
    if (desde) rango[Op.gte] = new Date(`${desde}T00:00:00-05:00`);
    if (hasta) rango[Op.lte] = new Date(`${hasta}T23:59:59.999-05:00`);
    if (desde || hasta) where.createdAt = rango;

    const ventas = await Venta.findAll({
      where,
      include: [
        { model: Usuario, as: 'usuario', attributes: ['nombre'] },
        {
          model: DetalleVenta,
          as: 'detalle',
          include: [{ model: Producto, as: 'producto', attributes: ['nombre', 'codigoBarras'] }],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    const fmt = (d) => new Date(d).toLocaleString('es-PE', { timeZone: 'America/Lima' });

    const resumen = [];
    const detalle = [];
    for (const v of ventas) {
      resumen.push({
        venta: v.id,
        fecha: fmt(v.createdAt),
        vendedor: v.usuario?.nombre || '',
        metodoPago: v.metodoPago,
        total: Number(v.total),
        estado: v.estado,
        motivoAnulacion: v.motivoAnulacion || '',
      });
      for (const d of v.detalle || []) {
        detalle.push({
          venta: v.id,
          fecha: fmt(v.createdAt),
          producto: d.producto?.nombre || '',
          codigoBarras: d.producto?.codigoBarras || '',
          cantidad: d.cantidad,
          precioUnitario: Number(d.precioUnitario),
          subtotal: Number(d.subtotal),
          estado: v.estado,
        });
      }
    }
    res.json({ resumen, detalle });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al exportar' });
  }
});

// Anular venta (solo Administrador): devuelve stock y registra Entrada en el kardex
app.put('/ventas/:id/anular', async (req, res) => {
    const t = await sequelize.transaction();
    try {
        if (req.usuario.rol !== 'Administrador') {
            throw new Error('Solo el administrador puede anular ventas');
        }

        const venta = await Venta.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!venta) throw new Error('Venta no encontrada');
        if (venta.estado === 'Anulada') throw new Error('La venta ya está anulada');

        const detalle = await DetalleVenta.findAll({ where: { ventaId: venta.id }, transaction: t });

        for (const d of detalle) {
            const producto = await Producto.findByPk(d.productoId, { transaction: t, lock: t.LOCK.UPDATE });
            if (producto) {
                await producto.update({ stock: (producto.stock || 0) + d.cantidad }, { transaction: t });
            }
            await Movimiento.create({
                productoId: d.productoId,
                usuarioId: req.usuario.id,
                tipo_movimiento: 'Entrada',
                cantidad: d.cantidad,
                observaciones: `Anulación de Venta #${venta.id}`
            }, { transaction: t });
        }

        await venta.update({
            estado: 'Anulada',
            anuladaAt: new Date(),
            anuladaPor: req.usuario.id,
            motivoAnulacion: req.body.motivo || null
        }, { transaction: t });

        await t.commit();
        res.json({ message: 'Venta anulada' });
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