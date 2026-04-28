require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User.model");
const logger = require("./logger");

const seedSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info("Connected to MongoDB for seeding");

    const email = process.env.SUPER_ADMIN_EMAIL.trim();

    // 1. Force delete any existing user with this email
    // This removes the "duplicate" before it can cause an error
    await User.deleteOne({ email: email });
    logger.info(`Cleared any existing user with email: ${email}`);

    // 2. Now create the fresh Super Admin
    await User.create({
      email: email,
      password: process.env.SUPER_ADMIN_PASSWORD,
      role: "super_admin",
      firstName: process.env.SUPER_ADMIN_FIRST_NAME,
      lastName: process.env.SUPER_ADMIN_LAST_NAME,
      isFirstLogin: false,
      status: "active",
    });

    logger.info(`Super Admin created successfully: ${email}`);
    process.exit(0);
  } catch (err) {
    // If it STILL fails here, your MongoDB index might be case-sensitive or corrupted
    logger.error(`Seed failed: ${err.message}`);
    process.exit(1);
  }
};
