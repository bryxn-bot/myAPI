const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Usuario = sequelize.define('Usuario', {
    nombre: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    rol: {
        type: DataTypes.ENUM('Administrador', 'trabajador'),
        defaultValue: 'trabajador'
    }
}, {
    tableName: 'usuarios',
    timestamps: true // Crea automaticamente createdAt y updatedAt
});

module.exports = Usuario;