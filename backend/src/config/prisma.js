const { PrismaClient } = require('../../../database/generated/client');

const prisma = new PrismaClient();

module.exports = prisma;
