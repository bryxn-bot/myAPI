const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Venta = sequelize.define('Venta', {
  total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  metodoPago: { type: DataTypes.ENUM('Efectivo', 'Yape', 'Plin', 'Tarjeta'), defaultValue: 'Efectivo' },
  estado: { type: DataTypes.ENUM('Completada', 'Anulada'), defaultValue: 'Completada' },
  anuladaAt: DataTypes.DATE,
  anuladaPor: DataTypes.INTEGER,
  motivoAnulacion: DataTypes.STRING,
  montoRecibido: DataTypes.DECIMAL(10, 2),
  usuarioId: DataTypes.INTEGER,
}, { tableName: 'ventas' });

module.exports = Venta;